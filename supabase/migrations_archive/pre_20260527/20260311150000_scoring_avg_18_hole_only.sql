-- ============================================================================
-- Migration: Scoring average uses 18-hole rounds only (NCAA-style)
-- ============================================================================
-- Changes:
--   1. update_player_stats_cache(): scoring_average now averages only 18-hole
--      round scores instead of blended per-hole normalization.
--      Putts per round keeps normalized (total_putts / total_holes) * 18.
--   2. update_player_stats_cache_enhanced(): last_5_average and last_10_average
--      now only consider 18-hole rounds (last 5/10 of those specifically).
-- ============================================================================


-- ============================================================================
-- 1. Fix update_player_stats_cache() — scoring_average = 18-hole only
-- ============================================================================

CREATE OR REPLACE FUNCTION update_player_stats_cache()
RETURNS TRIGGER AS $$
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
  v_scoring_average NUMERIC(5,2);
  v_scoring_average_vs_par NUMERIC(5,2);
  v_best_round_normalized NUMERIC(5,2);
  v_worst_round_normalized NUMERIC(5,2);
  v_first_round_date DATE;
  v_last_round_date DATE;
  v_par3_average NUMERIC(4,2);
  v_par4_average NUMERIC(4,2);
  v_par5_average NUMERIC(4,2);
  -- 18-hole scoring
  v_rounds_18 INTEGER;
  v_total_score_18 NUMERIC;
  v_score_to_par_18 NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_player_id := OLD.player_id;
  ELSE
    v_player_id := NEW.player_id;
  END IF;

  -- Get aggregate stats from round stats cache
  SELECT
    COUNT(*),
    SUM(total_score),
    SUM(score_to_par),
    MIN(total_score),
    MAX(total_score),
    SUM(eagles),
    SUM(birdies),
    SUM(pars),
    SUM(bogeys),
    SUM(double_bogeys),
    SUM(triple_plus),
    SUM(fairways_hit),
    SUM(fairways_total),
    SUM(greens_hit),
    SUM(greens_total),
    SUM(scrambles_converted),
    SUM(scramble_attempts),
    SUM(sand_saves),
    SUM(sand_attempts),
    SUM(total_putts),
    SUM(one_putts),
    SUM(three_putts),
    SUM(penalty_strokes)
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

  -- Get date range
  SELECT MIN(round_date), MAX(round_date)
  INTO v_first_round_date, v_last_round_date
  FROM golf_rounds
  WHERE player_id = v_player_id AND status = 'completed';

  -- Calculate par averages
  SELECT
    AVG(CASE WHEN par = 3 THEN score END),
    AVG(CASE WHEN par = 4 THEN score END),
    AVG(CASE WHEN par = 5 THEN score END)
  INTO v_par3_average, v_par4_average, v_par5_average
  FROM golf_holes h
  JOIN golf_rounds r ON r.id = h.round_id
  WHERE r.player_id = v_player_id AND r.status = 'completed';

  -- Calculate actual total holes played (supports 9-hole rounds)
  SELECT COALESCE(SUM(COALESCE(holes_played, 18)), 0)
  INTO v_total_holes
  FROM golf_rounds
  WHERE player_id = v_player_id AND status = 'completed';

  -- Scoring average: 18-hole rounds only (NCAA-style)
  SELECT COUNT(*), SUM(r.total_score), SUM(r.score_to_par)
  INTO v_rounds_18, v_total_score_18, v_score_to_par_18
  FROM golf_rounds r
  WHERE r.player_id = v_player_id
    AND r.status = 'completed'
    AND r.total_score IS NOT NULL
    AND COALESCE(r.holes_played, 18) = 18;

  -- Percentage stats (these are naturally normalized since they use
  -- raw numerator/denominator counts which are correct regardless of holes)
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

  -- Scoring average: 18-hole rounds only
  IF v_rounds_18 > 0 THEN
    v_scoring_average := v_total_score_18::NUMERIC / v_rounds_18;
    v_scoring_average_vs_par := v_score_to_par_18::NUMERIC / v_rounds_18;
  END IF;

  -- Putts, penalties: still normalize using total holes (includes 9-hole data)
  IF v_total_holes > 0 THEN
    v_putts_per_round := (v_total_putts::NUMERIC / v_total_holes) * 18;
    v_penalty_per_round := (v_total_penalties::NUMERIC / v_total_holes) * 18;
    v_one_putt_percentage := (v_total_one_putts::NUMERIC / v_total_holes) * 100;
    v_three_putt_percentage := (v_total_three_putts::NUMERIC / v_total_holes) * 100;
  ELSIF v_rounds_played > 0 THEN
    -- Fallback if total_holes is somehow 0 but rounds exist
    v_putts_per_round := v_total_putts::NUMERIC / v_rounds_played;
    v_penalty_per_round := v_total_penalties::NUMERIC / v_rounds_played;
  END IF;

  -- Normalize best_round and worst_round to 18-hole equivalents
  SELECT
    MIN(r.total_score * (18.0 / COALESCE(r.holes_played, 18))),
    MAX(r.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_best_round_normalized, v_worst_round_normalized
  FROM golf_rounds r
  WHERE r.player_id = v_player_id AND r.status = 'completed' AND r.total_score IS NOT NULL;

  -- Handle no rounds
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
    par3_average, par4_average, par5_average,
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
    one_putt_percentage, three_putt_percentage,
    total_putts,
    penalty_strokes_per_round,
    total_penalties,
    last_round_date,
    rounds_in_calculation,
    calculation_period_start, calculation_period_end,
    created_at, updated_at
  ) VALUES (
    v_player_id,
    v_scoring_average,
    v_scoring_average_vs_par,
    v_rounds_played,
    COALESCE(v_best_round_normalized::INTEGER, v_best_round),
    COALESCE(v_worst_round_normalized::INTEGER, v_worst_round),
    v_par3_average, v_par4_average, v_par5_average,
    v_total_eagles, v_total_birdies, v_total_pars,
    v_total_bogeys, v_total_double_bogeys, v_total_triple_plus,
    v_driving_accuracy,
    v_total_fairways_hit, v_total_fairways,
    v_gir_percentage,
    v_total_greens_hit, v_total_greens,
    v_scrambling_percentage,
    v_total_scrambles_converted, v_total_scramble_attempts,
    v_sand_save_percentage,
    v_total_sand_saves, v_total_sand_attempts,
    v_putts_per_round,
    v_one_putt_percentage, v_three_putt_percentage,
    v_total_putts,
    v_penalty_per_round,
    v_total_penalties,
    v_last_round_date,
    v_rounds_played,
    v_first_round_date, v_last_round_date,
    NOW(), NOW()
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. Fix update_player_stats_cache_enhanced() — last_5/last_10 use 18-hole only
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

  -- Last 5 18-hole rounds average (NCAA-style, no normalization needed)
  SELECT AVG(r.total_score)
  INTO v_last_5_avg
  FROM (
    SELECT r2.id, r2.total_score
    FROM golf_rounds r2
    WHERE r2.player_id = v_player_id
      AND r2.status = 'completed'
      AND r2.total_score IS NOT NULL
      AND COALESCE(r2.holes_played, 18) = 18
    ORDER BY r2.round_date DESC
    LIMIT 5
  ) r;

  -- Last 10 18-hole rounds average
  SELECT AVG(r.total_score)
  INTO v_last_10_avg
  FROM (
    SELECT r2.id, r2.total_score
    FROM golf_rounds r2
    WHERE r2.player_id = v_player_id
      AND r2.status = 'completed'
      AND r2.total_score IS NOT NULL
      AND COALESCE(r2.holes_played, 18) = 18
    ORDER BY r2.round_date DESC
    LIMIT 10
  ) r;

  -- Previous 5 18-hole rounds average (rounds 6-10 of 18-hole rounds)
  SELECT AVG(r.total_score)
  INTO v_prev_5_avg
  FROM (
    SELECT r2.id, r2.total_score
    FROM golf_rounds r2
    WHERE r2.player_id = v_player_id
      AND r2.status = 'completed'
      AND r2.total_score IS NOT NULL
      AND COALESCE(r2.holes_played, 18) = 18
    ORDER BY r2.round_date DESC
    LIMIT 5 OFFSET 5
  ) r;

  -- Calculate improvement trend
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
    rounds_this_season = v_rounds_this_season,
    season_start_date = v_season_start,
    round_ids_included = v_round_ids,
    is_stale = FALSE,
    next_refresh_due = NOW() + INTERVAL '1 hour',
    updated_at = NOW()
  WHERE player_id = v_player_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;
