-- ============================================================================
-- Migration: CoachHelm Wave 4 cleanup — schema hygiene
-- ============================================================================
-- Conservative cleanup: only drop artifacts that are unambiguously redundant
-- or explicitly marked deprecated. Audit flagged additional "unused" indexes
-- based on pg_stat_user_indexes idx_scan=0 — those are NOT dropped here
-- because idx_scan resets on stats refresh, so 0 doesn't reliably mean unused
-- without longer monitoring.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Drop 2 explicitly-deprecated tables (audit-flagged, zero src/ references)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public._deprecated_baseball_coach_settings;
DROP TABLE IF EXISTS public._deprecated_golf_coach_settings;

-- ---------------------------------------------------------------------------
-- Drop unambiguous duplicate indexes (same column tuple, two indexes)
-- ---------------------------------------------------------------------------
-- golf_insight_effectiveness has two UNIQUEs covering the same logical key
-- with different column orders. Keep the natural_key (matches code use).
-- This is a constraint-backed unique index, so drop the constraint not the index.
ALTER TABLE public.golf_insight_effectiveness
  DROP CONSTRAINT IF EXISTS golf_insight_effectiveness_team_id_period_start_period_end__key;

-- golf_round_reviews has THREE indexes covering round_id:
--   golf_round_reviews_round_id_key (unique)
--   idx_golf_round_reviews_round_id_unique (unique, duplicate)
--   idx_golf_round_reviews_round (non-unique, subset of either)
-- Keep golf_round_reviews_round_id_key (the natural unique), drop both others.
DROP INDEX IF EXISTS public.idx_golf_round_reviews_round_id_unique;
DROP INDEX IF EXISTS public.idx_golf_round_reviews_round;

-- golf_insight_generation_log has overlapping indexes on (player_id):
--   idx_golf_insight_gen_log_player (partial)
--   idx_golf_insight_gen_log_player_id (full)
-- Drop the partial — full index covers the partial's predicates and more.
DROP INDEX IF EXISTS public.idx_golf_insight_gen_log_player;
