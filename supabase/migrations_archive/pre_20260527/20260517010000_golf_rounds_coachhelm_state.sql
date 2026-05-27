-- =====================================================================
-- 20260517010000_golf_rounds_coachhelm_state.sql
--
-- Adds three columns to golf_rounds so the safety-net cron can
-- deterministically identify rounds that still need CoachHelm analysis.
--
-- Closes audit Finding 2 (round → stats → CoachHelm not proven E2E) +
-- A-NEW-6 (HTTP self-call + heuristic safety-net) by replacing the
-- previous "any active insight after round.created_at" heuristic with a
-- single-source-of-truth column. See
--   .full-review-2026-05-17-golfhelm-audit/05-final-report.md
--   docs/superpowers/plans/2026-05-17-plan-04-round-loop-hardening.md
-- =====================================================================

BEGIN;

ALTER TABLE public.golf_rounds
  ADD COLUMN IF NOT EXISTS coachhelm_analyzed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS coachhelm_failed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS coachhelm_failure_reason TEXT NULL;

-- Partial index: only rounds awaiting analysis. Tiny in practice — most
-- completed rounds have already been processed, so the working set is
-- whatever was submitted since the safety-net cron last ran (~30 min).
CREATE INDEX IF NOT EXISTS golf_rounds_pending_coachhelm_idx
  ON public.golf_rounds (created_at)
  WHERE coachhelm_analyzed_at IS NULL
    AND coachhelm_failed_at IS NULL
    AND status = 'completed';

COMMENT ON COLUMN public.golf_rounds.coachhelm_analyzed_at IS
  'Timestamp when triggerPlayerInsightsAfterRound completed for this round. NULL = pending or never ran.';
COMMENT ON COLUMN public.golf_rounds.coachhelm_failed_at IS
  'Timestamp when triggerPlayerInsightsAfterRound terminated with an error. Set alongside coachhelm_failure_reason.';
COMMENT ON COLUMN public.golf_rounds.coachhelm_failure_reason IS
  'Short error reason captured by postRoundTrigger on the failure path. Truncated to ~500 chars.';

COMMIT;
