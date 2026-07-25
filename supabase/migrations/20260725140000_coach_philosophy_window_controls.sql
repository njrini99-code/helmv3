-- ============================================================================
-- golf_coach_philosophy — window / sample-size controls
-- ----------------------------------------------------------------------------
-- Three more constants the engine hard-codes today, promoted to per-coach
-- settings. Same contract as migration 20260725090000: EVERY DEFAULT IS THE
-- CURRENT HARD-CODED VALUE, so applying this changes nothing until a coach
-- moves a control.
--
--   min_hole_plays_for_ranking  — plays a hole needs before it can be called
--                                 "toughest"/"easiest". Today DEFAULT_MIN_PLAYS
--                                 = 3 in src/lib/golf/worst-hole-ranking.ts.
--   pattern_lookback_days       — how far back pattern mining looks. Today
--                                 WINDOW_DAYS = 90 in v2/mining/pattern-miner.ts.
--                                 Scoped to the pattern miner ONLY — the other
--                                 windows (approach 60d, course-management
--                                 365d, tee-strategy 90d) are independently
--                                 calibrated per insight type and are NOT
--                                 driven by this.
--   stats_benchmark_window_days — the "last N days vs the N before" comparison
--                                 on the Stats page. Today a hardcoded 30/60
--                                 split in actions/stats-data.ts.
--
-- Additive only. Safe on a live table: PG 11+ stores a non-volatile DEFAULT in
-- pg_attribute rather than rewriting, so ADD COLUMN ... NOT NULL DEFAULT is a
-- metadata-only change.
-- ============================================================================

ALTER TABLE public.golf_coach_philosophy
  ADD COLUMN IF NOT EXISTS min_hole_plays_for_ranking  smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS pattern_lookback_days       smallint NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS stats_benchmark_window_days smallint NOT NULL DEFAULT 30;

-- Range guards. The UI clamps too, but a value outside these would either
-- starve every ranking or make one meaningless.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_coach_philosophy_min_hole_plays_range'
  ) THEN
    ALTER TABLE public.golf_coach_philosophy
      ADD CONSTRAINT golf_coach_philosophy_min_hole_plays_range
      CHECK (min_hole_plays_for_ranking >= 2 AND min_hole_plays_for_ranking <= 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_coach_philosophy_pattern_lookback_range'
  ) THEN
    ALTER TABLE public.golf_coach_philosophy
      ADD CONSTRAINT golf_coach_philosophy_pattern_lookback_range
      CHECK (pattern_lookback_days >= 30 AND pattern_lookback_days <= 365);
  END IF;

  -- An enum-like set, not a free range: the Stats page renders "last N days vs
  -- the previous N days", and that symmetry only reads clearly at a few sizes.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_coach_philosophy_stats_benchmark_window_values'
  ) THEN
    ALTER TABLE public.golf_coach_philosophy
      ADD CONSTRAINT golf_coach_philosophy_stats_benchmark_window_values
      CHECK (stats_benchmark_window_days IN (14, 30, 60, 90));
  END IF;
END $$;

COMMENT ON COLUMN public.golf_coach_philosophy.min_hole_plays_for_ranking IS
  'Plays a hole needs before it can be ranked toughest/easiest. Default 3 = the prior DEFAULT_MIN_PLAYS in worst-hole-ranking.ts.';
COMMENT ON COLUMN public.golf_coach_philosophy.pattern_lookback_days IS
  'Rolling window (days) for v2 pattern mining. Default 90 = the prior WINDOW_DAYS in pattern-miner.ts. Does NOT drive the independently-calibrated approach/course-management/tee-strategy windows.';
COMMENT ON COLUMN public.golf_coach_philosophy.stats_benchmark_window_days IS
  'Comparison window (days) for the Stats page benchmark: last N vs the N before. Default 30 = the prior hardcoded split.';
