-- Team toggle (men's/women's) — staff-scoped RLS wall.
--
-- Decision (2026-06-12): within ONE program, a coach sees/edits a team's data
-- only if STAFFED on that team (golf_team_coach_staff). A director-of-golf
-- staffed on BOTH teams still sees both; an assistant staffed only on the men's
-- team must NOT see the women's roster/rounds.
--
-- Two policies were ORG-scoped (joined golf_coaches→golf_teams on organization_id),
-- which let any coach in the program read every player and update any member's
-- rounds across both genders. Re-scope both to golf_team_coach_staff membership.
--
-- Ordering: runs AFTER 20260610160000_program_onboarding_backfill.sql, so every
-- existing org-having coach already has a head_coach staff row and will NOT lose
-- visibility of their own players when the org join is removed.

-- ── 1. Coach can read a player only if staffed on that player's active team ─────
CREATE OR REPLACE FUNCTION public.user_is_coach_of_golf_player("check_player_id" uuid)
  RETURNS boolean
  LANGUAGE sql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
  SELECT EXISTS (
    SELECT 1
    FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    JOIN golf_team_members gtm ON gtm.team_id = gtcs.team_id
    WHERE gc.user_id = auth.uid()
      AND gtm.player_id = check_player_id
      AND gtm.status = 'active'
  )
$$;

COMMENT ON FUNCTION public.user_is_coach_of_golf_player(uuid) IS
  'True if the current user is staffed (golf_team_coach_staff) on a team the player is an active member of. Staff-scoped (was org-scoped) so the men''s/women''s wall holds within one program.';

-- ── 2. Coach can update a round only for a player on a team they staff ──────────
DROP POLICY IF EXISTS "golf_rounds_update_team" ON public.golf_rounds;
CREATE POLICY "golf_rounds_update_team"
  ON public.golf_rounds
  FOR UPDATE
  TO authenticated
  USING (
    player_id IN (
      SELECT gtm.player_id
      FROM public.golf_team_members gtm
      JOIN public.golf_team_coach_staff gtcs ON gtcs.team_id = gtm.team_id
      JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
      WHERE gc.user_id = auth.uid()
        AND gtm.status = 'active'::public.team_member_status
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT gtm.player_id
      FROM public.golf_team_members gtm
      JOIN public.golf_team_coach_staff gtcs ON gtcs.team_id = gtm.team_id
      JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
      WHERE gc.user_id = auth.uid()
        AND gtm.status = 'active'::public.team_member_status
    )
  );

-- ── 3. Least privilege: revoke anon EXECUTE on team-membership predicates ───────
-- SECURITY DEFINER predicates keyed on auth.uid() (null → false for anon), so
-- this changes no behavior, only removes unnecessary attack surface. Recurring
-- anti-pattern flagged across prior audits.
REVOKE EXECUTE ON FUNCTION public.is_golf_team_coach(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_golf_team_primary_coach(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_golf_team_player(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_is_coach_of_golf_player(uuid) FROM anon, PUBLIC;
