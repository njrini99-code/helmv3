-- ============================================================================
-- Migration 046: Stats Cache Triggers
-- Creates triggers to automatically populate golf_round_stats_cache and
-- golf_player_stats_cache tables when rounds are completed
-- ============================================================================

-- ============================================================================
-- 1. ROUND STATS CACHE TRIGGER FUNCTION
-- Fires AFTER INSERT OR UPDATE on golf_rounds when status = 'completed'
-- Calculates stats from golf_holes and upserts into golf_round_stats_cache
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
BEGIN
  -- Only process completed rounds
  IF NEW.round_status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Calculate front/back nine scores
  SELECT
    COALESCE(SUM(CASE WHEN hole_number <= 9 THEN score ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN hole_number > 9 THEN score ELSE 0 END), 0)
  INTO v_front_nine, v_back_nine
  FROM golf_holes
  WHERE round_id = NEW.id;

  -- Calculate scoring distribution
  SELECT
    COALESCE(SUM(CASE WHEN score_to_par <= -2 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN score_to_par = -1 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN score_to_par = 0 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN score_to_par = 1 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN score_to_par = 2 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN score_to_par >= 3 THEN 1 ELSE 0 END), 0)
  INTO v_eagles, v_birdies, v_pars, v_bogeys, v_double_bogeys, v_triple_plus
  FROM golf_holes
  WHERE round_id = NEW.id;

  -- Calculate putting stats
  SELECT
    COALESCE(SUM(CASE WHEN putts = 1 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN putts >= 3 THEN 1 ELSE 0 END), 0)
  INTO v_one_putts, v_three_putts
  FROM golf_holes
  WHERE round_id = NEW.id;

  -- Calculate scrambling (missed GIR but still made par or better)
  SELECT
    COALESCE(SUM(CASE WHEN green_in_regulation = false AND score_to_par <= 0 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN green_in_regulation = false THEN 1 ELSE 0 END), 0)
  INTO v_scrambles_converted, v_scramble_attempts
  FROM golf_holes
  WHERE round_id = NEW.id;

  -- Calculate sand saves (up_and_down from sand)
  SELECT
    COALESCE(SUM(CASE WHEN sand_save = true THEN 1 ELSE 0 END), 0),
    COALESCE(COUNT(*) FILTER (WHERE sand_save IS NOT NULL), 0)
  INTO v_sand_saves, v_sand_attempts
  FROM golf_holes
  WHERE round_id = NEW.id;

  -- Upsert into round stats cache
  INSERT INTO golf_round_stats_cache (
    round_id,
    player_id,
    total_score,
    score_to_par,
    front_nine,
    back_nine,
    fairways_hit,
    fairways_total,
    greens_hit,
    greens_total,
    total_putts,
    one_putts,
    three_putts,
    scrambles_converted,
    scramble_attempts,
    sand_saves,
    sand_attempts,
    eagles,
    birdies,
    pars,
    bogeys,
    double_bogeys,
    triple_plus,
    penalty_strokes,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.player_id,
    NEW.total_score,
    NEW.total_to_par,
    v_front_nine,
    v_back_nine,
    NEW.fairways_hit,
    NEW.fairways_total,
    NEW.greens_in_regulation,
    NEW.greens_total,
    NEW.total_putts,
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
    NEW.total_penalties,
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
    updated_at = NOW();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_round_stats_cache() IS
  'Trigger function to populate golf_round_stats_cache when a round is completed';

-- ============================================================================
-- 2. PLAYER STATS CACHE TRIGGER FUNCTION
-- Fires AFTER INSERT OR UPDATE OR DELETE on golf_round_stats_cache
-- Aggregates all rounds for the player and calculates averages
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
  v_scoring_average NUMERIC(5,2);
  v_scoring_average_vs_par NUMERIC(5,2);
  v_best_round INTEGER;
  v_worst_round INTEGER;
  v_par3_average NUMERIC(5,2);
  v_par4_average NUMERIC(5,2);
  v_par5_average NUMERIC(5,2);
  v_total_eagles INTEGER;
  v_total_birdies INTEGER;
  v_total_pars INTEGER;
  v_total_bogeys INTEGER;
  v_total_doubles INTEGER;
  v_total_triples INTEGER;
  v_total_fairways_hit INTEGER;
  v_total_fairways INTEGER;
  v_driving_accuracy NUMERIC(5,2);
  v_total_greens_hit INTEGER;
  v_total_greens INTEGER;
  v_gir_percentage NUMERIC(5,2);
  v_total_scrambles_converted INTEGER;
  v_total_scramble_attempts INTEGER;
  v_scrambling_percentage NUMERIC(5,2);
  v_total_sand_saves INTEGER;
  v_total_sand_attempts INTEGER;
  v_sand_save_percentage NUMERIC(5,2);
  v_total_putts INTEGER;
  v_putts_per_round NUMERIC(4,2);
  v_total_one_putts INTEGER;
  v_total_three_putts INTEGER;
  v_total_holes INTEGER;
  v_one_putt_percentage NUMERIC(5,2);
  v_three_putt_percentage NUMERIC(5,2);
  v_total_penalties INTEGER;
  v_penalty_per_round NUMERIC(4,2);
  v_last_round_date DATE;
  v_first_round_date DATE;
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
    AVG(total_score),
    AVG(score_to_par),
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
    v_scoring_average,
    v_scoring_average_vs_par,
    v_best_round,
    v_worst_round,
    v_total_eagles,
    v_total_birdies,
    v_total_pars,
    v_total_bogeys,
    v_total_doubles,
    v_total_triples,
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

  -- Calculate percentages (avoiding division by zero)
  v_total_holes := v_rounds_played * 18;

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
    v_scoring_average,
    v_scoring_average_vs_par,
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
    v_total_doubles,
    v_total_triples,
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
  'Trigger function to aggregate round stats into golf_player_stats_cache';

-- ============================================================================
-- 3. CREATE TRIGGERS
-- ============================================================================

-- Drop existing triggers if they exist (idempotent)
DROP TRIGGER IF EXISTS trg_update_round_stats_cache ON golf_rounds;
DROP TRIGGER IF EXISTS trg_update_player_stats_cache ON golf_round_stats_cache;

-- Trigger on golf_rounds: fires when a round is completed
CREATE TRIGGER trg_update_round_stats_cache
  AFTER INSERT OR UPDATE OF round_status, total_score, total_to_par, total_putts,
    fairways_hit, fairways_total, greens_in_regulation, greens_total, total_penalties
  ON golf_rounds
  FOR EACH ROW
  WHEN (NEW.round_status = 'completed')
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

-- ============================================================================
-- 4. BACKFILL EXISTING DATA
-- One-time population of stats caches for all completed rounds
-- ============================================================================

-- First, backfill round stats cache for all completed rounds
INSERT INTO golf_round_stats_cache (
  round_id,
  player_id,
  total_score,
  score_to_par,
  front_nine,
  back_nine,
  fairways_hit,
  fairways_total,
  greens_hit,
  greens_total,
  total_putts,
  one_putts,
  three_putts,
  scrambles_converted,
  scramble_attempts,
  sand_saves,
  sand_attempts,
  eagles,
  birdies,
  pars,
  bogeys,
  double_bogeys,
  triple_plus,
  penalty_strokes,
  created_at,
  updated_at
)
SELECT
  r.id AS round_id,
  r.player_id,
  r.total_score,
  r.total_to_par,
  COALESCE(SUM(h.score) FILTER (WHERE h.hole_number <= 9), 0) AS front_nine,
  COALESCE(SUM(h.score) FILTER (WHERE h.hole_number > 9), 0) AS back_nine,
  r.fairways_hit,
  r.fairways_total,
  r.greens_in_regulation,
  r.greens_total,
  r.total_putts,
  COALESCE(COUNT(*) FILTER (WHERE h.putts = 1), 0) AS one_putts,
  COALESCE(COUNT(*) FILTER (WHERE h.putts >= 3), 0) AS three_putts,
  COALESCE(COUNT(*) FILTER (WHERE h.green_in_regulation = false AND h.score_to_par <= 0), 0) AS scrambles_converted,
  COALESCE(COUNT(*) FILTER (WHERE h.green_in_regulation = false), 0) AS scramble_attempts,
  COALESCE(COUNT(*) FILTER (WHERE h.sand_save = true), 0) AS sand_saves,
  COALESCE(COUNT(*) FILTER (WHERE h.sand_save IS NOT NULL), 0) AS sand_attempts,
  COALESCE(COUNT(*) FILTER (WHERE h.score_to_par <= -2), 0) AS eagles,
  COALESCE(COUNT(*) FILTER (WHERE h.score_to_par = -1), 0) AS birdies,
  COALESCE(COUNT(*) FILTER (WHERE h.score_to_par = 0), 0) AS pars,
  COALESCE(COUNT(*) FILTER (WHERE h.score_to_par = 1), 0) AS bogeys,
  COALESCE(COUNT(*) FILTER (WHERE h.score_to_par = 2), 0) AS double_bogeys,
  COALESCE(COUNT(*) FILTER (WHERE h.score_to_par >= 3), 0) AS triple_plus,
  r.total_penalties,
  NOW(),
  NOW()
FROM golf_rounds r
LEFT JOIN golf_holes h ON h.round_id = r.id
WHERE r.round_status = 'completed'
GROUP BY r.id, r.player_id, r.total_score, r.total_to_par, r.fairways_hit,
         r.fairways_total, r.greens_in_regulation, r.greens_total,
         r.total_putts, r.total_penalties
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
  updated_at = NOW();

-- The player stats cache will be populated automatically by the trigger
-- when the round stats cache is populated. However, for the initial backfill,
-- we need to manually trigger the player stats calculation since the trigger
-- fires per-row and we want a single aggregation per player.

-- Backfill player stats cache for all players with completed rounds
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
  CASE WHEN COUNT(*) * 18 > 0
       THEN (SUM(rsc.one_putts)::NUMERIC / (COUNT(*) * 18)) * 100
       ELSE NULL END AS one_putt_percentage,
  CASE WHEN COUNT(*) * 18 > 0
       THEN (SUM(rsc.three_putts)::NUMERIC / (COUNT(*) * 18)) * 100
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

-- Backfill par averages (requires separate query due to aggregation complexity)
UPDATE golf_player_stats_cache psc
SET
  par3_average = sub.par3_avg,
  par4_average = sub.par4_avg,
  par5_average = sub.par5_avg
FROM (
  SELECT
    r.player_id,
    AVG(h.score) FILTER (WHERE h.par = 3) AS par3_avg,
    AVG(h.score) FILTER (WHERE h.par = 4) AS par4_avg,
    AVG(h.score) FILTER (WHERE h.par = 5) AS par5_avg
  FROM golf_holes h
  JOIN golf_rounds r ON r.id = h.round_id
  WHERE r.round_status = 'completed'
  GROUP BY r.player_id
) sub
WHERE psc.player_id = sub.player_id;

-- ============================================================================
-- 5. HELPER FUNCTION: Manual refresh for a specific player
-- Useful for admin/debugging or when triggers don't capture all changes
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_player_stats_cache(p_player_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- First refresh all round stats for this player
  INSERT INTO golf_round_stats_cache (
    round_id,
    player_id,
    total_score,
    score_to_par,
    front_nine,
    back_nine,
    fairways_hit,
    fairways_total,
    greens_hit,
    greens_total,
    total_putts,
    one_putts,
    three_putts,
    scrambles_converted,
    scramble_attempts,
    sand_saves,
    sand_attempts,
    eagles,
    birdies,
    pars,
    bogeys,
    double_bogeys,
    triple_plus,
    penalty_strokes,
    created_at,
    updated_at
  )
  SELECT
    r.id AS round_id,
    r.player_id,
    r.total_score,
    r.total_to_par,
    COALESCE(SUM(h.score) FILTER (WHERE h.hole_number <= 9), 0) AS front_nine,
    COALESCE(SUM(h.score) FILTER (WHERE h.hole_number > 9), 0) AS back_nine,
    r.fairways_hit,
    r.fairways_total,
    r.greens_in_regulation,
    r.greens_total,
    r.total_putts,
    COALESCE(COUNT(*) FILTER (WHERE h.putts = 1), 0) AS one_putts,
    COALESCE(COUNT(*) FILTER (WHERE h.putts >= 3), 0) AS three_putts,
    COALESCE(COUNT(*) FILTER (WHERE h.green_in_regulation = false AND h.score_to_par <= 0), 0) AS scrambles_converted,
    COALESCE(COUNT(*) FILTER (WHERE h.green_in_regulation = false), 0) AS scramble_attempts,
    COALESCE(COUNT(*) FILTER (WHERE h.sand_save = true), 0) AS sand_saves,
    COALESCE(COUNT(*) FILTER (WHERE h.sand_save IS NOT NULL), 0) AS sand_attempts,
    COALESCE(COUNT(*) FILTER (WHERE h.score_to_par <= -2), 0) AS eagles,
    COALESCE(COUNT(*) FILTER (WHERE h.score_to_par = -1), 0) AS birdies,
    COALESCE(COUNT(*) FILTER (WHERE h.score_to_par = 0), 0) AS pars,
    COALESCE(COUNT(*) FILTER (WHERE h.score_to_par = 1), 0) AS bogeys,
    COALESCE(COUNT(*) FILTER (WHERE h.score_to_par = 2), 0) AS double_bogeys,
    COALESCE(COUNT(*) FILTER (WHERE h.score_to_par >= 3), 0) AS triple_plus,
    r.total_penalties,
    NOW(),
    NOW()
  FROM golf_rounds r
  LEFT JOIN golf_holes h ON h.round_id = r.id
  WHERE r.player_id = p_player_id AND r.round_status = 'completed'
  GROUP BY r.id, r.player_id, r.total_score, r.total_to_par, r.fairways_hit,
           r.fairways_total, r.greens_in_regulation, r.greens_total,
           r.total_putts, r.total_penalties
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
    updated_at = NOW();

  -- The player_stats_cache trigger will fire automatically from the above upserts
  -- But we do one final explicit update to ensure par averages are correct
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
    WHERE r.player_id = p_player_id AND r.round_status = 'completed'
  ) sub
  WHERE psc.player_id = p_player_id;
END;
$$;

COMMENT ON FUNCTION refresh_player_stats_cache(UUID) IS
  'Manually refresh stats cache for a specific player - useful for debugging or data repair';

-- ============================================================================
-- 6. Documentation
-- ============================================================================

COMMENT ON TABLE golf_round_stats_cache IS
  'Cached per-round statistics, populated automatically by trigger when round status = completed';

COMMENT ON TABLE golf_player_stats_cache IS
  'Aggregated player statistics across all completed rounds, automatically updated via cascade trigger';
