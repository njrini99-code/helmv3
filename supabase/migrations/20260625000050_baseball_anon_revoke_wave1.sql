-- =============================================================================
-- 20260625000050_baseball_anon_revoke_wave1.sql
--
-- Adds the missing REVOKE ALL ... FROM anon statements on tables that have
-- RLS ENABLED + authenticated-only policies but no explicit anon revoke.
--
-- Tables addressed (by source migration):
--   migration 000020: baseball_import_runs, baseball_player_external_ids
--   migration 000040: baseball_player_timeline_events, baseball_event_acknowledgements
--   migration 000060: baseball_practices, baseball_practice_blocks,
--                     baseball_practice_attendance
--
-- Pattern: Supabase default privileges grant anon usage on public schema tables
-- at CREATE time. An explicit REVOKE closes that gap regardless of policy state.
-- Safe to run multiple times (REVOKE is idempotent — revoking a privilege that
-- was already absent is a no-op in PostgreSQL).
--
-- ADDITIVE / non-destructive. NOT applied here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- From migration 000020 — import lineage tables
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_import_runs') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_import_runs        FROM anon;
  END IF;
  IF to_regclass('public.baseball_player_external_ids') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_player_external_ids FROM anon;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- From migration 000040 — timeline + acknowledgements
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_player_timeline_events') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_player_timeline_events FROM anon;
  END IF;
  IF to_regclass('public.baseball_event_acknowledgements') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_event_acknowledgements  FROM anon;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- From migration 000060 — practice tables
-- (RLS enabled in 000060; policies injected by 000050 to_regclass-guarded.
--  REVOKE eliminates the gap window between those two migrations.)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_practices') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_practices           FROM anon;
  END IF;
  IF to_regclass('public.baseball_practice_blocks') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_practice_blocks     FROM anon;
  END IF;
  IF to_regclass('public.baseball_practice_attendance') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_practice_attendance FROM anon;
  END IF;
END $$;

-- ============================================================================
-- END migration 20260625000050_baseball_anon_revoke_wave1.sql
-- ============================================================================
