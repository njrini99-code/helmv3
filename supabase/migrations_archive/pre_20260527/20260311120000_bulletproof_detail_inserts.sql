-- ============================================================================
-- BULLETPROOF FIX: Sanitize detail data + expand constraints
--
-- Problem: putt_details and approach_miss_details CHECK constraints reject
-- valid client data, causing round submissions to fail or lose detail data.
--
-- Root causes:
--   1. approach_miss_details.lie_type constraint missing values the client sends
--      (green, tee, other, penalty) — only allowed fairway/rough/sand/bunker/recovery/hazard
--   2. putt_details.distance_feet could receive out-of-range values
--   3. Constraints weren't NULL-safe (NULL should always pass)
--
-- Solution (3 layers of defense):
--   1. Expand constraints to match actual client data domain + make NULL-safe
--   2. Sanitize all values in BOTH RPCs BEFORE inserting (clamp numerics, NULL invalid enums)
--   3. Keep per-row EXCEPTION handlers as final safety net (round never lost)
-- ============================================================================

-- LAYER 1: Expand constraints to match the client's data domain
-- ---------------------------------------------------------------

-- approach_miss_details.lie_type: add 'green', 'tee', 'other', 'penalty', 'deep_rough'
-- (same values as golf_shots.lie_before/lie_after + result values)
ALTER TABLE approach_miss_details DROP CONSTRAINT IF EXISTS approach_miss_details_lie_type_check;
ALTER TABLE approach_miss_details ADD CONSTRAINT approach_miss_details_lie_type_check
  CHECK (lie_type IS NULL OR lie_type = ANY(ARRAY[
    'fairway', 'rough', 'sand', 'bunker', 'recovery', 'hazard',
    'green', 'tee', 'other', 'penalty', 'deep_rough'
  ]));

-- putt_details.break_direction: make nullable-safe
ALTER TABLE putt_details DROP CONSTRAINT IF EXISTS putt_details_break_direction_check;
ALTER TABLE putt_details ADD CONSTRAINT putt_details_break_direction_check
  CHECK (break_direction IS NULL OR break_direction = ANY(ARRAY[
    'left_to_right', 'right_to_left', 'straight', 'multiple'
  ]));

-- approach_miss_details.miss_direction: make nullable-safe
ALTER TABLE approach_miss_details DROP CONSTRAINT IF EXISTS approach_miss_details_miss_direction_check;
ALTER TABLE approach_miss_details ADD CONSTRAINT approach_miss_details_miss_direction_check
  CHECK (miss_direction IS NULL OR miss_direction = ANY(ARRAY[
    'short', 'long', 'left', 'right', 'short_left', 'short_right', 'long_left', 'long_right'
  ]));

-- putt_details.distance_feet: make nullable-safe, keep 0-500
ALTER TABLE putt_details DROP CONSTRAINT IF EXISTS putt_details_distance_feet_check;
ALTER TABLE putt_details ADD CONSTRAINT putt_details_distance_feet_check
  CHECK (distance_feet IS NULL OR (distance_feet >= 0 AND distance_feet <= 500));

-- putt_details.estimated_break_inches: make nullable-safe, expand to 0-120
ALTER TABLE putt_details DROP CONSTRAINT IF EXISTS putt_details_estimated_break_inches_check;
ALTER TABLE putt_details ADD CONSTRAINT putt_details_estimated_break_inches_check
  CHECK (estimated_break_inches IS NULL OR (estimated_break_inches >= 0 AND estimated_break_inches <= 120));

-- approach_miss_details.distance_from_green_yards: make nullable-safe
ALTER TABLE approach_miss_details DROP CONSTRAINT IF EXISTS approach_miss_details_distance_from_green_yards_check;
ALTER TABLE approach_miss_details ADD CONSTRAINT approach_miss_details_distance_from_green_yards_check
  CHECK (distance_from_green_yards IS NULL OR distance_from_green_yards >= 0);


-- LAYER 2: submit_round_atomic with input sanitization
-- ---------------------------------------------------------------
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
SET statement_timeout TO '30s'
SET lock_timeout TO '15s'
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
  v_warnings JSONB := '[]'::JSONB;
  v_err_state TEXT;
  v_err_msg TEXT;
  -- Sanitized values
  v_distance_feet NUMERIC;
  v_break_direction TEXT;
  v_lie_type TEXT;
  v_miss_direction TEXT;
  v_distance_from_green NUMERIC;
  v_estimated_break INT;
BEGIN
  SELECT id INTO v_player_id FROM golf_players WHERE user_id = auth.uid();

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Player profile not found for authenticated user.'
    );
  END IF;

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

  -- Insert putt details with SANITIZATION + resilient savepoints
  IF p_putt_details IS NOT NULL AND jsonb_array_length(p_putt_details) > 0 THEN
    FOR v_putt IN SELECT * FROM jsonb_array_elements(p_putt_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_target_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_putt->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_putt->>'shot_number')::INT
      LIMIT 1;

      IF v_target_shot_id IS NOT NULL THEN
        -- Sanitize distance_feet: clamp to 0-500, NULL if non-numeric
        BEGIN
          v_distance_feet := (v_putt->>'distance_feet')::NUMERIC;
          IF v_distance_feet IS NOT NULL THEN
            v_distance_feet := GREATEST(0, LEAST(500, v_distance_feet));
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_distance_feet := NULL;
        END;

        -- Sanitize break_direction: NULL if not in allowed list
        v_break_direction := v_putt->>'break_direction';
        IF v_break_direction IS NOT NULL AND v_break_direction NOT IN ('left_to_right', 'right_to_left', 'straight', 'multiple') THEN
          v_break_direction := NULL;
        END IF;

        -- Sanitize estimated_break_inches: clamp to 0-120
        BEGIN
          v_estimated_break := (v_putt->>'estimated_break_inches')::INT;
          IF v_estimated_break IS NOT NULL THEN
            v_estimated_break := GREATEST(0, LEAST(120, v_estimated_break));
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_estimated_break := NULL;
        END;

        BEGIN
          INSERT INTO putt_details (shot_id, miss_tags, break_direction, estimated_break_inches, distance_feet, made)
          VALUES (
            v_target_shot_id,
            CASE WHEN v_putt->'miss_tags' IS NULL THEN '{}'::TEXT[] ELSE ARRAY(SELECT jsonb_array_elements_text(v_putt->'miss_tags')) END,
            v_break_direction,
            v_estimated_break,
            v_distance_feet,
            COALESCE((v_putt->>'made')::BOOLEAN, false)
          );
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
          v_warnings := v_warnings || jsonb_build_object(
            'step', 'insert_putt_details',
            'hole_number', (v_putt->>'hole_number')::INT,
            'shot_number', (v_putt->>'shot_number')::INT,
            'error_code', v_err_state,
            'error', v_err_msg,
            'failing_data', v_putt
          );
        END;
      END IF;
    END LOOP;
  END IF;

  -- Insert approach miss details with SANITIZATION + resilient savepoints
  IF p_approach_details IS NOT NULL AND jsonb_array_length(p_approach_details) > 0 THEN
    FOR v_approach IN SELECT * FROM jsonb_array_elements(p_approach_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_target_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_approach->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_approach->>'shot_number')::INT
      LIMIT 1;

      IF v_target_shot_id IS NOT NULL THEN
        -- Sanitize lie_type: NULL if not in expanded allowed list
        v_lie_type := v_approach->>'lie_type';
        IF v_lie_type IS NOT NULL AND v_lie_type NOT IN (
          'fairway', 'rough', 'sand', 'bunker', 'recovery', 'hazard',
          'green', 'tee', 'other', 'penalty', 'deep_rough'
        ) THEN
          v_lie_type := NULL;
        END IF;

        -- Sanitize miss_direction: NULL if not in allowed list
        v_miss_direction := v_approach->>'miss_direction';
        IF v_miss_direction IS NOT NULL AND v_miss_direction NOT IN (
          'short', 'long', 'left', 'right', 'short_left', 'short_right', 'long_left', 'long_right'
        ) THEN
          v_miss_direction := NULL;
        END IF;

        -- Sanitize distance_from_green_yards: clamp >= 0
        BEGIN
          v_distance_from_green := (v_approach->>'distance_from_green_yards')::NUMERIC;
          IF v_distance_from_green IS NOT NULL AND v_distance_from_green < 0 THEN
            v_distance_from_green := 0;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_distance_from_green := NULL;
        END;

        BEGIN
          INSERT INTO approach_miss_details (shot_id, miss_direction, lie_type, distance_from_green_yards)
          VALUES (
            v_target_shot_id,
            v_miss_direction,
            v_lie_type,
            v_distance_from_green
          );
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
          v_warnings := v_warnings || jsonb_build_object(
            'step', 'insert_approach_miss_details',
            'hole_number', (v_approach->>'hole_number')::INT,
            'shot_number', (v_approach->>'shot_number')::INT,
            'error_code', v_err_state,
            'error', v_err_msg,
            'failing_data', v_approach
          );
        END;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'warnings', v_warnings
  );
END;
$$;


-- LAYER 2b: save_partial_round_atomic with same sanitization
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_partial_round_atomic(
  p_round_id UUID,
  p_round_data JSONB,
  p_holes JSONB,
  p_shots JSONB,
  p_putt_details JSONB DEFAULT NULL,
  p_approach_details JSONB DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '20s'
SET lock_timeout TO '10s'
AS $function$
DECLARE
  v_player_id UUID;
  v_round_status TEXT;
  v_current_updated_at TIMESTAMPTZ;
  v_hole_record JSONB;
  v_shot_group JSONB;
  v_shot JSONB;
  v_detail JSONB;
  v_inserted_holes JSONB := '[]'::JSONB;
  v_inserted_shots JSONB := '[]'::JSONB;
  v_hole_id UUID;
  v_hole_number INT;
  v_shot_id UUID;
  v_new_updated_at TIMESTAMPTZ;
  v_warnings JSONB := '[]'::JSONB;
  v_err_state TEXT;
  v_err_msg TEXT;
  -- Sanitized values
  v_distance_feet NUMERIC;
  v_break_direction TEXT;
  v_lie_type TEXT;
  v_miss_direction TEXT;
  v_distance_from_green NUMERIC;
  v_estimated_break INT;
BEGIN
  SELECT id INTO v_player_id FROM golf_players WHERE user_id = auth.uid();

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Player profile not found for authenticated user.'
    );
  END IF;

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

  IF p_expected_updated_at IS NOT NULL
     AND v_current_updated_at IS NOT NULL
     AND v_current_updated_at > p_expected_updated_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'conflict'
    );
  END IF;

  v_new_updated_at := NOW();

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
    updated_at = v_new_updated_at
  WHERE id = p_round_id
    AND player_id = v_player_id;

  DELETE FROM golf_shots WHERE round_id = p_round_id;
  DELETE FROM golf_holes WHERE round_id = p_round_id;

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
        RETURNING id INTO v_shot_id;

        v_inserted_shots := v_inserted_shots || jsonb_build_object(
          'shot_id', v_shot_id,
          'hole_number', v_hole_number,
          'shot_number', (v_shot->>'shot_number')::INT
        );
      END LOOP;
    END LOOP;
  END IF;

  -- Insert putt_details with SANITIZATION + resilient savepoints
  IF p_putt_details IS NOT NULL AND jsonb_array_length(p_putt_details) > 0 THEN
    FOR v_detail IN SELECT * FROM jsonb_array_elements(p_putt_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_detail->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_detail->>'shot_number')::INT
      LIMIT 1;

      IF v_shot_id IS NOT NULL THEN
        -- Sanitize distance_feet: clamp to 0-500
        BEGIN
          v_distance_feet := (v_detail->>'distance_feet')::NUMERIC;
          IF v_distance_feet IS NOT NULL THEN
            v_distance_feet := GREATEST(0, LEAST(500, v_distance_feet));
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_distance_feet := NULL;
        END;

        -- Sanitize break_direction
        v_break_direction := v_detail->>'break_direction';
        IF v_break_direction IS NOT NULL AND v_break_direction NOT IN ('left_to_right', 'right_to_left', 'straight', 'multiple') THEN
          v_break_direction := NULL;
        END IF;

        -- Sanitize estimated_break_inches: clamp to 0-120
        BEGIN
          v_estimated_break := (v_detail->>'estimated_break_inches')::INT;
          IF v_estimated_break IS NOT NULL THEN
            v_estimated_break := GREATEST(0, LEAST(120, v_estimated_break));
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_estimated_break := NULL;
        END;

        BEGIN
          INSERT INTO putt_details (shot_id, miss_tags, break_direction, estimated_break_inches, distance_feet, made)
          VALUES (
            v_shot_id,
            CASE WHEN v_detail->'miss_tags' IS NULL THEN '{}' ELSE ARRAY(SELECT jsonb_array_elements_text(v_detail->'miss_tags')) END,
            v_break_direction,
            v_estimated_break,
            v_distance_feet,
            CASE WHEN v_detail->>'made' IS NULL THEN NULL ELSE (v_detail->>'made')::BOOLEAN END
          );
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
          v_warnings := v_warnings || jsonb_build_object(
            'step', 'insert_putt_details',
            'hole_number', (v_detail->>'hole_number')::INT,
            'shot_number', (v_detail->>'shot_number')::INT,
            'error_code', v_err_state,
            'error', v_err_msg,
            'failing_data', v_detail
          );
        END;
      END IF;
    END LOOP;
  END IF;

  -- Insert approach_miss_details with SANITIZATION + resilient savepoints
  IF p_approach_details IS NOT NULL AND jsonb_array_length(p_approach_details) > 0 THEN
    FOR v_detail IN SELECT * FROM jsonb_array_elements(p_approach_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_detail->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_detail->>'shot_number')::INT
      LIMIT 1;

      IF v_shot_id IS NOT NULL THEN
        -- Sanitize lie_type: NULL if not in expanded allowed list
        v_lie_type := v_detail->>'lie_type';
        IF v_lie_type IS NOT NULL AND v_lie_type NOT IN (
          'fairway', 'rough', 'sand', 'bunker', 'recovery', 'hazard',
          'green', 'tee', 'other', 'penalty', 'deep_rough'
        ) THEN
          v_lie_type := NULL;
        END IF;

        -- Sanitize miss_direction
        v_miss_direction := v_detail->>'miss_direction';
        IF v_miss_direction IS NOT NULL AND v_miss_direction NOT IN (
          'short', 'long', 'left', 'right', 'short_left', 'short_right', 'long_left', 'long_right'
        ) THEN
          v_miss_direction := NULL;
        END IF;

        -- Sanitize distance_from_green_yards: clamp >= 0
        BEGIN
          v_distance_from_green := (v_detail->>'distance_from_green_yards')::NUMERIC;
          IF v_distance_from_green IS NOT NULL AND v_distance_from_green < 0 THEN
            v_distance_from_green := 0;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_distance_from_green := NULL;
        END;

        BEGIN
          INSERT INTO approach_miss_details (shot_id, miss_direction, lie_type, distance_from_green_yards)
          VALUES (
            v_shot_id,
            v_miss_direction,
            v_lie_type,
            v_distance_from_green
          );
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
          v_warnings := v_warnings || jsonb_build_object(
            'step', 'insert_approach_miss_details',
            'hole_number', (v_detail->>'hole_number')::INT,
            'shot_number', (v_detail->>'shot_number')::INT,
            'error_code', v_err_state,
            'error', v_err_msg,
            'failing_data', v_detail
          );
        END;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'updated_at', v_new_updated_at,
    'warnings', v_warnings
  );
END;
$function$;
