-- =====================================================================
-- 20260517040000_backfill_parent_event_id.sql
--
-- Backfill parent_event_id for legacy recurring events that share
-- (team_id, title, event_type, recurrence_rule).
--
-- Why: editRecurringEvent / deleteRecurringEvent fall back to a
-- title+event_type+team_id scope match when parent_event_id is NULL.
-- That fallback was the audit's Q-NEW-7 concern: it can over-match
-- when a coach has two "Practice" series at different times. Backfill
-- so the canonical parent_event_id scope is the only path that needs
-- to run; the fallback can eventually be deleted.
--
-- Strategy: pick the earliest event in each (team_id, title,
-- event_type, recurrence_rule) cluster as the root, point siblings
-- at it. Idempotent — only touches rows with NULL parent_event_id.
-- =====================================================================

BEGIN;

WITH clusters AS (
  SELECT
    team_id,
    title,
    event_type,
    recurrence_rule,
    (ARRAY_AGG(id ORDER BY start_time ASC, created_at ASC, id ASC))[1] AS root_id
  FROM public.golf_events
  WHERE recurrence_rule IS NOT NULL
    AND parent_event_id IS NULL
  GROUP BY team_id, title, event_type, recurrence_rule
)
UPDATE public.golf_events e
SET parent_event_id = c.root_id
FROM clusters c
WHERE e.team_id = c.team_id
  AND e.title = c.title
  AND e.event_type = c.event_type
  AND e.recurrence_rule = c.recurrence_rule
  AND e.id != c.root_id
  AND e.parent_event_id IS NULL;

COMMIT;
