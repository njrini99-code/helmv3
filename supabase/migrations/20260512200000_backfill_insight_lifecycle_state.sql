-- Backfill insights where the terminal-timestamp column is set but
-- lifecycle_state was never written (legacy resolve/dismiss handlers
-- predating the CR-001 fix that added the lifecycle_state write).
--
-- This keeps the BI dashboard's insightActionRate consistent regardless of
-- which column the query keys on, and makes the lifecycle cron's "do not
-- progress terminal rows" rule accurate.
--
-- Applied to Helm-Production on 2026-05-12. 47 rows backfilled to 'resolved',
-- 0 dismissed/acknowledged rows needed alignment.

BEGIN;

UPDATE public.golf_coach_insights
SET lifecycle_state = 'resolved'
WHERE resolved_at IS NOT NULL
  AND (lifecycle_state IS NULL OR lifecycle_state <> 'resolved');

-- Future-proofing: same rule for dismissed and acknowledged, in case the
-- backfill ever needs to re-run after another out-of-sync window.
UPDATE public.golf_coach_insights
SET lifecycle_state = 'archived'
WHERE dismissed_at IS NOT NULL
  AND resolved_at IS NULL
  AND (lifecycle_state IS NULL OR lifecycle_state <> 'archived');

UPDATE public.golf_coach_insights
SET lifecycle_state = 'addressed'
WHERE acknowledged_at IS NOT NULL
  AND resolved_at IS NULL
  AND dismissed_at IS NULL
  AND (lifecycle_state IS NULL OR lifecycle_state NOT IN ('addressed','resolved','archived'));

COMMIT;
