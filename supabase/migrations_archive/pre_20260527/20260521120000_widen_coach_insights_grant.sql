-- ============================================================================
-- Migration: widen UPDATE column GRANT on golf_coach_insights
-- ============================================================================
-- PR #16 (20260517000000_fix_critical_rls_policies.sql) revoked table-level
-- UPDATE from `authenticated` and re-granted only acknowledged_at and
-- dismissed_at. Coach-side actions (acknowledge / dismiss / resolve / rate /
-- bulk-actions) use the user-scoped client and write status, dismissed,
-- lifecycle_state, resolved_at, and metadata — Postgres now denies those
-- columns and every coach UI write fails in prod.
--
-- The RLS policy `coach_insights_update_player_own` still gates which ROWS
-- the caller can touch (player_id IN <user's player_ids>). Restoring the
-- column GRANT for the columns coaches legitimately write keeps the row-scope
-- protection from S-CRIT-2 while unblocking the coach workflow. service_role
-- still owns the full table for admin paths.
-- ============================================================================

GRANT UPDATE (
  status,
  dismissed,
  lifecycle_state,
  resolved_at,
  metadata,
  acknowledged_at,
  dismissed_at
) ON public.golf_coach_insights TO authenticated;
