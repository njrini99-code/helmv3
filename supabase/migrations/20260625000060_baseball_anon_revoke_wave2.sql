-- =============================================================================
-- 20260625000060_baseball_anon_revoke_wave2.sql
--
-- Adds the missing REVOKE ALL ... FROM anon statements on tables created in
-- migrations 000080, 000093, and 000200 which have RLS ENABLED but no anon
-- revoke.
--
-- Tables addressed:
--   migration 000080 (elite stat event model — 13 tables):
--     baseball_stat_sources, baseball_import_field_mappings,
--     baseball_plate_appearances, baseball_pitch_events,
--     baseball_batted_ball_events, baseball_swing_events,
--     baseball_fielding_events, baseball_catching_events,
--     baseball_baserunning_events, baseball_workload_events,
--     baseball_video_events, baseball_stat_facts,
--     baseball_player_development_metrics
--
--   migration 000093 (postgame reviews — 2 tables):
--     baseball_postgame_reviews, baseball_postgame_review_items
--
--   migration 000200 (practice deepening — 2 tables):
--     baseball_practice_scrimmages, baseball_practice_lineup_slots
--
-- ADDITIVE / non-destructive / idempotent. NOT applied here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- From migration 000080 — elite stat event model (13 tables)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_stat_sources') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_stat_sources FROM anon;
  END IF;
  IF to_regclass('public.baseball_import_field_mappings') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_import_field_mappings FROM anon;
  END IF;
  IF to_regclass('public.baseball_plate_appearances') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_plate_appearances FROM anon;
  END IF;
  IF to_regclass('public.baseball_pitch_events') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_pitch_events FROM anon;
  END IF;
  IF to_regclass('public.baseball_batted_ball_events') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_batted_ball_events FROM anon;
  END IF;
  IF to_regclass('public.baseball_swing_events') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_swing_events FROM anon;
  END IF;
  IF to_regclass('public.baseball_fielding_events') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_fielding_events FROM anon;
  END IF;
  IF to_regclass('public.baseball_catching_events') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_catching_events FROM anon;
  END IF;
  IF to_regclass('public.baseball_baserunning_events') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_baserunning_events FROM anon;
  END IF;
  IF to_regclass('public.baseball_workload_events') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_workload_events FROM anon;
  END IF;
  IF to_regclass('public.baseball_video_events') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_video_events FROM anon;
  END IF;
  IF to_regclass('public.baseball_stat_facts') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_stat_facts FROM anon;
  END IF;
  IF to_regclass('public.baseball_player_development_metrics') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_player_development_metrics FROM anon;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- From migration 000093 — postgame reviews
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_postgame_reviews') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_postgame_reviews FROM anon;
  END IF;
  IF to_regclass('public.baseball_postgame_review_items') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_postgame_review_items FROM anon;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- From migration 000200 — practice deepening
-- (Comment in 000200 says 'No GRANTs to anon' but the explicit REVOKE is absent)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_practice_scrimmages') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_practice_scrimmages FROM anon;
  END IF;
  IF to_regclass('public.baseball_practice_lineup_slots') IS NOT NULL THEN
    REVOKE ALL ON public.baseball_practice_lineup_slots FROM anon;
  END IF;
END $$;

-- ============================================================================
-- END migration 20260625000060_baseball_anon_revoke_wave2.sql
-- ============================================================================
