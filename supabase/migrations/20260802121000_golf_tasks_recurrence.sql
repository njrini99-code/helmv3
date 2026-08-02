-- ============================================================================
-- Recurring tasks — issue #1238
-- ----------------------------------------------------------------------------
-- Deliberately mirrors the golf_events series model rather than inventing a
-- second one, so the two surfaces stay legible together:
--
--   * a series ROOT carries `recurrence_rule` (RRULE text) and
--     `parent_task_id IS NULL`
--   * every materialized occurrence carries `parent_task_id = <root.id>` and
--     `recurrence_rule IS NULL`
--
-- Occurrences are materialized (not expanded at read time) for the same reason
-- events are: each one needs its own golf_task_assignments rows, its own
-- completion state per player, and its own golf_task_reminders row. A virtual
-- occurrence cannot own any of those.
--
-- ON DELETE CASCADE on parent_task_id so deleting a series root cannot strand
-- orphan occurrences (golf_task_assignments already cascades from task_id).
-- ============================================================================

ALTER TABLE public.golf_tasks
  ADD COLUMN IF NOT EXISTS recurrence_rule text,
  ADD COLUMN IF NOT EXISTS parent_task_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'golf_tasks_parent_task_id_fkey'
  ) THEN
    ALTER TABLE public.golf_tasks
      ADD CONSTRAINT golf_tasks_parent_task_id_fkey
      FOREIGN KEY (parent_task_id) REFERENCES public.golf_tasks(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Series fan-out reads every occurrence of a root; without this it scans.
CREATE INDEX IF NOT EXISTS idx_golf_tasks_parent_task_id
  ON public.golf_tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;

COMMENT ON COLUMN public.golf_tasks.recurrence_rule IS
  'RRULE text on a series ROOT only (occurrences carry NULL and point at the root via parent_task_id). Same convention as golf_events.recurrence_rule. See issue #1238.';
COMMENT ON COLUMN public.golf_tasks.parent_task_id IS
  'Series root for a materialized recurring-task occurrence; NULL for one-off tasks and for the root itself. Same convention as golf_events.parent_event_id.';
