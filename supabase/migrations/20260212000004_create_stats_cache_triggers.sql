-- ============================================================================
-- Migration 20260212000004: Recreate Stats Cache Triggers with Correct Column Names
-- ============================================================================
--
-- Problem: The original triggers (migration 046) referenced column names that
-- no longer match the actual golf_rounds and golf_holes schema. The database
-- was migrated/rebuilt with different column names:
--
--   golf_rounds:
--     round_status  -> status
--     fairways_hit  -> total_fairways_hit
--     greens_in_regulation -> total_gir
--     greens_total  -> total_gir_possible
--     total_to_par  -> score_to_par
--     total_penalties -> (unchanged)
--
--   golf_holes:
--     green_in_regulation -> gir
--     penalties -> penalty_strokes
--     score_to_par (generated column) -> computed inline as (score - par)
--
-- As a result, the triggers failed silently and the cache tables have 0 rows.
-- This migration recreates all functions/triggers with correct column names
-- and backfills all existing completed rounds.
-- ============================================================================

-- ============================================================================
-- 1. DROP OLD TRIGGERS (so we can recreate functions cleanly)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_update_round_stats_cache ON golf_rounds;
DROP TRIGGER IF EXISTS trg_update_player_stats_cache ON golf_round_stats_cache;
DROP TRIGGER IF EXISTS trg_update_player_stats_cache_enhanced ON golf_player_stats_cache;
DROP TRIGGER IF EXISTS trg_update_player_strokes_gained ON golf_round_stats_cache;
DROP TRIGGER IF EXISTS trg_sync_round_sg_to_cache ON golf_rounds;

ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS holes_played INTEGER DEFAULT 18;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS score_to_par INTEGER;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS total_putts INTEGER;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS total_fairways_hit INTEGER;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS total_fairways INTEGER;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS total_gir INTEGER;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS total_gir_possible INTEGER;
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS total_penalties INTEGER DEFAULT 0;

-- ============================================================================
-- 2. ROUND STATS CACHE FUNCTION
--    Fires on golf_rounds INSERT/UPDATE when status = 'completed'
--    Reads from golf_holes to compute per-round stats, then UPSERTs into
--    golf_round_stats_cache.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_round_stats_cache()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_front_nine INTEGER;
  v_back_nine INTEGER;
  v_eagles INTEGER;
  v_birdies INTEGER;
  v_pars INTEGER;
  v_bogeys INTEGER;
  v_double_bogeys INTEGER;
  v_triple_plus INTEGER;
  v_one_putts INTEGER;
  v_three_putts INTEGER;
  v_scrambles_converted INTEGER;
  v_scramble_attempts INTEGER;
  v_sand_saves INTEGER;
  v_sand_attempts INTEGER;
  v_total_putts_from_holes INTEGER;
  v_total_penalties_from_holes INTEGER;
  v_hole_count INTEGER;
BEGIN
  -- Only process completed rounds
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Count how many holes this round has
  SELECT COUNT(*)
  INTO v_hole_count
  FROM golf_holes
  WHERE round_id = NEW.id AND score IS NOT NULL;

  -- If no hole data, still insert a minimal cache row from round-level data
  IF v_hole_count = 0 THEN
    INSERT INTO golf_round_stats_cache (
      round_id, player_id,
      total_score, score_to_par,
      front_nine, back_nine,
      fairways_hit, fairways_total,
      greens_hit, greens_total,
      total_putts, one_putts, three_putts,
      scrambles_converted, scramble_attempts,
      sand_saves, sand_attempts,
      eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
      penalty_strokes,
      strokes_gained_total, strokes_gained_tee,
      strokes_gained_approach, strokes_gained_around_green,
      strokes_gained_putting,
      created_at, updated_at
    ) VALUES (
      NEW.id, NEW.player_id,
      NEW.total_score, NEW.score_to_par,
      NEW.front_nine, NEW.back_nine,
      NEW.total_fairways_hit, NEW.total_fairways,
      NEW.total_gir, NEW.total_gir_possible,
      NEW.total_putts, 0, 0,
      0, 0,
      0, 0,
      0, 0, 0, 0, 0, 0,
      0,
      NEW.strokes_gained_total, NEW.strokes_gained_tee,
      NEW.strokes_gained_approach, NEW.strokes_gained_around_green,
      NEW.strokes_gained_putting,
      NOW(), NOW()
    )
    ON CONFLICT (round_id) DO UPDATE SET
      total_score = EXCLUDED.total_score,
      score_to_par = EXCLUDED.score_to_par,
      front_nine = EXCLUDED.front_nine,
      back_nine = EXCLUDED.back_nine,
      fairways_hit = EXCLUDED.fairways_hit,
      fairways_total = EXCLUDED.fairways_total,
      greens_hit = EXCLUDED.greens_hit,
      greens_total = EXCLUDED.greens_total,
      total_putts = EXCLUDED.total_putts,
      strokes_gained_total = EXCLUDED.strokes_gained_total,
      strokes_gained_tee = EXCLUDED.strokes_gained_tee,
      strokes_gained_approach = EXCLUDED.strokes_gained_approach,
      strokes_gained_around_green = EXCLUDED.strokes_gained_around_green,
      strokes_gained_putting = EXCLUDED.strokes_gained_putting,
      updated_at = NOW();

    RETURN NEW;
  END IF;

  -- Calculate front/back nine scores from holes
  SELECT
    COALESCE(SUM(CASE WHEN hole_number <= 9 THEN score ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN hole_number > 9 THEN score ELSE 0 END), 0)
  INTO v_front_nine, v_back_nine
  FROM golf_holes
  WHERE round_id = NEW.id AND score IS NOT NULL;

  -- Calculate scoring distribution using inline (score - par) since
  -- score_to_par generated column may not exist in current schema
  SELECT
    COALESCE(SUM(CASE WHEN (score - par) <= -2 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (score - par) = -1 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (score - par) = 0 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (score - par) = 1 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (score - par) = 2 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (score - par) >= 3 THEN 1 ELSE 0 END), 0)
  INTO v_eagles, v_birdies, v_pars, v_bogeys, v_double_bogeys, v_triple_plus
  FROM golf_holes
  WHERE round_id = NEW.id AND score IS NOT NULL;

  -- Calculate putting stats from holes
  SELECT
    COALESCE(SUM(CASE WHEN putts = 1 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN putts >= 3 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(putts), 0)
  INTO v_one_putts, v_three_putts, v_total_putts_from_holes
  FROM golf_holes
  WHERE round_id = NEW.id AND putts IS NOT NULL;

  -- Calculate scrambling: missed GIR but still made par or better
  -- Using gir column (not green_in_regulation)
  SELECT
    COALESCE(SUM(CASE WHEN gir = false AND (score - par) <= 0 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN gir = false THEN 1 ELSE 0 END), 0)
  INTO v_scrambles_converted, v_scramble_attempts
  FROM golf_holes
  WHERE round_id = NEW.id AND score IS NOT NULL;

  -- Calculate sand saves
  SELECT
    COALESCE(SUM(CASE WHEN sand_save = true THEN 1 ELSE 0 END), 0),
    COALESCE(COUNT(*) FILTER (WHERE sand_save IS NOT NULL), 0)
  INTO v_sand_saves, v_sand_attempts
  FROM golf_holes
  WHERE round_id = NEW.id;

  -- Calculate total penalties from holes
  SELECT COALESCE(SUM(COALESCE(penalty_strokes, 0)), 0)
  INTO v_total_penalties_from_holes
  FROM golf_holes
  WHERE round_id = NEW.id;

  -- Upsert into round stats cache
  INSERT INTO golf_round_stats_cache (
    round_id, player_id,
    total_score, score_to_par,
    front_nine, back_nine,
    fairways_hit, fairways_total,
    greens_hit, greens_total,
    total_putts, one_putts, three_putts,
    scrambles_converted, scramble_attempts,
    sand_saves, sand_attempts,
    eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
    penalty_strokes,
    strokes_gained_total, strokes_gained_tee,
    strokes_gained_approach, strokes_gained_around_green,
    strokes_gained_putting,
    created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.player_id,
    COALESCE(NEW.total_score, v_front_nine + v_back_nine),
    COALESCE(NEW.score_to_par, (v_front_nine + v_back_nine) - (
      SELECT COALESCE(SUM(par), 0) FROM golf_holes WHERE round_id = NEW.id
    )),
    v_front_nine,
    v_back_nine,
    COALESCE(NEW.total_fairways_hit, (
      SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND fairway_hit = true
    )),
    COALESCE(NEW.total_fairways, (
      SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND par > 3 AND fairway_hit IS NOT NULL
    )),
    COALESCE(NEW.total_gir, (
      SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND gir = true
    )),
    COALESCE(NEW.total_gir_possible, v_hole_count),
    COALESCE(NEW.total_putts, v_total_putts_from_holes),
    v_one_putts,
    v_three_putts,
    v_scrambles_converted,
    v_scramble_attempts,
    v_sand_saves,
    v_sand_attempts,
    v_eagles,
    v_birdies,
    v_pars,
    v_bogeys,
    v_double_bogeys,
    v_triple_plus,
    COALESCE(NEW.total_penalties, v_total_penalties_from_holes),
    NEW.strokes_gained_total,
    NEW.strokes_gained_tee,
    NEW.strokes_gained_approach,
    NEW.strokes_gained_around_green,
    NEW.strokes_gained_putting,
    NOW(),
    NOW()
  )
  ON CONFLICT (round_id) DO UPDATE SET
    total_score = EXCLUDED.total_score,
    score_to_par = EXCLUDED.score_to_par,
    front_nine = EXCLUDED.front_nine,
    back_nine = EXCLUDED.back_nine,
    fairways_hit = EXCLUDED.fairways_hit,
    fairways_total = EXCLUDED.fairways_total,
    greens_hit = EXCLUDED.greens_hit,
    greens_total = EXCLUDED.greens_total,
    total_putts = EXCLUDED.total_putts,
    one_putts = EXCLUDED.one_putts,
    three_putts = EXCLUDED.three_putts,
    scrambles_converted = EXCLUDED.scrambles_converted,
    scramble_attempts = EXCLUDED.scramble_attempts,
    sand_saves = EXCLUDED.sand_saves,
    sand_attempts = EXCLUDED.sand_attempts,
    eagles = EXCLUDED.eagles,
    birdies = EXCLUDED.birdies,
    pars = EXCLUDED.pars,
    bogeys = EXCLUDED.bogeys,
    double_bogeys = EXCLUDED.double_bogeys,
    triple_plus = EXCLUDED.triple_plus,
    penalty_strokes = EXCLUDED.penalty_strokes,
    strokes_gained_total = EXCLUDED.strokes_gained_total,
    strokes_gained_tee = EXCLUDED.strokes_gained_tee,
    strokes_gained_approach = EXCLUDED.strokes_gained_approach,
    strokes_gained_around_green = EXCLUDED.strokes_gained_around_green,
    strokes_gained_putting = EXCLUDED.strokes_gained_putting,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_round_stats_cache() IS
  'Trigger function to populate golf_round_stats_cache when a round is completed.
   Uses correct column names: status, total_fairways_hit, total_gir, score_to_par, gir, penalty_strokes.';

-- ============================================================================
-- 3. PLAYER STATS CACHE FUNCTION
--    Fires on golf_round_stats_cache INSERT/UPDATE/DELETE
--    Aggregates all round stats for the player and UPSERTs into
--    golf_player_stats_cache.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_player_stats_cache()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_player_id UUID;
  v_rounds_played INTEGER;
  v_total_score NUMERIC;
  v_total_score_to_par NUMERIC;
  v_best_round INTEGER;
  v_worst_round INTEGER;
  v_total_eagles INTEGER;
  v_total_birdies INTEGER;
  v_total_pars INTEGER;
  v_total_bogeys INTEGER;
  v_total_double_bogeys INTEGER;
  v_total_triple_plus INTEGER;
  v_total_fairways_hit INTEGER;
  v_total_fairways INTEGER;
  v_total_greens_hit INTEGER;
  v_total_greens INTEGER;
  v_total_scrambles_converted INTEGER;
  v_total_scramble_attempts INTEGER;
  v_total_sand_saves INTEGER;
  v_total_sand_attempts INTEGER;
  v_total_putts INTEGER;
  v_total_one_putts INTEGER;
  v_total_three_putts INTEGER;
  v_total_penalties INTEGER;
  v_driving_accuracy NUMERIC(5,2);
  v_gir_percentage NUMERIC(5,2);
  v_scrambling_percentage NUMERIC(5,2);
  v_sand_save_percentage NUMERIC(5,2);
  v_putts_per_round NUMERIC(4,2);
  v_total_holes INTEGER;
  v_one_putt_percentage NUMERIC(5,2);
  v_three_putt_percentage NUMERIC(5,2);
  v_penalty_per_round NUMERIC(4,2);
  v_first_round_date DATE;
  v_last_round_date DATE;
  v_par3_average NUMERIC(5,2);
  v_par4_average NUMERIC(5,2);
  v_par5_average NUMERIC(5,2);
BEGIN
  -- Determine which player to update
  IF TG_OP = 'DELETE' THEN
    v_player_id := OLD.player_id;
  ELSE
    v_player_id := NEW.player_id;
  END IF;

  -- Get aggregate stats from all cached rounds for this player
  SELECT
    COUNT(*),
    SUM(total_score),
    SUM(score_to_par),
    MIN(total_score),
    MAX(total_score),
    SUM(COALESCE(eagles, 0)),
    SUM(COALESCE(birdies, 0)),
    SUM(COALESCE(pars, 0)),
    SUM(COALESCE(bogeys, 0)),
    SUM(COALESCE(double_bogeys, 0)),
    SUM(COALESCE(triple_plus, 0)),
    SUM(COALESCE(fairways_hit, 0)),
    SUM(COALESCE(fairways_total, 0)),
    SUM(COALESCE(greens_hit, 0)),
    SUM(COALESCE(greens_total, 0)),
    SUM(COALESCE(scrambles_converted, 0)),
    SUM(COALESCE(scramble_attempts, 0)),
    SUM(COALESCE(sand_saves, 0)),
    SUM(COALESCE(sand_attempts, 0)),
    SUM(COALESCE(total_putts, 0)),
    SUM(COALESCE(one_putts, 0)),
    SUM(COALESCE(three_putts, 0)),
    SUM(COALESCE(penalty_strokes, 0))
  INTO
    v_rounds_played,
    v_total_score,
    v_total_score_to_par,
    v_best_round,
    v_worst_round,
    v_total_eagles,
    v_total_birdies,
    v_total_pars,
    v_total_bogeys,
    v_total_double_bogeys,
    v_total_triple_plus,
    v_total_fairways_hit,
    v_total_fairways,
    v_total_greens_hit,
    v_total_greens,
    v_total_scrambles_converted,
    v_total_scramble_attempts,
    v_total_sand_saves,
    v_total_sand_attempts,
    v_total_putts,
    v_total_one_putts,
    v_total_three_putts,
    v_total_penalties
  FROM golf_round_stats_cache
  WHERE player_id = v_player_id;

  -- Get date range from actual rounds (using correct column name: status)
  SELECT MIN(round_date), MAX(round_date)
  INTO v_first_round_date, v_last_round_date
  FROM golf_rounds
  WHERE player_id = v_player_id AND status = 'completed';

  -- Calculate par averages from golf_holes (using correct column: gir not green_in_regulation)
  SELECT
    AVG(CASE WHEN h.par = 3 THEN h.score END),
    AVG(CASE WHEN h.par = 4 THEN h.score END),
    AVG(CASE WHEN h.par = 5 THEN h.score END)
  INTO v_par3_average, v_par4_average, v_par5_average
  FROM golf_holes h
  JOIN golf_rounds r ON r.id = h.round_id
  WHERE r.player_id = v_player_id
    AND r.status = 'completed'
    AND h.score IS NOT NULL;

  -- Calculate actual total holes played (supports 9-hole rounds)
  SELECT COALESCE(SUM(COALESCE(holes_played, 18)), 0)
  INTO v_total_holes
  FROM golf_rounds
  WHERE player_id = v_player_id AND status = 'completed';

  -- Calculate percentages (avoiding division by zero)
  IF v_total_fairways > 0 THEN
    v_driving_accuracy := (v_total_fairways_hit::NUMERIC / v_total_fairways) * 100;
  END IF;

  IF v_total_greens > 0 THEN
    v_gir_percentage := (v_total_greens_hit::NUMERIC / v_total_greens) * 100;
  END IF;

  IF v_total_scramble_attempts > 0 THEN
    v_scrambling_percentage := (v_total_scrambles_converted::NUMERIC / v_total_scramble_attempts) * 100;
  END IF;

  IF v_total_sand_attempts > 0 THEN
    v_sand_save_percentage := (v_total_sand_saves::NUMERIC / v_total_sand_attempts) * 100;
  END IF;

  IF v_rounds_played > 0 THEN
    v_putts_per_round := v_total_putts::NUMERIC / v_rounds_played;
    v_penalty_per_round := v_total_penalties::NUMERIC / v_rounds_played;
  END IF;

  IF v_total_holes > 0 THEN
    v_one_putt_percentage := (v_total_one_putts::NUMERIC / v_total_holes) * 100;
    v_three_putt_percentage := (v_total_three_putts::NUMERIC / v_total_holes) * 100;
  END IF;

  -- Handle case where player has no rounds
  IF v_rounds_played = 0 OR v_rounds_played IS NULL THEN
    DELETE FROM golf_player_stats_cache WHERE player_id = v_player_id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Upsert into player stats cache
  INSERT INTO golf_player_stats_cache (
    player_id,
    scoring_average,
    scoring_average_vs_par,
    rounds_played,
    best_round,
    worst_round,
    par3_average,
    par4_average,
    par5_average,
    eagles,
    birdies,
    pars,
    bogeys,
    double_bogeys,
    triple_plus,
    driving_accuracy_percentage,
    fairways_hit,
    fairways_total,
    gir_percentage,
    greens_hit,
    greens_total,
    scrambling_percentage,
    scrambles_converted,
    scramble_attempts,
    sand_save_percentage,
    sand_saves,
    sand_attempts,
    putts_per_round,
    one_putt_percentage,
    three_putt_percentage,
    total_putts,
    penalty_strokes_per_round,
    total_penalties,
    last_round_date,
    rounds_in_calculation,
    calculation_period_start,
    calculation_period_end,
    created_at,
    updated_at
  ) VALUES (
    v_player_id,
    v_total_score / v_rounds_played,
    v_total_score_to_par::NUMERIC / v_rounds_played,
    v_rounds_played,
    v_best_round,
    v_worst_round,
    v_par3_average,
    v_par4_average,
    v_par5_average,
    v_total_eagles,
    v_total_birdies,
    v_total_pars,
    v_total_bogeys,
    v_total_double_bogeys,
    v_total_triple_plus,
    v_driving_accuracy,
    v_total_fairways_hit,
    v_total_fairways,
    v_gir_percentage,
    v_total_greens_hit,
    v_total_greens,
    v_scrambling_percentage,
    v_total_scrambles_converted,
    v_total_scramble_attempts,
    v_sand_save_percentage,
    v_total_sand_saves,
    v_total_sand_attempts,
    v_putts_per_round,
    v_one_putt_percentage,
    v_three_putt_percentage,
    v_total_putts,
    v_penalty_per_round,
    v_total_penalties,
    v_last_round_date,
    v_rounds_played,
    v_first_round_date,
    v_last_round_date,
    NOW(),
    NOW()
  )
  ON CONFLICT (player_id) DO UPDATE SET
    scoring_average = EXCLUDED.scoring_average,
    scoring_average_vs_par = EXCLUDED.scoring_average_vs_par,
    rounds_played = EXCLUDED.rounds_played,
    best_round = EXCLUDED.best_round,
    worst_round = EXCLUDED.worst_round,
    par3_average = EXCLUDED.par3_average,
    par4_average = EXCLUDED.par4_average,
    par5_average = EXCLUDED.par5_average,
    eagles = EXCLUDED.eagles,
    birdies = EXCLUDED.birdies,
    pars = EXCLUDED.pars,
    bogeys = EXCLUDED.bogeys,
    double_bogeys = EXCLUDED.double_bogeys,
    triple_plus = EXCLUDED.triple_plus,
    driving_accuracy_percentage = EXCLUDED.driving_accuracy_percentage,
    fairways_hit = EXCLUDED.fairways_hit,
    fairways_total = EXCLUDED.fairways_total,
    gir_percentage = EXCLUDED.gir_percentage,
    greens_hit = EXCLUDED.greens_hit,
    greens_total = EXCLUDED.greens_total,
    scrambling_percentage = EXCLUDED.scrambling_percentage,
    scrambles_converted = EXCLUDED.scrambles_converted,
    scramble_attempts = EXCLUDED.scramble_attempts,
    sand_save_percentage = EXCLUDED.sand_save_percentage,
    sand_saves = EXCLUDED.sand_saves,
    sand_attempts = EXCLUDED.sand_attempts,
    putts_per_round = EXCLUDED.putts_per_round,
    one_putt_percentage = EXCLUDED.one_putt_percentage,
    three_putt_percentage = EXCLUDED.three_putt_percentage,
    total_putts = EXCLUDED.total_putts,
    penalty_strokes_per_round = EXCLUDED.penalty_strokes_per_round,
    total_penalties = EXCLUDED.total_penalties,
    last_round_date = EXCLUDED.last_round_date,
    rounds_in_calculation = EXCLUDED.rounds_in_calculation,
    calculation_period_start = EXCLUDED.calculation_period_start,
    calculation_period_end = EXCLUDED.calculation_period_end,
    updated_at = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION update_player_stats_cache() IS
  'Trigger function to aggregate round stats into golf_player_stats_cache.
   Uses correct column names for current schema.';

-- ============================================================================
-- 4. ENHANCED PLAYER STATS (trends, last-5/10, season)
--    Fires AFTER player stats cache is updated.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_player_stats_cache_enhanced()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_player_id UUID;
  v_last_5_avg NUMERIC(5,2);
  v_last_10_avg NUMERIC(5,2);
  v_prev_5_avg NUMERIC(5,2);
  v_improvement NUMERIC(5,2);
  v_trend TEXT;
  v_round_ids UUID[];
  v_season_start DATE;
  v_rounds_this_season INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_player_id := OLD.player_id;
  ELSE
    v_player_id := NEW.player_id;
  END IF;

  -- Current college golf season start (Aug 1)
  v_season_start := make_date(
    CASE
      WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
      ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::INTEGER
    END,
    8, 1
  );

  -- Count rounds this season
  SELECT COUNT(*), ARRAY_AGG(rsc.round_id ORDER BY r.round_date DESC)
  INTO v_rounds_this_season, v_round_ids
  FROM golf_round_stats_cache rsc
  JOIN golf_rounds r ON r.id = rsc.round_id
  WHERE rsc.player_id = v_player_id
    AND r.round_date >= v_season_start;

  -- Last 5 rounds average
  SELECT AVG(total_score)
  INTO v_last_5_avg
  FROM (
    SELECT rsc.total_score
    FROM golf_round_stats_cache rsc
    JOIN golf_rounds r ON r.id = rsc.round_id
    WHERE rsc.player_id = v_player_id AND rsc.total_score IS NOT NULL
    ORDER BY r.round_date DESC
    LIMIT 5
  ) last5;

  -- Last 10 rounds average
  SELECT AVG(total_score)
  INTO v_last_10_avg
  FROM (
    SELECT rsc.total_score
    FROM golf_round_stats_cache rsc
    JOIN golf_rounds r ON r.id = rsc.round_id
    WHERE rsc.player_id = v_player_id AND rsc.total_score IS NOT NULL
    ORDER BY r.round_date DESC
    LIMIT 10
  ) last10;

  -- Previous 5 rounds average (rounds 6-10) for trend
  SELECT AVG(total_score)
  INTO v_prev_5_avg
  FROM (
    SELECT rsc.total_score
    FROM golf_round_stats_cache rsc
    JOIN golf_rounds r ON r.id = rsc.round_id
    WHERE rsc.player_id = v_player_id AND rsc.total_score IS NOT NULL
    ORDER BY r.round_date DESC
    LIMIT 5 OFFSET 5
  ) prev5;

  -- Improvement trend (lower is better in golf, so positive = improving)
  IF v_last_5_avg IS NOT NULL AND v_prev_5_avg IS NOT NULL THEN
    v_improvement := v_prev_5_avg - v_last_5_avg;
    IF v_improvement > 1.0 THEN
      v_trend := 'improving';
    ELSIF v_improvement < -1.0 THEN
      v_trend := 'declining';
    ELSE
      v_trend := 'stable';
    END IF;
  ELSE
    v_improvement := NULL;
    v_trend := 'stable';
  END IF;

  -- Update with enhanced stats
  UPDATE golf_player_stats_cache
  SET
    last_5_average = v_last_5_avg,
    last_10_average = v_last_10_avg,
    improvement_trend = v_improvement,
    trend_direction = v_trend,
    rounds_this_season = COALESCE(v_rounds_this_season, 0),
    season_start_date = v_season_start,
    round_ids_included = v_round_ids,
    is_stale = FALSE,
    next_refresh_due = NOW() + INTERVAL '1 hour',
    updated_at = NOW()
  WHERE player_id = v_player_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION update_player_stats_cache_enhanced() IS
  'Enhanced trigger function that calculates trend stats after player cache is updated';

-- ============================================================================
-- 5. STROKES GAINED PLAYER AGGREGATION
--    Fires on golf_round_stats_cache changes to update SG averages in
--    golf_player_stats_cache.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_player_stats_strokes_gained()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_sg_totals RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_player_id := OLD.player_id;
  ELSE
    v_player_id := NEW.player_id;
  END IF;

  -- Aggregate strokes gained from all completed rounds
  SELECT
    AVG(strokes_gained_total) AS sg_total_avg,
    AVG(strokes_gained_tee) AS sg_tee_avg,
    AVG(strokes_gained_approach) AS sg_approach_avg,
    AVG(strokes_gained_around_green) AS sg_around_green_avg,
    AVG(strokes_gained_putting) AS sg_putting_avg,
    SUM(strokes_gained_total) AS sg_total_sum,
    SUM(strokes_gained_tee) AS sg_tee_sum,
    SUM(strokes_gained_approach) AS sg_approach_sum,
    SUM(strokes_gained_around_green) AS sg_around_green_sum,
    SUM(strokes_gained_putting) AS sg_putting_sum
  INTO v_sg_totals
  FROM golf_round_stats_cache
  WHERE player_id = v_player_id
    AND strokes_gained_total IS NOT NULL;

  -- Only update if the player stats row already exists
  UPDATE golf_player_stats_cache
  SET
    strokes_gained_total = v_sg_totals.sg_total_sum,
    strokes_gained_tee = v_sg_totals.sg_tee_sum,
    strokes_gained_approach = v_sg_totals.sg_approach_sum,
    strokes_gained_around_green = v_sg_totals.sg_around_green_sum,
    strokes_gained_putting = v_sg_totals.sg_putting_sum,
    sg_total_per_round = ROUND(v_sg_totals.sg_total_avg, 2),
    sg_tee_per_round = ROUND(v_sg_totals.sg_tee_avg, 2),
    sg_approach_per_round = ROUND(v_sg_totals.sg_approach_avg, 2),
    sg_around_green_per_round = ROUND(v_sg_totals.sg_around_green_avg, 2),
    sg_putting_per_round = ROUND(v_sg_totals.sg_putting_avg, 2),
    updated_at = NOW()
  WHERE player_id = v_player_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION update_player_stats_strokes_gained() IS
  'Updates player stats cache with aggregated strokes gained data';

-- ============================================================================
-- 6. SG SYNC FROM GOLF_ROUNDS TO ROUND STATS CACHE
--    When SG columns on golf_rounds are updated after initial round completion,
--    sync them to the cache.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_round_stats_cache_with_sg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  UPDATE golf_round_stats_cache
  SET
    strokes_gained_total = NEW.strokes_gained_total,
    strokes_gained_tee = NEW.strokes_gained_tee,
    strokes_gained_approach = NEW.strokes_gained_approach,
    strokes_gained_around_green = NEW.strokes_gained_around_green,
    strokes_gained_putting = NEW.strokes_gained_putting,
    updated_at = NOW()
  WHERE round_id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_round_stats_cache_with_sg() IS
  'Copies strokes gained values from golf_rounds to golf_round_stats_cache';

-- ============================================================================
-- 7. REFRESH HELPER FUNCTION
--    Manual refresh for a specific player (admin/debugging).
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_player_stats_cache(p_player_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Refresh all round stats for this player
  INSERT INTO golf_round_stats_cache (
    round_id, player_id,
    total_score, score_to_par,
    front_nine, back_nine,
    fairways_hit, fairways_total,
    greens_hit, greens_total,
    total_putts, one_putts, three_putts,
    scrambles_converted, scramble_attempts,
    sand_saves, sand_attempts,
    eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
    penalty_strokes,
    strokes_gained_total, strokes_gained_tee,
    strokes_gained_approach, strokes_gained_around_green,
    strokes_gained_putting,
    created_at, updated_at
  )
  SELECT
    r.id AS round_id,
    r.player_id,
    r.total_score,
    r.score_to_par,
    COALESCE(r.front_nine, SUM(h.score) FILTER (WHERE h.hole_number <= 9), 0),
    COALESCE(r.back_nine, SUM(h.score) FILTER (WHERE h.hole_number > 9), 0),
    COALESCE(r.total_fairways_hit, COUNT(*) FILTER (WHERE h.fairway_hit = true)),
    COALESCE(r.total_fairways, COUNT(*) FILTER (WHERE h.par > 3 AND h.fairway_hit IS NOT NULL)),
    COALESCE(r.total_gir, COUNT(*) FILTER (WHERE h.gir = true)),
    COALESCE(r.total_gir_possible, COUNT(*) FILTER (WHERE h.score IS NOT NULL)),
    COALESCE(r.total_putts, SUM(h.putts)),
    COALESCE(COUNT(*) FILTER (WHERE h.putts = 1), 0) AS one_putts,
    COALESCE(COUNT(*) FILTER (WHERE h.putts >= 3), 0) AS three_putts,
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND (h.score - h.par) <= 0 AND h.score IS NOT NULL), 0) AS scrambles_converted,
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND h.score IS NOT NULL), 0) AS scramble_attempts,
    COALESCE(COUNT(*) FILTER (WHERE h.sand_save = true), 0) AS sand_saves,
    COALESCE(COUNT(*) FILTER (WHERE h.sand_save IS NOT NULL), 0) AS sand_attempts,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) <= -2), 0) AS eagles,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = -1), 0) AS birdies,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 0), 0) AS pars,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 1), 0) AS bogeys,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 2), 0) AS double_bogeys,
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) >= 3), 0) AS triple_plus,
    COALESCE(r.total_penalties, SUM(COALESCE(h.penalty_strokes, 0))),
    r.strokes_gained_total,
    r.strokes_gained_tee,
    r.strokes_gained_approach,
    r.strokes_gained_around_green,
    r.strokes_gained_putting,
    NOW(),
    NOW()
  FROM golf_rounds r
  LEFT JOIN golf_holes h ON h.round_id = r.id
  WHERE r.player_id = p_player_id AND r.status = 'completed'
  GROUP BY r.id, r.player_id, r.total_score, r.score_to_par,
           r.front_nine, r.back_nine,
           r.total_fairways_hit, r.total_fairways,
           r.total_gir, r.total_gir_possible,
           r.total_putts, r.total_penalties,
           r.strokes_gained_total, r.strokes_gained_tee,
           r.strokes_gained_approach, r.strokes_gained_around_green,
           r.strokes_gained_putting
  ON CONFLICT (round_id) DO UPDATE SET
    total_score = EXCLUDED.total_score,
    score_to_par = EXCLUDED.score_to_par,
    front_nine = EXCLUDED.front_nine,
    back_nine = EXCLUDED.back_nine,
    fairways_hit = EXCLUDED.fairways_hit,
    fairways_total = EXCLUDED.fairways_total,
    greens_hit = EXCLUDED.greens_hit,
    greens_total = EXCLUDED.greens_total,
    total_putts = EXCLUDED.total_putts,
    one_putts = EXCLUDED.one_putts,
    three_putts = EXCLUDED.three_putts,
    scrambles_converted = EXCLUDED.scrambles_converted,
    scramble_attempts = EXCLUDED.scramble_attempts,
    sand_saves = EXCLUDED.sand_saves,
    sand_attempts = EXCLUDED.sand_attempts,
    eagles = EXCLUDED.eagles,
    birdies = EXCLUDED.birdies,
    pars = EXCLUDED.pars,
    bogeys = EXCLUDED.bogeys,
    double_bogeys = EXCLUDED.double_bogeys,
    triple_plus = EXCLUDED.triple_plus,
    penalty_strokes = EXCLUDED.penalty_strokes,
    strokes_gained_total = EXCLUDED.strokes_gained_total,
    strokes_gained_tee = EXCLUDED.strokes_gained_tee,
    strokes_gained_approach = EXCLUDED.strokes_gained_approach,
    strokes_gained_around_green = EXCLUDED.strokes_gained_around_green,
    strokes_gained_putting = EXCLUDED.strokes_gained_putting,
    updated_at = NOW();

  -- Player stats cache trigger will fire automatically from the above UPSERTs.
  -- Do one final pass for par averages.
  UPDATE golf_player_stats_cache psc
  SET
    par3_average = sub.par3_avg,
    par4_average = sub.par4_avg,
    par5_average = sub.par5_avg,
    updated_at = NOW()
  FROM (
    SELECT
      AVG(h.score) FILTER (WHERE h.par = 3) AS par3_avg,
      AVG(h.score) FILTER (WHERE h.par = 4) AS par4_avg,
      AVG(h.score) FILTER (WHERE h.par = 5) AS par5_avg
    FROM golf_holes h
    JOIN golf_rounds r ON r.id = h.round_id
    WHERE r.player_id = p_player_id
      AND r.status = 'completed'
      AND h.score IS NOT NULL
  ) sub
  WHERE psc.player_id = p_player_id;
END;
$$;

COMMENT ON FUNCTION refresh_player_stats_cache(UUID) IS
  'Manually refresh stats cache for a specific player - useful for debugging or data repair';

-- ============================================================================
-- 8. CREATE TRIGGERS
-- ============================================================================

-- Trigger on golf_rounds: fires when a round is completed (or updated while completed)
CREATE TRIGGER trg_update_round_stats_cache
  AFTER INSERT OR UPDATE OF status, total_score, score_to_par, total_putts,
    total_fairways_hit, total_fairways, total_gir, total_gir_possible, total_penalties
  ON golf_rounds
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION update_round_stats_cache();

COMMENT ON TRIGGER trg_update_round_stats_cache ON golf_rounds IS
  'Populates golf_round_stats_cache when a round status changes to completed';

-- Trigger on golf_round_stats_cache: cascades to player aggregate stats
CREATE TRIGGER trg_update_player_stats_cache
  AFTER INSERT OR UPDATE OR DELETE
  ON golf_round_stats_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_player_stats_cache();

COMMENT ON TRIGGER trg_update_player_stats_cache ON golf_round_stats_cache IS
  'Updates golf_player_stats_cache when round stats change';

-- Trigger on golf_player_stats_cache: calculates trend/enhanced stats
CREATE TRIGGER trg_update_player_stats_cache_enhanced
  AFTER INSERT OR UPDATE
  ON golf_player_stats_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_player_stats_cache_enhanced();

COMMENT ON TRIGGER trg_update_player_stats_cache_enhanced ON golf_player_stats_cache IS
  'Calculates trend stats (last 5/10 average, improvement) after base stats are updated';

-- Trigger on golf_round_stats_cache: cascades SG updates to player stats
CREATE TRIGGER trg_update_player_strokes_gained
  AFTER INSERT OR UPDATE OR DELETE
  ON golf_round_stats_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_player_stats_strokes_gained();

COMMENT ON TRIGGER trg_update_player_strokes_gained ON golf_round_stats_cache IS
  'Cascades strokes gained updates to player stats cache when round stats change';

-- Trigger to sync SG from golf_rounds to round stats cache
CREATE TRIGGER trg_sync_round_sg_to_cache
  AFTER UPDATE OF strokes_gained_total, strokes_gained_tee,
    strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting
  ON golf_rounds
  FOR EACH ROW
  EXECUTE FUNCTION update_round_stats_cache_with_sg();

COMMENT ON TRIGGER trg_sync_round_sg_to_cache ON golf_rounds IS
  'Syncs strokes gained values to round stats cache after they are calculated';

-- ============================================================================
-- 9. BACKFILL: Populate round stats cache for all existing completed rounds
-- ============================================================================

-- Clear any stale/partial data from previous failed attempts
TRUNCATE golf_round_stats_cache CASCADE;
TRUNCATE golf_player_stats_cache CASCADE;

-- Temporarily disable the cascade triggers during backfill to avoid
-- per-row player stats recalculation (we will do it in bulk after)
ALTER TABLE golf_round_stats_cache DISABLE TRIGGER trg_update_player_stats_cache;
ALTER TABLE golf_round_stats_cache DISABLE TRIGGER trg_update_player_strokes_gained;
ALTER TABLE golf_player_stats_cache DISABLE TRIGGER trg_update_player_stats_cache_enhanced;

-- Backfill round stats cache from all completed rounds
-- Uses correct column names: status, total_fairways_hit, total_gir,
-- total_gir_possible, score_to_par, gir, penalty_strokes
INSERT INTO golf_round_stats_cache (
  round_id, player_id,
  total_score, score_to_par,
  front_nine, back_nine,
  fairways_hit, fairways_total,
  greens_hit, greens_total,
  total_putts, one_putts, three_putts,
  scrambles_converted, scramble_attempts,
  sand_saves, sand_attempts,
  eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
  penalty_strokes,
  strokes_gained_total, strokes_gained_tee,
  strokes_gained_approach, strokes_gained_around_green,
  strokes_gained_putting,
  created_at, updated_at
)
SELECT
  r.id AS round_id,
  r.player_id,
  r.total_score,
  r.score_to_par,
  COALESCE(r.front_nine, SUM(h.score) FILTER (WHERE h.hole_number <= 9), 0) AS front_nine,
  COALESCE(r.back_nine, SUM(h.score) FILTER (WHERE h.hole_number > 9), 0) AS back_nine,
  COALESCE(r.total_fairways_hit, COUNT(*) FILTER (WHERE h.fairway_hit = true)) AS fairways_hit,
  COALESCE(r.total_fairways, COUNT(*) FILTER (WHERE h.par > 3 AND h.fairway_hit IS NOT NULL)) AS fairways_total,
  COALESCE(r.total_gir, COUNT(*) FILTER (WHERE h.gir = true)) AS greens_hit,
  COALESCE(r.total_gir_possible, COUNT(*) FILTER (WHERE h.score IS NOT NULL)) AS greens_total,
  COALESCE(r.total_putts, SUM(h.putts)) AS total_putts,
  COALESCE(COUNT(*) FILTER (WHERE h.putts = 1), 0) AS one_putts,
  COALESCE(COUNT(*) FILTER (WHERE h.putts >= 3), 0) AS three_putts,
  COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND h.score IS NOT NULL AND (h.score - h.par) <= 0), 0) AS scrambles_converted,
  COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND h.score IS NOT NULL), 0) AS scramble_attempts,
  COALESCE(COUNT(*) FILTER (WHERE h.sand_save = true), 0) AS sand_saves,
  COALESCE(COUNT(*) FILTER (WHERE h.sand_save IS NOT NULL), 0) AS sand_attempts,
  COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) <= -2), 0) AS eagles,
  COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = -1), 0) AS birdies,
  COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 0), 0) AS pars,
  COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 1), 0) AS bogeys,
  COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 2), 0) AS double_bogeys,
  COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) >= 3), 0) AS triple_plus,
  COALESCE(r.total_penalties, SUM(COALESCE(h.penalty_strokes, 0))) AS penalty_strokes,
  r.strokes_gained_total,
  r.strokes_gained_tee,
  r.strokes_gained_approach,
  r.strokes_gained_around_green,
  r.strokes_gained_putting,
  NOW(),
  NOW()
FROM golf_rounds r
LEFT JOIN golf_holes h ON h.round_id = r.id
WHERE r.status = 'completed'
GROUP BY r.id, r.player_id, r.total_score, r.score_to_par,
         r.front_nine, r.back_nine,
         r.total_fairways_hit, r.total_fairways,
         r.total_gir, r.total_gir_possible,
         r.total_putts, r.total_penalties,
         r.strokes_gained_total, r.strokes_gained_tee,
         r.strokes_gained_approach, r.strokes_gained_around_green,
         r.strokes_gained_putting
ON CONFLICT (round_id) DO NOTHING;

-- Bulk backfill player stats cache (more efficient than per-row triggers)
INSERT INTO golf_player_stats_cache (
  player_id,
  scoring_average,
  scoring_average_vs_par,
  rounds_played,
  best_round,
  worst_round,
  eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
  driving_accuracy_percentage,
  fairways_hit, fairways_total,
  gir_percentage,
  greens_hit, greens_total,
  scrambling_percentage,
  scrambles_converted, scramble_attempts,
  sand_save_percentage,
  sand_saves, sand_attempts,
  putts_per_round,
  one_putt_percentage,
  three_putt_percentage,
  total_putts,
  penalty_strokes_per_round,
  total_penalties,
  last_round_date,
  rounds_in_calculation,
  calculation_period_start,
  calculation_period_end,
  created_at, updated_at
)
SELECT
  rsc.player_id,
  AVG(rsc.total_score) AS scoring_average,
  AVG(rsc.score_to_par) AS scoring_average_vs_par,
  COUNT(*) AS rounds_played,
  MIN(rsc.total_score) AS best_round,
  MAX(rsc.total_score) AS worst_round,
  SUM(COALESCE(rsc.eagles, 0)),
  SUM(COALESCE(rsc.birdies, 0)),
  SUM(COALESCE(rsc.pars, 0)),
  SUM(COALESCE(rsc.bogeys, 0)),
  SUM(COALESCE(rsc.double_bogeys, 0)),
  SUM(COALESCE(rsc.triple_plus, 0)),
  CASE WHEN SUM(COALESCE(rsc.fairways_total, 0)) > 0
       THEN (SUM(COALESCE(rsc.fairways_hit, 0))::NUMERIC / SUM(rsc.fairways_total)) * 100
       ELSE NULL END,
  SUM(COALESCE(rsc.fairways_hit, 0)),
  SUM(COALESCE(rsc.fairways_total, 0)),
  CASE WHEN SUM(COALESCE(rsc.greens_total, 0)) > 0
       THEN (SUM(COALESCE(rsc.greens_hit, 0))::NUMERIC / SUM(rsc.greens_total)) * 100
       ELSE NULL END,
  SUM(COALESCE(rsc.greens_hit, 0)),
  SUM(COALESCE(rsc.greens_total, 0)),
  CASE WHEN SUM(COALESCE(rsc.scramble_attempts, 0)) > 0
       THEN (SUM(COALESCE(rsc.scrambles_converted, 0))::NUMERIC / SUM(rsc.scramble_attempts)) * 100
       ELSE NULL END,
  SUM(COALESCE(rsc.scrambles_converted, 0)),
  SUM(COALESCE(rsc.scramble_attempts, 0)),
  CASE WHEN SUM(COALESCE(rsc.sand_attempts, 0)) > 0
       THEN (SUM(COALESCE(rsc.sand_saves, 0))::NUMERIC / SUM(rsc.sand_attempts)) * 100
       ELSE NULL END,
  SUM(COALESCE(rsc.sand_saves, 0)),
  SUM(COALESCE(rsc.sand_attempts, 0)),
  AVG(rsc.total_putts),
  -- Use actual holes_played (supports 9-hole rounds)
  CASE WHEN SUM(COALESCE(r.holes_played, 18)) > 0
       THEN (SUM(COALESCE(rsc.one_putts, 0))::NUMERIC / SUM(COALESCE(r.holes_played, 18))) * 100
       ELSE NULL END,
  CASE WHEN SUM(COALESCE(r.holes_played, 18)) > 0
       THEN (SUM(COALESCE(rsc.three_putts, 0))::NUMERIC / SUM(COALESCE(r.holes_played, 18))) * 100
       ELSE NULL END,
  SUM(COALESCE(rsc.total_putts, 0)),
  AVG(COALESCE(rsc.penalty_strokes, 0)),
  SUM(COALESCE(rsc.penalty_strokes, 0)),
  MAX(r.round_date),
  COUNT(*),
  MIN(r.round_date),
  MAX(r.round_date),
  NOW(), NOW()
FROM golf_round_stats_cache rsc
JOIN golf_rounds r ON r.id = rsc.round_id
GROUP BY rsc.player_id
ON CONFLICT (player_id) DO UPDATE SET
  scoring_average = EXCLUDED.scoring_average,
  scoring_average_vs_par = EXCLUDED.scoring_average_vs_par,
  rounds_played = EXCLUDED.rounds_played,
  best_round = EXCLUDED.best_round,
  worst_round = EXCLUDED.worst_round,
  eagles = EXCLUDED.eagles,
  birdies = EXCLUDED.birdies,
  pars = EXCLUDED.pars,
  bogeys = EXCLUDED.bogeys,
  double_bogeys = EXCLUDED.double_bogeys,
  triple_plus = EXCLUDED.triple_plus,
  driving_accuracy_percentage = EXCLUDED.driving_accuracy_percentage,
  fairways_hit = EXCLUDED.fairways_hit,
  fairways_total = EXCLUDED.fairways_total,
  gir_percentage = EXCLUDED.gir_percentage,
  greens_hit = EXCLUDED.greens_hit,
  greens_total = EXCLUDED.greens_total,
  scrambling_percentage = EXCLUDED.scrambling_percentage,
  scrambles_converted = EXCLUDED.scrambles_converted,
  scramble_attempts = EXCLUDED.scramble_attempts,
  sand_save_percentage = EXCLUDED.sand_save_percentage,
  sand_saves = EXCLUDED.sand_saves,
  sand_attempts = EXCLUDED.sand_attempts,
  putts_per_round = EXCLUDED.putts_per_round,
  one_putt_percentage = EXCLUDED.one_putt_percentage,
  three_putt_percentage = EXCLUDED.three_putt_percentage,
  total_putts = EXCLUDED.total_putts,
  penalty_strokes_per_round = EXCLUDED.penalty_strokes_per_round,
  total_penalties = EXCLUDED.total_penalties,
  last_round_date = EXCLUDED.last_round_date,
  rounds_in_calculation = EXCLUDED.rounds_in_calculation,
  calculation_period_start = EXCLUDED.calculation_period_start,
  calculation_period_end = EXCLUDED.calculation_period_end,
  updated_at = NOW();

-- Backfill par averages (separate query due to aggregation from golf_holes)
UPDATE golf_player_stats_cache psc
SET
  par3_average = sub.par3_avg,
  par4_average = sub.par4_avg,
  par5_average = sub.par5_avg
FROM (
  SELECT
    r.player_id,
    AVG(h.score) FILTER (WHERE h.par = 3 AND h.score IS NOT NULL) AS par3_avg,
    AVG(h.score) FILTER (WHERE h.par = 4 AND h.score IS NOT NULL) AS par4_avg,
    AVG(h.score) FILTER (WHERE h.par = 5 AND h.score IS NOT NULL) AS par5_avg
  FROM golf_holes h
  JOIN golf_rounds r ON r.id = h.round_id
  WHERE r.status = 'completed'
  GROUP BY r.player_id
) sub
WHERE psc.player_id = sub.player_id;

-- Backfill strokes gained aggregates into player stats cache
UPDATE golf_player_stats_cache psc
SET
  strokes_gained_total = sub.sg_total_sum,
  strokes_gained_tee = sub.sg_tee_sum,
  strokes_gained_approach = sub.sg_approach_sum,
  strokes_gained_around_green = sub.sg_around_green_sum,
  strokes_gained_putting = sub.sg_putting_sum,
  sg_total_per_round = ROUND(sub.sg_total_avg, 2),
  sg_tee_per_round = ROUND(sub.sg_tee_avg, 2),
  sg_approach_per_round = ROUND(sub.sg_approach_avg, 2),
  sg_around_green_per_round = ROUND(sub.sg_around_green_avg, 2),
  sg_putting_per_round = ROUND(sub.sg_putting_avg, 2)
FROM (
  SELECT
    rsc.player_id,
    AVG(rsc.strokes_gained_total) AS sg_total_avg,
    AVG(rsc.strokes_gained_tee) AS sg_tee_avg,
    AVG(rsc.strokes_gained_approach) AS sg_approach_avg,
    AVG(rsc.strokes_gained_around_green) AS sg_around_green_avg,
    AVG(rsc.strokes_gained_putting) AS sg_putting_avg,
    SUM(rsc.strokes_gained_total) AS sg_total_sum,
    SUM(rsc.strokes_gained_tee) AS sg_tee_sum,
    SUM(rsc.strokes_gained_approach) AS sg_approach_sum,
    SUM(rsc.strokes_gained_around_green) AS sg_around_green_sum,
    SUM(rsc.strokes_gained_putting) AS sg_putting_sum
  FROM golf_round_stats_cache rsc
  WHERE rsc.strokes_gained_total IS NOT NULL
  GROUP BY rsc.player_id
) sub
WHERE psc.player_id = sub.player_id;

-- Re-enable the cascade triggers
ALTER TABLE golf_round_stats_cache ENABLE TRIGGER trg_update_player_stats_cache;
ALTER TABLE golf_round_stats_cache ENABLE TRIGGER trg_update_player_strokes_gained;
ALTER TABLE golf_player_stats_cache ENABLE TRIGGER trg_update_player_stats_cache_enhanced;

-- Now run enhanced stats for all players (trends, season, etc.)
DO $$
DECLARE
  player_rec RECORD;
BEGIN
  FOR player_rec IN
    SELECT DISTINCT player_id FROM golf_player_stats_cache
  LOOP
    -- Touch updated_at to fire the enhanced trigger
    UPDATE golf_player_stats_cache
    SET updated_at = NOW()
    WHERE player_id = player_rec.player_id;
  END LOOP;
END $$;

-- ============================================================================
-- 10. DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE golf_round_stats_cache IS
  'Cached per-round statistics, populated automatically by trigger when round status = completed.
   Fixed in migration 20260212000004 to use correct column names (status, total_fairways_hit, total_gir, score_to_par, gir, penalty_strokes).';

COMMENT ON TABLE golf_player_stats_cache IS
  'Aggregated player statistics across all completed rounds, automatically updated via cascade trigger.
   Fixed in migration 20260212000004 to use correct column names.';
