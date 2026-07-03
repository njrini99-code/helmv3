-- ============================================================================
-- Graveyard phase 2 — verified-dead legacy Lift Lab tables.
--
-- APPLY ONLY AFTER the clean-slate train (Lift Lab helm rewire) is DEPLOYED:
-- the signals bridge was the last writer to baseball_lift_assignments and was
-- rewired to helm_lifting_* in that train. Applying before deploy would break
-- the still-live prod code path.
--
-- RESCOPED SET (see docs/audits/DB_TABLE_AUDIT_2026-07-04.md): the program-
-- builder CRUD + publishLiftDay dual-write still target baseball_lift_
-- programs/weeks/days/sections/prescriptions/program_assignments/sessions/
-- session_exercises, and strength-group/bodyweight/availability CRUD is still
-- legacy-only — those tables STAY until the program-builder→helm unification
-- follow-up. Only tables with zero readers AND zero writers post-rewire move:
--   baseball_lift_results            (22 orphaned demo-seed rows, no readers)
--   baseball_lift_set_results        (rewired readers → helm)
--   baseball_readiness_checkins      (22 orphaned demo-seed rows, reads reconciled 2026-07-01)
--   baseball_lift_assignments        (44 demo rows; last writer removed by signals rewire)
--   baseball_lift_import_rows        (0 rows, never wired)
--   baseball_lift_import_runs        (0 rows, never wired)
--   baseball_lift_exercise_substitutions (0 rows, never wired)
--
-- Restore any table: ALTER TABLE graveyard.<t> SET SCHEMA public;
--
-- FK verification (pg_constraint, 2026-07-04): two inbound FKs remain from
-- tables staying in public — baseball_lift_sessions.readiness_checkin_id and
-- baseball_lift_prescriptions.substitution_group_id. Cross-schema FKs are
-- valid in Postgres; both columns are NULL for all new writes (readiness
-- writes reconciled to helm 2026-07-01; substitutions table has 0 rows ever),
-- so the constraints are inert. All other inbound FKs are between tables
-- moving together.
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS graveyard;
REVOKE ALL ON SCHEMA graveyard FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'baseball_lift_results',
    'baseball_lift_set_results',
    'baseball_readiness_checkins',
    'baseball_lift_assignments',
    'baseball_lift_import_rows',
    'baseball_lift_import_runs',
    'baseball_lift_exercise_substitutions'
  ];
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
        'Moved from public 2026-07-04 (legacy Lift Lab, phase 2). Restore: ALTER TABLE graveyard.' || t || ' SET SCHEMA public;');
    END IF;
  END LOOP;
END $$;
