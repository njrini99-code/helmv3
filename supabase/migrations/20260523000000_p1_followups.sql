-- ============================================================================
-- Migration: P1 follow-ups from 2026-05-21 multi-agent review
-- ============================================================================
-- Bundles the schema-side P1 fixes uncovered after the audit PR train landed
-- on 2026-05-21. Each block is idempotent and prod-safe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- P1-A: golf_coach_blocked_time — add missing columns the app writes
-- ---------------------------------------------------------------------------
-- src/app/golf/actions/golf.ts:3255 inserts title, all_day, description into
-- golf_coach_blocked_time. Production schema has none of those columns →
-- every coach blocked-time insert fails.
ALTER TABLE public.golf_coach_blocked_time
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS all_day BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ---------------------------------------------------------------------------
-- P1-B: golf_patterns_v2 — add columns referenced by dismissPattern
-- ---------------------------------------------------------------------------
-- src/app/golf/actions/pattern-management.ts:423 writes dismissed_at and
-- dismissed_reason. Production has lifecycle_state but not those two →
-- coach pattern dismissal fails.
ALTER TABLE public.golf_patterns_v2
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dismissed_reason TEXT;

-- ---------------------------------------------------------------------------
-- P1-C: create auth_rate_limits — DB-backed rate limiter
-- ---------------------------------------------------------------------------
-- src/lib/auth/supabase-rate-limit.ts expects this table for cross-instance
-- rate limiting. Currently missing in prod → every rate-limit check throws.
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_blocked_until
  ON public.auth_rate_limits(blocked_until)
  WHERE blocked_until IS NOT NULL;

-- Only service_role touches this table (via getAdminClient in
-- supabase-rate-limit.ts). RLS denies everyone else.
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies → only service_role bypasses RLS.

COMMENT ON TABLE public.auth_rate_limits IS
  'DB-backed rate limit window state — service_role only. Replaces the in-memory Map.';

-- ---------------------------------------------------------------------------
-- P1-D: tighten golf_team_coach_staff_insert WITH CHECK
-- ---------------------------------------------------------------------------
-- PR #16's policy verified the inserted coach_id row exists but not that the
-- caller owns it, letting a primary coach add ANY rival coach's coach_id to
-- their team's staff. Lock the insert to "I am inserting my own coach row on
-- a team I am primary coach on". Bootstrap onboarding already uses admin
-- client (P0-2) so this tightening doesn't regress signup.
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
        AND gc.user_id = auth.uid()
    )
  );

COMMENT ON POLICY golf_team_coach_staff_insert ON public.golf_team_coach_staff IS
  'INSERT requires caller to be primary coach on target team AND inserting their own coach_id. Closes S-CRIT-1 self-attach and the PR #16 rival-attach regression. Admin/RPC paths use service_role.';

-- ---------------------------------------------------------------------------
-- P1-E: lock down player UPDATE on golf_rounds protected columns
-- ---------------------------------------------------------------------------
-- golf_rounds_update has USING (player.user_id = auth.uid()) but no
-- column-level GRANT restriction. Player can directly:
--   1. UPDATE coachhelm_analyzed_at to suppress the safety-net cron forever
--   2. UPDATE player_id to reassign the round to another player
-- Revoke UPDATE on the protected columns from authenticated. The user
-- still updates legitimate user-editable columns (notes, weather, etc.)
-- via the existing table-level GRANT minus this set. service_role keeps
-- full UPDATE for triggers and admin paths.
REVOKE UPDATE (
  coachhelm_analyzed_at,
  coachhelm_failed_at,
  coachhelm_failure_reason,
  player_id
) ON public.golf_rounds FROM authenticated;

GRANT UPDATE ON public.golf_rounds TO service_role;
