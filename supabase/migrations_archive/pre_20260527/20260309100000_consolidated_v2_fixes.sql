-- ============================================================================
-- CONSOLIDATED V2 FIXES
--
-- This migration consolidates and corrects all fixes from the v1 fix session
-- (migrations 20260309000001 through 20260309000005) which had:
--   1. Function signature collisions (3 incompatible save_partial_round_atomic overloads)
--   2. Column name regression (round_status instead of status in triggers)
--   3. Missing optimistic locking in the 6-arg version
--
-- This single migration provides the DEFINITIVE versions of all affected objects.
-- ============================================================================

-- ============================================================================
-- SECTION 1: Definitive save_partial_round_atomic (7-param)
-- ============================================================================
-- Drop ALL orphaned overloads created by the v1 fix agents
DROP FUNCTION IF EXISTS save_partial_round_atomic(UUID, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS save_partial_round_atomic(UUID, JSONB, JSONB, JSONB, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS save_partial_round_atomic(UUID, JSONB, JSONB, JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION save_partial_round_atomic(
  p_round_id UUID,
  p_round_data JSONB,
  p_holes JSONB,
  p_shots JSONB,
  p_putt_details JSONB DEFAULT '[]'::JSONB,
  p_approach_details JSONB DEFAULT '[]'::JSONB,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_round_status TEXT;
  v_current_updated_at TIMESTAMPTZ;
  v_hole_record JSONB;
  v_shot_group JSONB;
  v_shot JSONB;
  v_inserted_holes JSONB := '[]'::JSONB;
  v_inserted_shots JSONB := '[]'::JSONB;
  v_hole_id UUID;
  v_hole_number INT;
  v_shot_id UUID;
  v_shot_number INT;
  v_putt JSONB;
  v_approach JSONB;
  v_target_shot_id UUID;
BEGIN
  -- Look up player_id from the authenticated user
  SELECT id INTO v_player_id FROM golf_players WHERE user_id = auth.uid();

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Player profile not found for authenticated user.'
    );
  END IF;

  -- Lock the round row and check status atomically (FOR UPDATE prevents TOCTTOU race)
  SELECT status, updated_at INTO v_round_status, v_current_updated_at
  FROM golf_rounds
  WHERE id = p_round_id
    AND player_id = v_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Round not found or you do not have permission to update it.'
    );
  END IF;

  IF v_round_status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Round has already been completed. Auto-save skipped.'
    );
  END IF;

  -- Optimistic locking: reject if the round was modified since the client last read it
  IF p_expected_updated_at IS NOT NULL AND v_current_updated_at > p_expected_updated_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'conflict',
      'message', 'Round was modified on another device. Please reload to get the latest version.',
      'server_updated_at', v_current_updated_at
    );
  END IF;

  -- Update round metadata (including draft_data if provided)
  UPDATE golf_rounds SET
    course_name = COALESCE(p_round_data->>'course_name', course_name),
    course_city = p_round_data->>'course_city',
    course_state = p_round_data->>'course_state',
    course_rating = CASE WHEN p_round_data->>'course_rating' IS NULL THEN NULL ELSE (p_round_data->>'course_rating')::NUMERIC END,
    course_slope = CASE WHEN p_round_data->>'course_slope' IS NULL THEN NULL ELSE (p_round_data->>'course_slope')::INT END,
    tees_played = p_round_data->>'tees_played',
    round_type = COALESCE(p_round_data->>'round_type', round_type),
    round_date = COALESCE((p_round_data->>'round_date')::DATE, round_date),
    holes_played = COALESCE((p_round_data->>'holes_played')::INT, holes_played),
    current_hole = CASE WHEN p_round_data->>'current_hole' IS NULL THEN current_hole ELSE (p_round_data->>'current_hole')::INT END,
    draft_data = CASE
      WHEN p_round_data->'draft_data' IS NOT NULL
      THEN p_round_data->'draft_data'
      ELSE draft_data
    END,
    updated_at = NOW()
  WHERE id = p_round_id
    AND player_id = v_player_id;

  -- Delete existing holes and shots for this round
  DELETE FROM golf_shots WHERE round_id = p_round_id;
  DELETE FROM golf_holes WHERE round_id = p_round_id;

  -- Insert holes (including yardage)
  IF p_holes IS NOT NULL AND jsonb_array_length(p_holes) > 0 THEN
    FOR v_hole_record IN SELECT * FROM jsonb_array_elements(p_holes)
    LOOP
      INSERT INTO golf_holes (
        round_id, hole_number, par, score, putts,
        fairway_hit, gir, penalty_strokes,
        up_and_down, sand_save, yardage
      ) VALUES (
        p_round_id,
        (v_hole_record->>'hole_number')::INT,
        (v_hole_record->>'par')::INT,
        CASE WHEN v_hole_record->>'score' IS NULL THEN NULL ELSE (v_hole_record->>'score')::INT END,
        CASE WHEN v_hole_record->>'putts' IS NULL THEN NULL ELSE (v_hole_record->>'putts')::INT END,
        CASE WHEN v_hole_record->>'fairway_hit' IS NULL THEN NULL ELSE (v_hole_record->>'fairway_hit')::BOOLEAN END,
        CASE WHEN v_hole_record->>'gir' IS NULL THEN NULL ELSE (v_hole_record->>'gir')::BOOLEAN END,
        CASE WHEN v_hole_record->>'penalty_strokes' IS NULL THEN NULL ELSE (v_hole_record->>'penalty_strokes')::INT END,
        CASE WHEN v_hole_record->>'up_and_down' IS NULL THEN NULL ELSE (v_hole_record->>'up_and_down')::BOOLEAN END,
        CASE WHEN v_hole_record->>'sand_save' IS NULL THEN NULL ELSE (v_hole_record->>'sand_save')::BOOLEAN END,
        CASE WHEN v_hole_record->>'yardage' IS NULL THEN NULL ELSE (v_hole_record->>'yardage')::INT END
      )
      RETURNING id, hole_number INTO v_hole_id, v_hole_number;

      v_inserted_holes := v_inserted_holes || jsonb_build_object(
        'hole_id', v_hole_id,
        'hole_number', v_hole_number
      );
    END LOOP;
  END IF;

  -- Insert shots and build shot_id mapping for detail tables
  IF p_shots IS NOT NULL AND jsonb_array_length(p_shots) > 0 THEN
    FOR v_shot_group IN SELECT * FROM jsonb_array_elements(p_shots)
    LOOP
      v_hole_number := (v_shot_group->>'hole_number')::INT;
      SELECT (elem->>'hole_id')::UUID INTO v_hole_id
      FROM jsonb_array_elements(v_inserted_holes) elem
      WHERE (elem->>'hole_number')::INT = v_hole_number
      LIMIT 1;

      IF v_hole_id IS NULL THEN
        CONTINUE;
      END IF;

      FOR v_shot IN SELECT * FROM jsonb_array_elements(v_shot_group->'shots')
      LOOP
        INSERT INTO golf_shots (
          round_id, hole_id, hole_number, shot_number,
          shot_type, club_type, lie_before, lie_after,
          distance_to_hole_before, distance_unit_before,
          result, distance_to_hole_after, distance_unit_after,
          shot_distance, miss_direction,
          putt_break, putt_slope, putt_distance_feet, putt_made,
          is_penalty, penalty_type
        ) VALUES (
          p_round_id,
          v_hole_id,
          v_hole_number,
          (v_shot->>'shot_number')::INT,
          v_shot->>'shot_type',
          v_shot->>'club_type',
          v_shot->>'lie_before',
          v_shot->>'lie_after',
          (v_shot->>'distance_to_hole_before')::NUMERIC,
          v_shot->>'distance_unit_before',
          v_shot->>'result',
          CASE WHEN v_shot->>'distance_to_hole_after' IS NULL THEN NULL ELSE (v_shot->>'distance_to_hole_after')::NUMERIC END,
          v_shot->>'distance_unit_after',
          CASE WHEN v_shot->>'shot_distance' IS NULL THEN NULL ELSE (v_shot->>'shot_distance')::NUMERIC END,
          v_shot->>'miss_direction',
          v_shot->>'putt_break',
          v_shot->>'putt_slope',
          CASE WHEN v_shot->>'putt_distance_feet' IS NULL THEN NULL ELSE (v_shot->>'putt_distance_feet')::NUMERIC END,
          CASE WHEN v_shot->>'putt_made' IS NULL THEN NULL ELSE (v_shot->>'putt_made')::BOOLEAN END,
          COALESCE((v_shot->>'is_penalty')::BOOLEAN, false),
          v_shot->>'penalty_type'
        )
        RETURNING id, hole_number, shot_number INTO v_shot_id, v_hole_number, v_shot_number;

        v_inserted_shots := v_inserted_shots || jsonb_build_object(
          'shot_id', v_shot_id,
          'hole_number', v_hole_number,
          'shot_number', v_shot_number
        );
      END LOOP;
    END LOOP;
  END IF;

  -- Insert putt details using (hole_number, shot_number) -> shot_id mapping
  IF p_putt_details IS NOT NULL AND jsonb_array_length(p_putt_details) > 0 THEN
    FOR v_putt IN SELECT * FROM jsonb_array_elements(p_putt_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_target_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_putt->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_putt->>'shot_number')::INT
      LIMIT 1;

      IF v_target_shot_id IS NOT NULL THEN
        INSERT INTO putt_details (shot_id, miss_tags, break_direction, distance_feet, made)
        VALUES (
          v_target_shot_id,
          CASE WHEN v_putt->'miss_tags' IS NULL THEN '{}'::TEXT[] ELSE ARRAY(SELECT jsonb_array_elements_text(v_putt->'miss_tags')) END,
          v_putt->>'break_direction',
          CASE WHEN v_putt->>'distance_feet' IS NULL THEN NULL ELSE (v_putt->>'distance_feet')::NUMERIC END,
          COALESCE((v_putt->>'made')::BOOLEAN, false)
        );
      END IF;
    END LOOP;
  END IF;

  -- Insert approach miss details using (hole_number, shot_number) -> shot_id mapping
  IF p_approach_details IS NOT NULL AND jsonb_array_length(p_approach_details) > 0 THEN
    FOR v_approach IN SELECT * FROM jsonb_array_elements(p_approach_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_target_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_approach->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_approach->>'shot_number')::INT
      LIMIT 1;

      IF v_target_shot_id IS NOT NULL THEN
        INSERT INTO approach_miss_details (shot_id, miss_direction, lie_type, distance_from_green_yards)
        VALUES (
          v_target_shot_id,
          v_approach->>'miss_direction',
          v_approach->>'lie_type',
          CASE WHEN v_approach->>'distance_from_green_yards' IS NULL THEN NULL ELSE (v_approach->>'distance_from_green_yards')::NUMERIC END
        );
      END IF;
    END LOOP;
  END IF;

  -- Return updated_at so client can track for optimistic locking
  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'updated_at', (SELECT updated_at FROM golf_rounds WHERE id = p_round_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION save_partial_round_atomic(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ) TO authenticated;


-- ============================================================================
-- SECTION 2: Fix update_player_stats_cache() — round_status → status
-- Also adds 9-hole normalization for scoring_average, best_round, worst_round
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
  v_best_round_normalized NUMERIC(5,2);
  v_worst_round_normalized NUMERIC(5,2);
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

  -- FIX: Use 'status' not 'round_status' — golf_rounds has a column called 'status'
  SELECT MIN(round_date), MAX(round_date)
  INTO v_first_round_date, v_last_round_date
  FROM golf_rounds
  WHERE player_id = v_player_id AND status = 'completed';

  -- Calculate par averages from golf_holes (FIX: status not round_status)
  SELECT
    AVG(CASE WHEN par = 3 THEN score END),
    AVG(CASE WHEN par = 4 THEN score END),
    AVG(CASE WHEN par = 5 THEN score END)
  INTO v_par3_average, v_par4_average, v_par5_average
  FROM golf_holes h
  JOIN golf_rounds r ON r.id = h.round_id
  WHERE r.player_id = v_player_id AND r.status = 'completed';

  -- Calculate actual total holes played (supports 9-hole rounds) (FIX: status not round_status)
  SELECT COALESCE(SUM(COALESCE(holes_played, 18)), 0)
  INTO v_total_holes
  FROM golf_rounds
  WHERE player_id = v_player_id AND status = 'completed';

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

  -- Normalize putts_per_round, penalty_per_round, and scoring_average to 18-hole equivalents
  IF v_total_holes > 0 THEN
    v_putts_per_round := (v_total_putts::NUMERIC / v_total_holes) * 18;
    v_penalty_per_round := (v_total_penalties::NUMERIC / v_total_holes) * 18;
    v_scoring_average := (v_total_score::NUMERIC / v_total_holes) * 18;
  ELSIF v_rounds_played > 0 THEN
    v_putts_per_round := v_total_putts::NUMERIC / v_rounds_played;
    v_penalty_per_round := v_total_penalties::NUMERIC / v_rounds_played;
    v_scoring_average := v_total_score::NUMERIC / v_rounds_played;
  END IF;

  -- Normalize best_round and worst_round to 18-hole equivalents
  SELECT
    MIN(r.total_score * (18.0 / COALESCE(r.holes_played, 18))),
    MAX(r.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_best_round_normalized, v_worst_round_normalized
  FROM golf_rounds r
  WHERE r.player_id = v_player_id AND r.status = 'completed' AND r.total_score IS NOT NULL;

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
    v_total_score_to_par::NUMERIC / v_rounds_played,
    v_rounds_played,
    COALESCE(v_best_round_normalized::INTEGER, v_best_round),
    COALESCE(v_worst_round_normalized::INTEGER, v_worst_round),
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


-- ============================================================================
-- SECTION 3: Fix update_player_stats_cache_enhanced() — verify status column
-- Already correct in 000003 (uses golf_rounds.round_date join, no status filter needed)
-- Normalization already applied. Re-create to ensure latest version is in place.
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
  -- Determine which player to update
  IF TG_OP = 'DELETE' THEN
    v_player_id := OLD.player_id;
  ELSE
    v_player_id := NEW.player_id;
  END IF;

  -- Get current season start (assume Aug 1 for college golf)
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

  -- Calculate last 5 rounds average (normalized to 18-hole equivalent)
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

  -- Calculate last 10 rounds average (normalized to 18-hole equivalent)
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

  -- Calculate previous 5 rounds average (rounds 6-10, normalized)
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
    v_improvement := v_prev_5_avg - v_last_5_avg; -- Lower is better in golf

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

  -- Update the cache with enhanced stats
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
-- SECTION 4: Fix CHECK constraints
-- ============================================================================

-- Add 'penalty' to golf_shots.lie_after allowed values
ALTER TABLE golf_shots DROP CONSTRAINT IF EXISTS golf_shots_lie_after_check;
ALTER TABLE golf_shots ADD CONSTRAINT golf_shots_lie_after_check
  CHECK (lie_after IS NULL OR lie_after IN ('tee', 'fairway', 'rough', 'deep_rough', 'sand', 'green', 'penalty', 'recovery', 'other'));

-- Add 'bunker' to approach_miss_details.lie_type allowed values
ALTER TABLE approach_miss_details DROP CONSTRAINT IF EXISTS approach_miss_details_lie_type_check;
ALTER TABLE approach_miss_details ADD CONSTRAINT approach_miss_details_lie_type_check
  CHECK (lie_type IN ('fairway', 'rough', 'sand', 'bunker', 'recovery', 'hazard'));


-- ============================================================================
-- SECTION 5: Fix RLS policies
-- ============================================================================

-- ADD UPDATE policy on golf_qualifier_entries for coaches
-- Coaches need to update qualifier entries (e.g., update scores, status)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'golf_qualifier_entries' AND policyname = 'Coaches can update qualifier entries'
  ) THEN
    CREATE POLICY "Coaches can update qualifier entries"
      ON golf_qualifier_entries FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM golf_qualifiers q
          JOIN golf_teams t ON t.id = q.team_id
          JOIN golf_coaches c ON c.id = t.coach_id
          WHERE q.id = golf_qualifier_entries.qualifier_id
            AND c.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM golf_qualifiers q
          JOIN golf_teams t ON t.id = q.team_id
          JOIN golf_coaches c ON c.id = t.coach_id
          WHERE q.id = golf_qualifier_entries.qualifier_id
            AND c.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ADD SELECT policy on golf_announcement_acknowledgements for coaches
-- Coaches need to see who has acknowledged announcements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'golf_announcement_acknowledgements' AND policyname = 'Coaches can view acknowledgements'
  ) THEN
    CREATE POLICY "Coaches can view acknowledgements"
      ON golf_announcement_acknowledgements FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM golf_announcements a
          JOIN golf_teams t ON t.id = a.team_id
          JOIN golf_coaches c ON c.id = t.coach_id
          WHERE a.id = golf_announcement_acknowledgements.announcement_id
            AND c.user_id = auth.uid()
        )
      );
  END IF;
END $$;


-- ============================================================================
-- SECTION 6: Ensure triggers use correct column names
-- The trigger definitions in 20260212000004 are already correct (they reference
-- 'status', 'total_fairways_hit', 'total_gir'). The bug was only in the
-- function BODIES from migration 000002, which are fixed in Section 2 above.
-- No trigger recreation needed — only the functions needed fixing.
-- ============================================================================
