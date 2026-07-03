-- admin_events retention — nightly pg_cron purge of telemetry older than 180
-- days. admin_events had grown to ~91k rows / 287MB since January with no
-- retention policy (2026-07-03 housekeeping audit); it is the Helm Bridge
-- data source, so old rows have no product value beyond the trend windows
-- (max 90d) the dashboard reads.
--
-- APPLIED TO PROD 2026-07-03 via MCP (admin_events_retention_pg_cron) before
-- this file merged; kept in-repo as source of truth. Idempotent: cron.schedule
-- upserts by job name.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'purge-admin-event-telemetry',
  '10 4 * * *',
  $job$
    DELETE FROM public.admin_events
    WHERE created_at < now() - interval '180 days';
    DELETE FROM public.admin_analytics_events
    WHERE created_at < now() - interval '180 days';
  $job$
);
