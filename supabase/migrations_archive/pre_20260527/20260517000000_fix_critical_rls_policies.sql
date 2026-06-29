-- =====================================================================
-- 20260517000000_fix_critical_rls_policies.sql
--
-- Closes two RLS Criticals identified in
-- docs/legacy/full-review-2026-05-17-golfhelm-audit/05-final-report.md.
--
-- S-CRIT-1 (CWE-285): golf_team_coach_staff INSERT policy validated only
--   coach_id ownership, allowing any authenticated coach to self-attach to
--   any team_id and gain full coach access (rounds, shots, insights, events,
--   qualifiers) of that team. Fix: require the caller to already be a
--   primary coach on the target team_id.
--
-- S-CRIT-2 (CWE-269/639): coach_insights_update_player_own allowed players
--   UPDATE on ALL columns of their own insight rows. Players could rewrite
--   content, flip lifecycle_state, or reassign coach_id. Fix: column-level
--   REVOKE + GRANT so the authenticated role only has UPDATE on
--   acknowledged_at and dismissed_at.
--
-- Both fixes are idempotent (DROP IF EXISTS, then CREATE).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Helper: is_golf_team_primary_coach
-- ---------------------------------------------------------------------
-- SECURITY DEFINER so policies on golf_team_coach_staff don't recurse.
-- Mirrors the existing is_golf_team_coach helper (migration 20260204200000)
-- but additionally requires gtcs.is_primary = TRUE.
CREATE OR REPLACE FUNCTION is_golf_team_primary_coach(team_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
      AND gc.user_id = auth.uid()
      AND gtcs.is_primary = TRUE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION is_golf_team_primary_coach(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_golf_team_primary_coach(uuid) TO service_role;

COMMENT ON FUNCTION is_golf_team_primary_coach(uuid) IS
  'Check if current user is a PRIMARY coach on the specified team. SECURITY DEFINER avoids RLS recursion.';

-- ---------------------------------------------------------------------
-- S-CRIT-1: require team ownership for INSERT into golf_team_coach_staff
-- ---------------------------------------------------------------------
-- The previous policy only checked that the inserted coach_id belonged to
-- the caller. That permitted self-attach: any coach could INSERT a row
-- pointing at any team_id.
--
-- New policy: caller must already be a primary coach on the target team.
-- Bootstrap (creating a brand new team) happens via service_role in the
-- team-creation server action, which bypasses RLS, so the only legitimate
-- path through this policy is a primary coach adding an assistant.

DROP POLICY IF EXISTS golf_team_coach_staff_insert ON public.golf_team_coach_staff;

CREATE POLICY golf_team_coach_staff_insert
  ON public.golf_team_coach_staff
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_golf_team_primary_coach(golf_team_coach_staff.team_id)
    AND EXISTS (
      SELECT 1
      FROM golf_coaches gc
      WHERE gc.id = golf_team_coach_staff.coach_id
    )
  );

COMMENT ON POLICY golf_team_coach_staff_insert ON public.golf_team_coach_staff IS
  'INSERT requires the caller to be a primary coach on the target team_id. Closes S-CRIT-1 (self-attach as coach to any team).';

-- ---------------------------------------------------------------------
-- S-CRIT-2: restrict player UPDATE on golf_coach_insights to
-- acknowledgement columns via column-level GRANT.
-- ---------------------------------------------------------------------
-- The previous policy let players UPDATE all columns of rows where
-- player_id = me, inverting the coach-write/player-read model. Players
-- could rewrite the coach-authored content, flip lifecycle to 'resolved',
-- or reassign coach_id.
--
-- Fix: revoke table-level UPDATE from authenticated, then grant only the
-- two columns players legitimately update (acknowledged_at, dismissed_at).
-- The RLS policy itself stays — it gates which ROWS the player can touch.
-- The GRANT gates which COLUMNS within those rows are writable.
-- service_role keeps full UPDATE so triggerPlayerInsightsAfterRound and
-- other admin paths are unaffected.

REVOKE UPDATE ON public.golf_coach_insights FROM authenticated;
GRANT UPDATE (acknowledged_at, dismissed_at) ON public.golf_coach_insights TO authenticated;
GRANT UPDATE ON public.golf_coach_insights TO service_role;

DROP POLICY IF EXISTS coach_insights_update_player_own ON public.golf_coach_insights;

CREATE POLICY coach_insights_update_player_own
  ON public.golf_coach_insights
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    player_id IN (
      SELECT golf_players.id
      FROM golf_players
      WHERE golf_players.user_id = auth.uid()
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT golf_players.id
      FROM golf_players
      WHERE golf_players.user_id = auth.uid()
    )
  );

COMMENT ON POLICY coach_insights_update_player_own ON public.golf_coach_insights IS
  'Players can UPDATE their own insight rows, but column-level GRANTs restrict the writable surface to acknowledged_at + dismissed_at. Closes S-CRIT-2.';

COMMIT;
