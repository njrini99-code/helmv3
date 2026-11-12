-- golf_players / golf_coaches: e-mail and phone stop being readable through the tables (security review 2026-11-11, finding 1).
--
-- The leak (reproduced on the local release rehearsal, 2026-11-11): `authenticated` holds table-wide SELECT on both tables, and
-- the row policies decide only WHICH rows. golf_players_select still has its teammate branch (20261017005000, which drops it, is
-- deferred because Clubhouse reads teammates' rows), and golf_coaches_select lets every member of an organization read every
-- coach row in it. So any signed-in player (many are minors) could call PostgREST directly and read every teammate's e-mail and
-- phone, and every coach's in the organization:
--   GET /rest/v1/golf_players?select=first_name,last_name,email,phone
--
-- Now:
--   1. Table-wide SELECT on both tables is revoked from `authenticated` and granted again on every column EXCEPT email and phone.
--      Which rows a user sees is unchanged (the row policies are untouched). A `select('*')` or an embed `golf_players(*)` from a
--      signed-in session now fails with "permission denied"; every such call in src/ was changed in the same branch to name its
--      columns.
--   2. public.golf_player_contacts(uuid[]) returns id, email and phone of the players the caller may contact: their own row, a
--      player active or inactive on a team the caller is staffed on, and a player with a pending join request to such a team
--      (today's coach reach, without the teammate branch). SECURITY DEFINER, search_path ''. A player gets only their own row.
--   No coach-contact function: no signed-in read in the app needs another coach's e-mail or phone (pending coaches and staff
--   lists read through the service role), and a user's own e-mail comes from auth.
--
-- Not changed: anon (RLS gives anon no rows), service_role (keeps every privilege), INSERT/UPDATE privileges (a profile save
-- still writes phone), and the Baseball and Lift Lab tables.
--
-- Trade-off, recorded in HELD.md: a column added to either table later is NOT readable by `authenticated` until it is granted.
-- A migration that adds a column must add `GRANT SELECT (<column>) ON ... TO authenticated` unless the column is private.
--
-- Locks: REVOKE/GRANT on a table takes ACCESS EXCLUSIVE briefly; both tables are read by most Golf policies, so the timeout is
-- short and the file is safe to run again after a timeout.
--
-- Rollback (restores today's exposure):
--   REVOKE SELECT ON public.golf_players FROM authenticated; GRANT SELECT ON public.golf_players TO authenticated;
--   REVOKE SELECT ON public.golf_coaches FROM authenticated; GRANT SELECT ON public.golf_coaches TO authenticated;
--   DROP FUNCTION IF EXISTS public.golf_player_contacts(uuid[]);
--   (The app works after a rollback: its contact reads fall back to the table when the function is missing.)
--
-- pgTAP: supabase/tests/rls/golf_players_coaches_contact_columns.sql
--
-- VERIFY: select 1 where not has_column_privilege('authenticated', 'public.golf_players', 'email', 'SELECT') and not has_column_privilege('authenticated', 'public.golf_players', 'phone', 'SELECT'); -- noqa: LT05
-- VERIFY: select 1 where not has_column_privilege('authenticated', 'public.golf_coaches', 'email', 'SELECT') and not has_column_privilege('authenticated', 'public.golf_coaches', 'phone', 'SELECT'); -- noqa: LT05
-- VERIFY: select 1 where has_column_privilege('authenticated', 'public.golf_players', 'first_name', 'SELECT') and has_column_privilege('authenticated', 'public.golf_players', 'user_id', 'SELECT') and has_column_privilege('authenticated', 'public.golf_coaches', 'full_name', 'SELECT'); -- noqa: LT05
-- VERIFY: select 1 where has_column_privilege('service_role', 'public.golf_players', 'email', 'SELECT') and has_column_privilege('service_role', 'public.golf_coaches', 'phone', 'SELECT'); -- noqa: LT05
-- VERIFY: select 1 where to_regprocedure('public.golf_player_contacts(uuid[])') is not null and has_function_privilege('authenticated', 'public.golf_player_contacts(uuid[])', 'EXECUTE') and not has_function_privilege('anon', 'public.golf_player_contacts(uuid[])', 'EXECUTE'); -- noqa: LT05

SET LOCAL lock_timeout = '3s';

-- Precondition: the column lists below name every column but email and phone. Refuse if either table has a column this file
-- does not know about, so a new column is never silently made private or public by this file.
DO $$
DECLARE
  v_extra text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ') INTO v_extra
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'golf_players' AND column_name NOT IN (
        'id', 'user_id', 'first_name', 'last_name', 'email', 'phone', 'avatar_url', 'graduation_year', 'gpa',
        'high_school_name', 'hometown', 'state', 'handicap', 'handicap_index', 'onboarding_completed', 'profile_complete',
        'is_test', 'anonymized_at', 'created_at', 'updated_at'))
      OR (table_name = 'golf_coaches' AND column_name NOT IN (
        'id', 'user_id', 'organization_id', 'full_name', 'title', 'bio', 'email', 'phone', 'avatar_url',
        'onboarding_completed', 'created_at', 'updated_at'))
    );
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'golf_players_coaches_contact_columns: columns not covered by this file: %', v_extra;
  END IF;
END $$;

REVOKE SELECT ON public.golf_players FROM authenticated;
GRANT SELECT (
  id, user_id, first_name, last_name, avatar_url, graduation_year, gpa, high_school_name, hometown, state, handicap,
  handicap_index, onboarding_completed, profile_complete, is_test, anonymized_at, created_at, updated_at
) ON public.golf_players TO authenticated;

REVOKE SELECT ON public.golf_coaches FROM authenticated;
GRANT SELECT (
  id, user_id, organization_id, full_name, title, bio, avatar_url, onboarding_completed, created_at, updated_at
) ON public.golf_coaches TO authenticated;

CREATE OR REPLACE FUNCTION public.golf_player_contacts(p_player_ids uuid[])
RETURNS TABLE (id uuid, email text, phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.email::text, p.phone::text
  FROM public.golf_players p
  WHERE p.id = ANY (p_player_ids)
    AND (
      p.user_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.golf_team_members m
        JOIN public.golf_team_coach_staff s ON s.team_id = m.team_id
        JOIN public.golf_coaches c ON c.id = s.coach_id
        WHERE m.player_id = p.id
          AND m.status IN ('active'::public.team_member_status, 'inactive'::public.team_member_status)
          AND c.user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.golf_team_join_requests jr
        JOIN public.golf_team_coach_staff s ON s.team_id = jr.team_id
        JOIN public.golf_coaches c ON c.id = s.coach_id
        WHERE jr.player_id = p.id
          AND jr.status = 'pending'
          AND c.user_id = (SELECT auth.uid())
      )
    );
$$;

COMMENT ON FUNCTION public.golf_player_contacts(uuid[]) IS
  'E-mail and phone of the given players, for the caller only where they may contact them: their own row, a player active or inactive on a team they are staffed on, or one with a pending join request to such a team. Teammates get nothing (security review 2026-11-11, finding 1).';

REVOKE ALL ON FUNCTION public.golf_player_contacts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_player_contacts(uuid[]) TO authenticated, service_role;
