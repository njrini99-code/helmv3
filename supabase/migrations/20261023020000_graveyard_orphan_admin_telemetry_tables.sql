-- STATUS: WRITTEN, HOLD, NOT APPLIED. Written 2026-10-23 for the rolling
-- health report (#2061, item F). Registered in supabase/migrations/HELD.md;
-- applied by the Production rollout thread when the owner lifts the
-- migration freeze.
-- Apply (one line):
--   npm run db:apply --
--   supabase/migrations/20261023020000_graveyard_orphan_admin_telemetry_tables.sql
-- Risk: LOW. Moves two empty tables (0 rows ever: n_tup_ins = 0 on
-- 2026-10-23) to the graveyard schema. Nothing is dropped.
--
-- ORDER: deploy the code half of this PR first. It removes the realtime
-- subscription to admin_api_perf_log in src/hooks/useAdminRealtime.ts (a
-- postgres_changes subscription to a missing table can fail the whole
-- channel, admin_events included) and the admin_client_errors read in
-- scripts/seed-admin-events.ts. No page mounts that hook today, so the real
-- exposure is nil, but the order costs nothing.
--
-- WHY: the health report flags both tables as having no writer. They have
-- no live reader either, so a writer would add a write to every server
-- action for a table nobody looks at:
--   * admin_client_errors was replaced by error_logs + admin_events
--     (/api/log-error and server-error-logger.ts write those).
--   * admin_api_perf_log's only reader was a realtime subscription in
--     useAdminRealtime, reached only through useAdminAlerts, which no page
--     mounts. The old /golf/admin dashboard's apiPerf is hardcoded [] and
--     the /admin console measures latency with helm_debug traces and Sentry.
-- Read live 2026-10-23: no function, view or foreign key references either
-- table; admin_api_perf_log is in supabase_realtime and is dropped from it
-- first so the publication does not follow it into graveyard.
--
-- After applying: npm run db:types (both tables leave the public types),
-- then tell the health routine to stop checking these two tables.
--
-- ROLLBACK:
--   alter table graveyard.admin_api_perf_log set schema public;
--   alter table graveyard.admin_client_errors set schema public;
--   alter publication supabase_realtime add table public.admin_api_perf_log;
--
-- VERIFY: select 1 where to_regclass('public.admin_api_perf_log') is null
-- VERIFY:   and to_regclass('public.admin_client_errors') is null
-- VERIFY:   and to_regclass('graveyard.admin_api_perf_log') is not null
-- VERIFY:   and to_regclass('graveyard.admin_client_errors') is not null;

SET LOCAL lock_timeout = '3s';

CREATE SCHEMA IF NOT EXISTS graveyard;
REVOKE ALL ON SCHEMA graveyard FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  tables text[] := ARRAY['admin_api_perf_log', 'admin_client_errors'];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
      END IF;
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA graveyard', t);
      EXECUTE format('COMMENT ON TABLE graveyard.%I IS %L', t,
        'Moved from public 2026-10-23 (no writer and no reader; health report #2061 item F). Restore: ALTER TABLE graveyard.' || t || ' SET SCHEMA public;');
    END IF;
  END LOOP;
END $$;
