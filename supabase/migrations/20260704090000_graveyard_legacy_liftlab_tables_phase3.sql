-- ============================================================================
-- Graveyard phase 3 — the FINAL legacy Lift Lab / strength tables.
--
-- APPLY ONLY AFTER the program-builder→helm unification train is DEPLOYED:
-- until that deploy, program-builder CRUD (createLiftProgram/addLiftWeek/
-- addLiftDay/addLiftSection/addLiftPrescription), publishLiftDay dual-write,
-- and the strength-group/maxes/PRs/bodyweight/availability CRUD still write
-- these tables. The unification swaps every writer to helm_lifting_*.
--
-- Ground truth at authoring time (2026-07-04, prod):
--   * ALL 16 tables have 0 rows (pg_stat_user_tables) — no data migration.
--   * The ONLY inbound FKs from outside this set come from tables ALREADY in
--     graveyard (baseball_lift_exercise_substitutions → baseball_lift_exercises,
--     baseball_lift_set_results → baseball_lift_session_exercises), so after
--     this move every FK edge lives entirely inside graveyard.
--
-- Restore any table: ALTER TABLE graveyard.<t> SET SCHEMA public;
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS graveyard;
REVOKE ALL ON SCHEMA graveyard FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- program-builder chain (children first for readability; order is not
    -- load-bearing — SET SCHEMA does not touch FK constraints)
    'baseball_lift_session_exercises',
    'baseball_lift_sessions',
    'baseball_lift_program_assignments',
    'baseball_lift_prescriptions',
    'baseball_lift_sections',
    'baseball_lift_days',
    'baseball_lift_weeks',
    'baseball_lift_programs',
    'baseball_lift_exercises',
    -- strength / body tracking
    'baseball_strength_group_audit',
    'baseball_strength_group_members',
    'baseball_strength_groups',
    'baseball_strength_maxes',
    'baseball_strength_prs',
    'baseball_bodyweight_entries',
    'baseball_availability_statuses'
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
        'Moved from public 2026-07-04 (legacy Lift Lab, phase 3 — post program-builder unification). Restore: ALTER TABLE graveyard.' || t || ' SET SCHEMA public;');
    END IF;
  END LOOP;
END $$;
