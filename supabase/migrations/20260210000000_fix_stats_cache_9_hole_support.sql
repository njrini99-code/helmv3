-- Fix stats cache trigger and backfill query to use actual holes_played
-- instead of hardcoding 18 holes per round. This ensures 9-hole rounds
-- produce correct one-putt % and three-putt % calculations.

-- =============================================================================
-- 1. Replace the trigger function with corrected holes calculation
-- =============================================================================

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
  v_total_one_putts_f INTEGER;
  v_total_three_putts_f INTEGER;
  v_total_holes INTEGER;
  v_one_putt_percentage NUMERIC(5,2);
  v_three_putt_percentage NUMERIC(5,2);
  v_total_penalties_f INTEGER;
  v_penalty_per_round NUMERIC(4,2);
  v_first_round_date DATE;
  v_last_round_date DATE;
  v_par3_average NUMERIC(4,2);
  v_par4_average NUMERIC(4,2);
  v_par5_average NUMERIC(4,2);
BEGIN
  -- Get player_id from the round stats cache row
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

  -- Get date range from actual rounds
  SELECT MIN(round_date), MAX(round_date)
  INTO v_first_round_date, v_last_round_date
  FROM golf_rounds
  WHERE player_id = v_player_id AND round_status = 'completed';

  -- Calculate par averages from golf_holes
  SELECT
    AVG(CASE WHEN par = 3 THEN score END),
    AVG(CASE WHEN par = 4 THEN score END),
    AVG(CASE WHEN par = 5 THEN score END)
  INTO v_par3_average, v_par4_average, v_par5_average
  FROM golf_holes h
  JOIN golf_rounds r ON r.id = h.round_id
  WHERE r.player_id = v_player_id AND r.round_status = 'completed';

  -- Calculate actual total holes played (supports 9-hole rounds)
  SELECT COALESCE(SUM(COALESCE(holes_played, 18)), 0)
  INTO v_total_holes
  FROM golf_rounds
  WHERE player_id = v_player_id AND round_status = 'completed';

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

  -- Handle case where player has no rounds (e.g., all rounds deleted)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 2. Fix the backfill INSERT to use actual holes_played from golf_rounds
-- =============================================================================

-- Re-run backfill with corrected calculation
INSERT INTO golf_player_stats_cache (
  player_id,
  scoring_average,
  scoring_average_vs_par,
  rounds_played,
  best_round,
  worst_round,
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
)
SELECT
  rsc.player_id,
  AVG(rsc.total_score) AS scoring_average,
  AVG(rsc.score_to_par) AS scoring_average_vs_par,
  COUNT(*) AS rounds_played,
  MIN(rsc.total_score) AS best_round,
  MAX(rsc.total_score) AS worst_round,
  SUM(rsc.eagles) AS eagles,
  SUM(rsc.birdies) AS birdies,
  SUM(rsc.pars) AS pars,
  SUM(rsc.bogeys) AS bogeys,
  SUM(rsc.double_bogeys) AS double_bogeys,
  SUM(rsc.triple_plus) AS triple_plus,
  CASE WHEN SUM(rsc.fairways_total) > 0
       THEN (SUM(rsc.fairways_hit)::NUMERIC / SUM(rsc.fairways_total)) * 100
       ELSE NULL END AS driving_accuracy_percentage,
  SUM(rsc.fairways_hit) AS fairways_hit,
  SUM(rsc.fairways_total) AS fairways_total,
  CASE WHEN SUM(rsc.greens_total) > 0
       THEN (SUM(rsc.greens_hit)::NUMERIC / SUM(rsc.greens_total)) * 100
       ELSE NULL END AS gir_percentage,
  SUM(rsc.greens_hit) AS greens_hit,
  SUM(rsc.greens_total) AS greens_total,
  CASE WHEN SUM(rsc.scramble_attempts) > 0
       THEN (SUM(rsc.scrambles_converted)::NUMERIC / SUM(rsc.scramble_attempts)) * 100
       ELSE NULL END AS scrambling_percentage,
  SUM(rsc.scrambles_converted) AS scrambles_converted,
  SUM(rsc.scramble_attempts) AS scramble_attempts,
  CASE WHEN SUM(rsc.sand_attempts) > 0
       THEN (SUM(rsc.sand_saves)::NUMERIC / SUM(rsc.sand_attempts)) * 100
       ELSE NULL END AS sand_save_percentage,
  SUM(rsc.sand_saves) AS sand_saves,
  SUM(rsc.sand_attempts) AS sand_attempts,
  AVG(rsc.total_putts) AS putts_per_round,
  -- Use actual holes_played from golf_rounds instead of hardcoded 18
  CASE WHEN SUM(COALESCE(r.holes_played, 18)) > 0
       THEN (SUM(rsc.one_putts)::NUMERIC / SUM(COALESCE(r.holes_played, 18))) * 100
       ELSE NULL END AS one_putt_percentage,
  CASE WHEN SUM(COALESCE(r.holes_played, 18)) > 0
       THEN (SUM(rsc.three_putts)::NUMERIC / SUM(COALESCE(r.holes_played, 18))) * 100
       ELSE NULL END AS three_putt_percentage,
  SUM(rsc.total_putts) AS total_putts,
  AVG(rsc.penalty_strokes) AS penalty_strokes_per_round,
  SUM(rsc.penalty_strokes) AS total_penalties,
  MAX(r.round_date) AS last_round_date,
  COUNT(*) AS rounds_in_calculation,
  MIN(r.round_date) AS calculation_period_start,
  MAX(r.round_date) AS calculation_period_end,
  NOW(),
  NOW()
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
