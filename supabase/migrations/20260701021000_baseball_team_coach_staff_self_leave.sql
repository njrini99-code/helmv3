-- ============================================================================
-- DB-GATED — NOT APPLIED (see PR #673 comment, flagged db_gated).
--
-- Fixes: "Leave Team" (src/app/baseball/actions/teams.ts leaveTeamAsCoach,
-- shipped in PR #673) deletes the caller's own baseball_team_coach_staff
-- row. The live baseball_team_coach_staff_delete RLS policy (added in
-- 20260624000050_baseball_rls_helpers_and_policies.sql) only allows:
--   is_baseball_primary_coach(team_id)
--   OR has_baseball_staff_capability(team_id, 'can_invite_staff')
-- There is no "delete your own row" clause, so a typical assistant/staff
-- coach without the (role-configurable, non-default) can_invite_staff
-- capability can never leave a team via this action — the DELETE is
-- RLS-filtered to 0 affected rows. The app layer already detects this
-- honestly (checks the returned row count from `.delete().select('id')`)
-- and surfaces a clear, non-misleading error instead of a false success
-- ("You don't have permission to leave this team yet...") — see
-- leaveTeamAsCoach's PRE-SHIP CHECK comment. This migration is the
-- long-term DB-side fix that removes the need for that error entirely.
--
-- Adds a self-delete clause: any authenticated coach may delete their OWN
-- non-primary staff row (i.e. leave the team themselves). The primary
-- coach's row is explicitly excluded from the self-delete clause — a
-- primary coach cannot leave via this policy and must transfer ownership
-- or delete the team instead (the app layer enforces this same rule in
-- leaveTeamAsCoach as defense in depth, so this is a belt-and-suspenders
-- match, not a new capability).
--
-- Per remediation instructions: writing this file is allowed, applying it
-- to the live database is NOT — apply only via the normal migration
-- pipeline after review.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.baseball_team_coach_staff') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_coach_staff_delete" ON public.baseball_team_coach_staff';

    EXECUTE $p$CREATE POLICY "baseball_team_coach_staff_delete" ON public.baseball_team_coach_staff
      FOR DELETE TO authenticated
      USING (
        public.is_baseball_primary_coach(team_id)
        OR public.has_baseball_staff_capability(team_id, 'can_invite_staff')
        OR (coach_id = public.get_my_coach_id() AND is_primary = false)
      )$p$;
  END IF;
END $$;
