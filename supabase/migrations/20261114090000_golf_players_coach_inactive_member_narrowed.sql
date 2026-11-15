-- golf_players_select_coach_inactive_member: re-apply the narrowed read (owner,
-- 2026-11-11, "Narrow it", release review D4/C6) on databases that ran the
-- first version of 20261105100000.
--
-- WHY: production's ledger carries 20261105100000, but #2500 (3c1381e280,
--   2026-11-12) later edited that file to narrow the read, and an edited file
--   is never re-run where its version is already recorded. The narrowing lives
--   in the FUNCTION, not in the policy: in both versions the policy's qual is
--   `user_coaches_inactive_golf_member(id)`. Only the function body tells the
--   two apart (the narrowed one has the `elsewhere` NOT EXISTS). So check
--   `prosrc LIKE '%elsewhere%'` on public.user_coaches_inactive_golf_member,
--   not the policy qual, to see which version a database runs.
--   Staging (ybmwektreyrwjscxlogv) already ran the narrowed body (checked
--   2026-11-14); there this file changes nothing but the ledger.
-- WHAT: CREATE OR REPLACE of the function with the body now in
--   20261105100000 (a staffed coach reads their team's inactive member's
--   profile row until that player is active on another team), the same
--   EXECUTE grants, and the policy only where it is missing. The policy is not
--   dropped and re-created when present: its qual is identical, and DROP/CREATE
--   POLICY would take an ACCESS EXCLUSIVE lock on golf_players for nothing.
-- WHO: a staffed coach loses the read of a former member who is now active on
--   another team (production 2026-11-11: 1 of 5 inactive members). That team's
--   coaches still read the player through the active membership. No caller
--   gains a row.
-- ORDER: after 20261105100000. No other dependency.
-- pgTAP: supabase/tests/rls/golf_players_coach_reads_inactive_members.sql
--   (5; the "moved" case fails on the first body and passes on this one).
--
-- ROLLBACK (restores the first, wider body; the policy is unchanged):
--   CREATE OR REPLACE FUNCTION public.user_coaches_inactive_golf_member(
--       check_player_id uuid)
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
--   SET search_path = public AS $$
--     SELECT EXISTS (
--       SELECT 1
--       FROM golf_team_coach_staff gtcs
--       JOIN golf_coaches gc ON gc.id = gtcs.coach_id
--       JOIN golf_team_members gtm ON gtm.team_id = gtcs.team_id
--       WHERE gc.user_id = auth.uid()
--         AND gtm.player_id = check_player_id
--         AND gtm.status = 'inactive'
--     )
--   $$;
--
-- VERIFY: select 1 from pg_proc where oid =
-- VERIFY:   to_regprocedure('public.user_coaches_inactive_golf_member(uuid)')
-- VERIFY:   and prosecdef and prosrc like '%elsewhere%';
-- VERIFY: select 1 from pg_policies where schemaname = 'public'
-- VERIFY:   and tablename = 'golf_players'
-- VERIFY:   and policyname = 'golf_players_select_coach_inactive_member'
-- VERIFY:   and qual like '%user_coaches_inactive_golf_member%';
-- VERIFY: select 1 where not has_function_privilege('anon',
-- VERIFY:   'public.user_coaches_inactive_golf_member(uuid)', 'EXECUTE')
-- VERIFY:   and has_function_privilege('authenticated',
-- VERIFY:   'public.user_coaches_inactive_golf_member(uuid)', 'EXECUTE');

-- Only the conditional CREATE POLICY below locks golf_players, and only where
-- the policy is missing. db:apply runs the file in one transaction.
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.user_coaches_inactive_golf_member(
    check_player_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    JOIN golf_team_members gtm ON gtm.team_id = gtcs.team_id
    WHERE gc.user_id = auth.uid()
      AND gtm.player_id = check_player_id
      AND gtm.status = 'inactive'
      AND NOT EXISTS (
        SELECT 1
        FROM golf_team_members elsewhere
        WHERE elsewhere.player_id = check_player_id
          AND elsewhere.status = 'active'
          AND elsewhere.team_id <> gtm.team_id
      )
  )
$$;

REVOKE ALL ON FUNCTION public.user_coaches_inactive_golf_member(uuid)
FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_coaches_inactive_golf_member(uuid)
TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_players'
      AND policyname = 'golf_players_select_coach_inactive_member'
  ) THEN
    CREATE POLICY golf_players_select_coach_inactive_member
    ON public.golf_players
    FOR SELECT
    TO authenticated
    USING (public.user_coaches_inactive_golf_member(id));
  END IF;
END
$$;
