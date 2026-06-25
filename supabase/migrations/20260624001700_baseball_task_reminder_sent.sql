-- =============================================================================
-- 20260624001700_baseball_task_reminder_sent.sql
--
-- Closes the "task reminders are stored but never delivered" gap.
--
-- THE GAP
--   `setTaskReminder` (src/app/baseball/actions/tasks.ts) writes
--   reminder_at + reminder_sent=false to baseball_tasks, and createTask seeds
--   reminder_sent=false on insert — but the baseline schema
--   (20260527000000_prod_public_baseline.sql) never defined a reminder_sent
--   column. So those writes targeted a non-existent column AND nothing ever
--   flipped it / dispatched the reminder. The reminder loop had no terminal
--   state and no delivery (the exact GolfHelm "reminder auto-send missing" gap).
--
-- WHAT THIS DOES (additive, idempotent, non-destructive)
--   1. Adds baseball_tasks.reminder_sent (boolean, NOT NULL, default false) so
--      the existing app writes are valid and the dispatcher has an idempotency
--      flag to flip once a reminder has been delivered.
--   2. Adds a PARTIAL index matching the dispatcher's hot predicate
--      (reminder_at present AND not yet sent) so the nightly sweep's discovery
--      query stays cheap as the tasks table grows — it only ever indexes the
--      tiny set of armed-but-undelivered reminders.
--
-- The dispatcher itself is the Inngest cron `coachhelm-baseball-task-reminder-
-- sweep` (src/lib/inngest/functions.ts) backed by the pure core in
-- src/lib/baseball/tasks/reminder-sweep.ts. It selects due, unsent reminders,
-- appends a player_only timeline event to each assignee (the in-app delivery
-- surface), and flips reminder_sent=true under a re-asserted WHERE guard so a
-- re-run is a no-op (idempotent).
--
-- NO RLS / GRANT CHANGES: a plain column add on an existing table inherits the
-- table's existing policies + grants. No RPC is introduced, so there is no anon
-- grant to revoke.
-- =============================================================================

ALTER TABLE "public"."baseball_tasks"
  ADD COLUMN IF NOT EXISTS "reminder_sent" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."baseball_tasks"."reminder_sent" IS
  'True once the reminder_at reminder has been dispatched to assignees by the '
  'coachhelm-baseball-task-reminder-sweep cron. Idempotency flag: the sweep only '
  'dispatches rows where reminder_at <= now AND reminder_sent = false, then flips '
  'this to true. Reset to false by setTaskReminder when a new reminder is armed.';

-- Partial index for the dispatcher's discovery query. Only armed-but-undelivered
-- reminders are indexed, so the index stays tiny regardless of total task count.
CREATE INDEX IF NOT EXISTS "idx_baseball_tasks_pending_reminder"
  ON "public"."baseball_tasks" USING "btree" ("reminder_at")
  WHERE ("reminder_at" IS NOT NULL AND "reminder_sent" = false);
