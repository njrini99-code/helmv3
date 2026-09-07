-- Narrow the pg_cron admin-event purge to a redundant floor, not a second
-- retention policy. 2026-09-06 scheduler audit: `log-retention`
-- (src/app/api/cron/log-retention/route.ts) already purges admin_events
-- info/warning rows older than 90d and error/critical rows older than 13mo
-- in a batched-delete style, and now ALSO purges admin_analytics_events
-- older than 180d (added in the same PR). The pg_cron job
-- `purge-admin-event-telemetry`
-- (20260703043000_admin_events_retention_pg_cron.sql) ran a blanket 180-day
-- DELETE on BOTH tables with no severity awareness and
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
-- Idempotent: cron.schedule(name, ...) creates-or-replaces by job name, so
-- re-running this file is safe and a project that never ran 20260703043000
-- simply gets the job created. There is deliberately NO cron.job lookup and
-- no cron.alter_job call (alter_job errors on an unresolvable jobid); the DO
-- block exists only to PERFORM the schedule call.
--
-- APPLY ORDER: apply only AFTER the log-retention route change (PR #1885,
-- src/app/api/cron/log-retention/route.ts) is live in production via
-- scripts/deploy-prod.sh. Until that deploy, this file removes the only
-- purge admin_analytics_events has. Pushing does not deploy.
--
-- STATUS: HOLD — see supabase/migrations/HELD.md. Applied by the owner via
-- the db-apply workflow (held_override) after the deploy above.
--
-- ROLLBACK: re-run the cron.schedule body from
-- 20260703043000_admin_events_retention_pg_cron.sql (two-table 180d purge),
-- or `select cron.unschedule('purge-admin-event-telemetry')` to drop the
-- backstop entirely and leave log-retention as the sole owner.
-- VERIFY: select 1 from cron.job where jobname='purge-admin-event-telemetry' and command not like '%admin_analytics_events%' and command like '%severity IN%' -- noqa: LT05

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
