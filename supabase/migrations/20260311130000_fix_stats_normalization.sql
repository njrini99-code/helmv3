-- ============================================================================
-- Migration: Fix stats normalization for 9-hole rounds
-- ============================================================================
-- Issues fixed:
--   1. scoring_average_vs_par not normalized for 9-hole rounds in trigger
--   2. update_player_stats_cache_enhanced() last_5/last_10 not normalized
--      (regression: original 20260212000004 version was not normalized;
--       consolidated 20260309100000 fixed it but this migration ensures
--       the latest version is deployed)
--   3. Scrambling in DB trigger uses (score - par) <= 0 but scoring defines
--      scramble_attempts as all missed-GIR holes. Ensure consistency.
--   4. refresh_player_stats_cache() RPC backfill query does not normalize
--      scoring_average. Fixed to use per-hole normalization.
-- ============================================================================


-- ============================================================================
-- 1. Fix update_player_stats_cache() — normalize scoring_average_vs_par
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

  -- Normalize per-round stats to 18-hole equivalents using total holes
  IF v_total_holes > 0 THEN
    v_putts_per_round := (v_total_putts::NUMERIC / v_total_holes) * 18;
    v_penalty_per_round := (v_total_penalties::NUMERIC / v_total_holes) * 18;
    v_scoring_average := (v_total_score::NUMERIC / v_total_holes) * 18;
    -- FIX: scoring_average_vs_par also needs normalization
    v_scoring_average_vs_par := (v_total_score_to_par::NUMERIC / v_total_holes) * 18;
    v_one_putt_percentage := (v_total_one_putts::NUMERIC / v_total_holes) * 100;
    v_three_putt_percentage := (v_total_three_putts::NUMERIC / v_total_holes) * 100;
  ELSIF v_rounds_played > 0 THEN
    -- Fallback if total_holes is somehow 0 but rounds exist
    v_putts_per_round := v_total_putts::NUMERIC / v_rounds_played;
    v_penalty_per_round := v_total_penalties::NUMERIC / v_rounds_played;
    v_scoring_average := v_total_score::NUMERIC / v_rounds_played;
    v_scoring_average_vs_par := v_total_score_to_par::NUMERIC / v_rounds_played;
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
-- 2. Fix update_player_stats_cache_enhanced() — normalize last_5/last_10
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
  SELECT COUNT(*), ARRAY_AGG(round_id ORDER BY created_at DESC)
  INTO v_rounds_this_season, v_round_ids
  FROM golf_round_stats_cache rsc
  JOIN golf_rounds r ON r.id = rsc.round_id
  WHERE rsc.player_id = v_player_id
    AND r.round_date >= v_season_start;

  -- Last 5 rounds average (normalized to 18-hole equivalent)
  SELECT AVG(rsc.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_last_5_avg
  FROM (
    SELECT rsc2.round_id, rsc2.total_score
    FROM golf_round_stats_cache rsc2
    JOIN golf_rounds r2 ON r2.id = rsc2.round_id
    WHERE rsc2.player_id = v_player_id
    ORDER BY r2.round_date DESC
    LIMIT 5
  ) rsc
  JOIN golf_rounds r ON r.id = rsc.round_id;

  -- Last 10 rounds average (normalized to 18-hole equivalent)
  SELECT AVG(rsc.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_last_10_avg
  FROM (
    SELECT rsc2.round_id, rsc2.total_score
    FROM golf_round_stats_cache rsc2
    JOIN golf_rounds r2 ON r2.id = rsc2.round_id
    WHERE rsc2.player_id = v_player_id
    ORDER BY r2.round_date DESC
    LIMIT 10
  ) rsc
  JOIN golf_rounds r ON r.id = rsc.round_id;

  -- Previous 5 rounds average (rounds 6-10, normalized)
  SELECT AVG(rsc.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_prev_5_avg
  FROM (
    SELECT rsc2.round_id, rsc2.total_score
    FROM golf_round_stats_cache rsc2
    JOIN golf_rounds r2 ON r2.id = rsc2.round_id
    WHERE rsc2.player_id = v_player_id
    ORDER BY r2.round_date DESC
    LIMIT 5 OFFSET 5
  ) rsc
  JOIN golf_rounds r ON r.id = rsc.round_id;

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


-- ============================================================================
-- 3. Fix refresh_player_stats_cache() RPC — normalize scoring in backfill
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_player_stats_cache(p_player_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Step 1: Delete existing round stats cache for this player
  -- This will fire the DELETE trigger on golf_round_stats_cache which cascades
  -- to update golf_player_stats_cache
  DELETE FROM golf_round_stats_cache WHERE player_id = p_player_id;

  -- Step 2: Re-insert fresh round stats from golf_rounds + golf_holes
  -- The INSERT trigger on golf_round_stats_cache will cascade to rebuild
  -- golf_player_stats_cache automatically via update_player_stats_cache()
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

  -- Step 3: Update par averages (requires separate aggregation from golf_holes)
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

  -- Step 4: Mark cache as fresh
  UPDATE golf_player_stats_cache
  SET is_stale = false,
      updated_at = NOW()
  WHERE player_id = p_player_id;
END;
$$;

COMMENT ON FUNCTION refresh_player_stats_cache(UUID) IS
  'RPC function to fully recompute stats cache for a specific player.
   Deletes and rebuilds golf_round_stats_cache rows, which cascades to
   golf_player_stats_cache via update_player_stats_cache() trigger.
   All per-round stats (scoring, putts, penalties) are normalized to
   18-hole equivalents by the trigger.';
