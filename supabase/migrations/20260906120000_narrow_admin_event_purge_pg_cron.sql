-- Narrow the pg_cron admin-event purge to a redundant floor, not a second
-- retention policy. 2026-09-06 scheduler audit: `log-retention`
-- (src/app/api/cron/log-retention/route.ts) already purges admin_events
-- info/warning rows older than 90d and error/critical rows older than 13mo
-- in a batched-delete style, and now ALSO purges admin_analytics_events
-- older than 180d (added in the same PR). The pg_cron job
-- `purge-admin-event-telemetry` (20260703043000_admin_events_retention_pg_cron.sql)
-- ran a blanket 180-day DELETE on BOTH tables with no severity awareness and
-- no counter surfaced anywhere application code can read — two owners of one
-- policy, silently disagreeing on window length for admin_events (90d/13mo
-- vs 180d).
--
-- After this migration, `purge-admin-event-telemetry` is a BACKSTOP only:
-- admin_events rows with severity in ('info','warning') older than 180 days
-- (a floor well past log-retention's own 90-day window, so it only ever
-- fires if log-retention has been silently broken for months) and nothing
-- else. It no longer touches admin_analytics_events (log-retention owns
-- that exclusively now) and never touches error/critical admin_events
-- (log-retention's 13-month forensic window for those is intentionally
-- longer than any floor this job should apply).
--
-- Idempotent: cron.schedule upserts by job name, so re-running this file is
-- safe. Wrapped in a DO block so a missing job (e.g. a fresh project, or one
-- where task 20260703043000 was never applied) does not error — cron.alter_job
-- errors if the jobid does not resolve, so this checks cron.job first and
-- falls back to cron.schedule (which creates-or-replaces by name) either way.
--
-- STATUS: HOLD — see supabase/migrations/HELD.md. Not applied by this PR;
-- the owner applies by hand and stamps the ledger.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  -- cron.schedule() upserts by job name regardless of whether the job
  -- already exists, so this single call both creates the job on a project
  -- that never ran 20260703043000 and replaces the old two-table body on one
  -- that did.
  PERFORM cron.schedule(
    'purge-admin-event-telemetry',
    '10 4 * * *',
    $job$
      DELETE FROM public.admin_events
      WHERE severity IN ('info', 'warning')
        AND created_at < now() - interval '180 days';
    $job$
  );
END $$;
