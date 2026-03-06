-- ============================================================================
-- Fix #1: Normalize scoring average for 9-hole rounds in player stats cache
-- Fix #2: Add total_penalties to submit_round_atomic UPDATE
-- Fix #3: Add yardage to save_partial_round_atomic hole INSERT
-- ============================================================================

-- ============================================================================
-- FIX #1: Update player stats cache trigger to normalize scoring average
-- for mixed 9/18-hole rounds. Uses per-hole average * 18 instead of
-- raw total_score / rounds_played.
-- ============================================================================

-- Replace the scoring average calculation in update_player_stats_cache
-- We need to redefine the function to use v_total_holes for normalization
CREATE OR REPLACE FUNCTION update_player_stats_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_rounds_played INTEGER;
  v_total_score BIGINT;
  v_total_score_to_par BIGINT;
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
  v_scoring_average NUMERIC(5,2);
  v_scoring_average_vs_par NUMERIC(5,2);
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

  -- Get date range from actual rounds
  SELECT MIN(round_date), MAX(round_date)
  INTO v_first_round_date, v_last_round_date
  FROM golf_rounds
  WHERE player_id = v_player_id AND status = 'completed';

  -- Calculate par averages from golf_holes
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

  -- FIX #1: Normalize scoring average for mixed 9/18-hole rounds
  -- Use per-hole average * 18 instead of total_score / rounds_played
  -- This ensures a 38 on 9 holes and a 76 on 18 holes both normalize to ~76
  IF v_total_holes > 0 THEN
    v_scoring_average := ROUND((v_total_score::NUMERIC / v_total_holes) * 18, 1);
    v_scoring_average_vs_par := ROUND((v_total_score_to_par::NUMERIC / v_total_holes) * 18, 1);
  ELSE
    v_scoring_average := NULL;
    v_scoring_average_vs_par := NULL;
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

-- ============================================================================
-- FIX #2: Add total_penalties to submit_round_atomic UPDATE statement
-- ============================================================================

-- Recreate submit_round_atomic with total_penalties in the UPDATE
-- (full function replacement — adds total_penalties line to the UPDATE)
CREATE OR REPLACE FUNCTION submit_round_atomic(
  p_round_id UUID,
  p_round_data JSONB,
  p_holes JSONB,
  p_shots JSONB,
  p_putt_details JSONB DEFAULT '[]'::JSONB,
  p_approach_details JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
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

  -- Verify the round exists, belongs to this player, and is not already completed
  PERFORM 1 FROM golf_rounds
  WHERE id = p_round_id
    AND player_id = v_player_id
    AND status != 'completed';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Round not found, already completed, or you do not have permission to update it.'
    );
  END IF;

  -- Update the round to completed with aggregate stats
  UPDATE golf_rounds SET
    course_name = COALESCE(p_round_data->>'course_name', course_name),
    course_city = p_round_data->>'course_city',
    course_state = p_round_data->>'course_state',
    course_rating = CASE WHEN p_round_data->>'course_rating' IS NULL THEN NULL ELSE (p_round_data->>'course_rating')::NUMERIC END,
    course_slope = CASE WHEN p_round_data->>'course_slope' IS NULL THEN NULL ELSE (p_round_data->>'course_slope')::INT END,
    tees_played = p_round_data->>'tees_played',
    round_type = COALESCE(p_round_data->>'round_type', round_type),
    round_date = COALESCE((p_round_data->>'round_date')::DATE, round_date),
    status = 'completed',
    holes_played = COALESCE((p_round_data->>'holes_played')::INT, holes_played),
    total_score = CASE WHEN p_round_data->>'total_score' IS NULL THEN NULL ELSE (p_round_data->>'total_score')::INT END,
    score_to_par = CASE WHEN p_round_data->>'score_to_par' IS NULL THEN NULL ELSE (p_round_data->>'score_to_par')::INT END,
    total_putts = CASE WHEN p_round_data->>'total_putts' IS NULL THEN NULL ELSE (p_round_data->>'total_putts')::INT END,
    total_fairways_hit = CASE WHEN p_round_data->>'total_fairways_hit' IS NULL THEN NULL ELSE (p_round_data->>'total_fairways_hit')::INT END,
    total_fairways = CASE WHEN p_round_data->>'total_fairways' IS NULL THEN NULL ELSE (p_round_data->>'total_fairways')::INT END,
    total_gir = CASE WHEN p_round_data->>'total_gir' IS NULL THEN NULL ELSE (p_round_data->>'total_gir')::INT END,
    total_gir_possible = CASE WHEN p_round_data->>'total_gir_possible' IS NULL THEN NULL ELSE (p_round_data->>'total_gir_possible')::INT END,
    total_penalties = CASE WHEN p_round_data->>'total_penalties' IS NULL THEN NULL ELSE (p_round_data->>'total_penalties')::INT END,
    front_nine = CASE WHEN p_round_data->>'front_nine' IS NULL THEN NULL ELSE (p_round_data->>'front_nine')::INT END,
    back_nine = CASE WHEN p_round_data->>'back_nine' IS NULL THEN NULL ELSE (p_round_data->>'back_nine')::INT END,
    qualifier_id = CASE WHEN p_round_data->>'qualifier_id' = 'null' OR p_round_data->>'qualifier_id' IS NULL THEN NULL ELSE (p_round_data->>'qualifier_id')::UUID END,
    qualifier_round_number = CASE WHEN p_round_data->>'qualifier_round_number' IS NULL THEN NULL ELSE (p_round_data->>'qualifier_round_number')::INT END,
    draft_data = NULL,
    updated_at = NOW()
  WHERE id = p_round_id
    AND player_id = v_player_id;

  -- Delete existing holes and shots atomically (cascade handles putt_details, approach_miss_details)
  DELETE FROM golf_shots WHERE round_id = p_round_id;
  DELETE FROM golf_holes WHERE round_id = p_round_id;

  -- Insert holes
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

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_round_atomic(UUID, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;

-- ============================================================================
-- FIX #3: Add yardage to save_partial_round_atomic hole INSERT
-- ============================================================================

-- Read the current save_partial_round_atomic and replace the hole INSERT
-- to include the yardage column
CREATE OR REPLACE FUNCTION save_partial_round_atomic(
  p_round_id UUID,
  p_round_data JSONB,
  p_holes JSONB,
  p_shots JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_hole_record JSONB;
  v_shot_group JSONB;
  v_shot JSONB;
  v_inserted_holes JSONB := '[]'::JSONB;
  v_hole_id UUID;
  v_hole_number INT;
BEGIN
  -- Look up player_id from the authenticated user
  SELECT id INTO v_player_id FROM golf_players WHERE user_id = auth.uid();

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Player profile not found for authenticated user.'
    );
  END IF;

  -- Verify the round exists, belongs to this player, and is not already completed
  PERFORM 1 FROM golf_rounds
  WHERE id = p_round_id
    AND player_id = v_player_id
    AND status != 'completed';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Could not save round. The round may have already been completed or deleted.'
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

  -- Insert holes (now including yardage)
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

  -- Insert shots
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
        );
      END LOOP;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION save_partial_round_atomic(UUID, JSONB, JSONB, JSONB) TO authenticated;
