-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- WHY: Roster reads active and inactive members, but golf_players_select lets a
--   coach read a player only through an active membership. A player marked
--   inactive came back with no profile, so Roster dropped them and the coach
--   had no way to mark them active again. Production has 5 such rows (5 Nov,
--   read only).
-- WHO: signed-in coaches on the player's team staff. Adds read access to the
--   profile row of that team's inactive members. Rounds, stats and every other
--   table stay as they are, on an active membership.
-- ORDER: no dependencies.
-- ROLLBACK:
--   supabase/rollbacks/20261105100000_golf_players_coach_reads_inactive_members.rollback.sql -- noqa: LT05
-- VERIFY: select 1 from pg_policies where tablename = 'golf_players' and
-- VERIFY:   policyname = 'golf_players_select_coach_inactive_member';

-- Lock timeout (release review B1, 11 Nov 2026): this file takes an ACCESS EXCLUSIVE lock on a hot table. Without a
-- timeout the DDL waits behind any long reader and every later read and write queues behind it. db:apply runs the
-- file in one transaction, so SET LOCAL holds for exactly this apply. Added after the staging apply: the bytes differ
-- from staging's copy by this block only (HELD.md).
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
  )
$$;

REVOKE ALL ON FUNCTION public.user_coaches_inactive_golf_member(uuid)
FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_coaches_inactive_golf_member(uuid)
TO authenticated;

DROP POLICY IF EXISTS golf_players_select_coach_inactive_member
ON public.golf_players;
CREATE POLICY golf_players_select_coach_inactive_member
ON public.golf_players
FOR SELECT
TO authenticated
USING (public.user_coaches_inactive_golf_member(id));
