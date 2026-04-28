-- =============================================================================
-- Vercel error log triage — 2026-04-28
--
-- Fixes derived from the 549-error /Users/ricknini/Downloads/
-- helmv3-log-export-2026-04-28T02-32-39.json export.
-- See .full-review/agent-1.log for the per-cause source-code citations.
-- =============================================================================

-- Cause 3 (40× PGRST202 "function not found" on resend-activity stats)
-- Migration 20260420000000_resend_activity_mirror.sql REVOKEd from public/anon
-- but never granted to authenticated. PostgREST therefore returned function-
-- not-found for every authenticated caller. Function bodies still enforce
-- admin-role via auth.uid() checks (`RAISE EXCEPTION 'Forbidden'`), so this
-- grant is safe for non-admins.
GRANT EXECUTE ON FUNCTION public.get_resend_activity_stats(text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_resend_domain_breakdown(text)  TO authenticated;

-- Cause 5 (9× `[Stats] Falling back: code 57014`) — covering index + FK-side
-- indexes for the detailed-stats embedded SELECT in
-- src/app/golf/actions/stats-data.ts:825-861.
CREATE INDEX IF NOT EXISTS idx_putt_details_shot_id
  ON putt_details (shot_id);

CREATE INDEX IF NOT EXISTS idx_approach_miss_details_shot_id
  ON approach_miss_details (shot_id);

CREATE INDEX IF NOT EXISTS idx_golf_shots_round_id_covering
  ON golf_shots (round_id, hole_number, shot_number)
  INCLUDE (
    id, hole_id, shot_type, club_type,
    lie_before, lie_after, distance_to_hole_before, distance_unit_before,
    result, distance_to_hole_after, distance_unit_after, shot_distance,
    miss_direction, putt_break, putt_distance_feet, putt_slope, putt_made,
    is_penalty, penalty_type
  );

-- Cause 7 (21× `fetchAdminRollupA` failures) — bump per-function
-- statement_timeout for the four admin rollup A functions so SECURITY
-- DEFINER bodies have more runway than the global default.
ALTER FUNCTION public.get_admin_rounds_rollup(
  timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz
) SET statement_timeout = '30s';

ALTER FUNCTION public.get_admin_users_rollup(
  timestamptz, timestamptz, timestamptz, timestamptz
) SET statement_timeout = '30s';

ALTER FUNCTION public.get_admin_feature_adoption_rollup(timestamptz)
  SET statement_timeout = '30s';

ALTER FUNCTION public.get_admin_coachhelm_rollup(
  timestamptz, timestamptz, timestamptz
) SET statement_timeout = '30s';
