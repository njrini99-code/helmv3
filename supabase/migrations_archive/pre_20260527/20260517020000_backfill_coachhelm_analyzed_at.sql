-- =====================================================================
-- 20260517020000_backfill_coachhelm_analyzed_at.sql
--
-- One-time backfill so the safety-net cron doesn't re-process every
-- completed round the first time it runs against the new state columns
-- added in 20260517010000.
--
-- Strategy: for completed rounds older than 24h that already have at
-- least one active CoachHelm insight in the same player+team scope
-- within 24h of the round's submission, infer the analysis already ran
-- and set coachhelm_analyzed_at to the insight's created_at.
-- Rounds without matching insights remain
-- coachhelm_analyzed_at = NULL and the safety-net cron picks them up.
--
-- Idempotent: only updates rows where coachhelm_analyzed_at IS NULL.
-- =====================================================================

BEGIN;

UPDATE public.golf_rounds r
SET coachhelm_analyzed_at = (
  SELECT MIN(i.created_at)
  FROM public.golf_coach_insights i
  WHERE i.player_id = r.player_id
    AND i.team_id = r.team_id
    AND i.created_at >= r.created_at
    AND i.created_at <= r.created_at + INTERVAL '24 hours'
)
WHERE r.status = 'completed'
  AND r.created_at < NOW() - INTERVAL '24 hours'
  AND r.coachhelm_analyzed_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.golf_coach_insights i
    WHERE i.player_id = r.player_id
      AND i.team_id = r.team_id
      AND i.created_at >= r.created_at
      AND i.created_at <= r.created_at + INTERVAL '24 hours'
  );

-- The 24h "older than" guard prevents this migration from clobbering
-- rounds the safety-net is actively recovering at deploy time.

COMMIT;
