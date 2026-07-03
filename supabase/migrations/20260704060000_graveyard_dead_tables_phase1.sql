-- ============================================================================
-- Graveyard phase 1 — move 9 confirmed-dead tables out of public.
--
-- Classified by the 2026-07-04 291-table audit (15-agent, code refs +
-- pg_proc/pg_views/cron.job + FK skeptic pass): zero live references in
-- src/scripts/e2e, zero function/view/trigger/cron dependencies, zero (or
-- orphaned demo) rows, and no inbound FKs from kept tables (verified against
-- pg_constraint — every FK on these tables is outbound).
--
-- graveyard schema is NOT in PostgREST's exposed schemas and gets no role
-- grants, so these vanish from the REST/RPC surface but remain instantly
-- restorable via ALTER TABLE graveyard.<t> SET SCHEMA public.
--
-- UNSURE tables from the same audit stay in public (documented in
-- docs/audits/DB_TABLE_AUDIT_2026-07-04.md). The 24 legacy baseball_lift_*/
-- readiness/strength/soreness sibling tables move in phase 2, AFTER the
-- Lift Lab code rewire deploys (prod publishLiftDay still writes to them).
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS graveyard;
REVOKE ALL ON SCHEMA graveyard FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'crm_activity_log',
    'baseball_import_field_mappings',
    'baseball_soreness_maps',
    'baseball_stat_facts',
    'golf_validations',
    'golf_percentile_cache',
    'golf_player_attendance_stats',
    'golf_player_baselines',
    'golf_tracer_health_snapshot'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      -- drop from realtime publication if present (SET SCHEMA would keep it)
      IF EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
      END IF;
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA graveyard', t);
      EXECUTE format('COMMENT ON TABLE graveyard.%I IS %L', t,
        'Moved from public 2026-07-04 (dead-table audit). Restore: ALTER TABLE graveyard.' || t || ' SET SCHEMA public;');
    END IF;
  END LOOP;
END $$;
