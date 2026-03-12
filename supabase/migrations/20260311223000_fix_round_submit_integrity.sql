-- Prevent partially persisted completed rounds and repair the known corrupt Larsen round.

CREATE OR REPLACE FUNCTION public.submit_round_atomic(
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
  v_distance_feet NUMERIC;
  v_break_direction TEXT;
  v_lie_type TEXT;
  v_miss_direction TEXT;
  v_distance_from_green NUMERIC;
  v_estimated_break INT;
  v_expected_holes INT;
  v_supplied_holes INT := 0;
  v_null_score_holes INT := 0;
  v_null_putt_holes INT := 0;
  v_hole_score_sum INT := 0;
  v_hole_putt_sum INT := 0;
  v_distinct_hole_numbers INT := 0;
  v_min_hole_number INT;
  v_max_hole_number INT;
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

  IF p_holes IS NULL OR jsonb_typeof(p_holes) <> 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Round submission requires a complete hole payload.'
    );
  END IF;

  v_supplied_holes := jsonb_array_length(p_holes);
  v_expected_holes := COALESCE((p_round_data->>'holes_played')::INT, v_supplied_holes);

  IF v_supplied_holes = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Round submission requires at least one hole.'
    );
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE elem->>'score' IS NULL),
    COUNT(*) FILTER (WHERE elem->>'putts' IS NULL),
    COALESCE(SUM(CASE WHEN elem->>'score' IS NULL THEN 0 ELSE (elem->>'score')::INT END), 0),
    COALESCE(SUM(CASE WHEN elem->>'putts' IS NULL THEN 0 ELSE (elem->>'putts')::INT END), 0),
    COUNT(DISTINCT (elem->>'hole_number')::INT),
    MIN((elem->>'hole_number')::INT),
    MAX((elem->>'hole_number')::INT)
  INTO
    v_null_score_holes,
    v_null_putt_holes,
    v_hole_score_sum,
    v_hole_putt_sum,
    v_distinct_hole_numbers,
    v_min_hole_number,
    v_max_hole_number
  FROM jsonb_array_elements(p_holes) elem;

  IF v_supplied_holes <> v_expected_holes THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Round submission hole count mismatch: expected %s holes but received %s.', v_expected_holes, v_supplied_holes)
    );
  END IF;

  IF v_distinct_hole_numbers <> v_supplied_holes
     OR COALESCE(v_min_hole_number, 0) <> 1
     OR COALESCE(v_max_hole_number, 0) <> v_expected_holes THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Round submission requires one complete hole entry for every hole in the round.'
    );
  END IF;

  IF v_null_score_holes > 0 OR v_null_putt_holes > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Round submission rejected: %s hole scores and %s hole putt values are missing.',
        v_null_score_holes,
        v_null_putt_holes
      )
    );
  END IF;

  IF p_round_data->>'total_score' IS NOT NULL
     AND v_hole_score_sum <> (p_round_data->>'total_score')::INT THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Round submission score mismatch: round total %s does not equal hole total %s.',
        (p_round_data->>'total_score')::INT,
        v_hole_score_sum
      )
    );
  END IF;

  IF p_round_data->>'total_putts' IS NOT NULL
     AND v_hole_putt_sum <> (p_round_data->>'total_putts')::INT THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Round submission putt mismatch: round total %s does not equal hole total %s.',
        (p_round_data->>'total_putts')::INT,
        v_hole_putt_sum
      )
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
        RETURNING id, hole_number, shot_number INTO v_shot_id, v_hole_number, v_shot_number;

        v_inserted_shots := v_inserted_shots || jsonb_build_object(
          'shot_id', v_shot_id,
          'hole_number', v_hole_number,
          'shot_number', v_shot_number
        );
      END LOOP;
    END LOOP;
  END IF;

  IF p_putt_details IS NOT NULL AND jsonb_array_length(p_putt_details) > 0 THEN
    FOR v_putt IN SELECT * FROM jsonb_array_elements(p_putt_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_target_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_putt->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_putt->>'shot_number')::INT
      LIMIT 1;

      IF v_target_shot_id IS NOT NULL THEN
        BEGIN
          v_distance_feet := (v_putt->>'distance_feet')::NUMERIC;
          IF v_distance_feet IS NOT NULL THEN
            v_distance_feet := GREATEST(0, LEAST(500, v_distance_feet));
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_distance_feet := NULL;
        END;

        v_break_direction := v_putt->>'break_direction';
        IF v_break_direction IS NOT NULL AND v_break_direction NOT IN ('left_to_right', 'right_to_left', 'straight', 'multiple') THEN
          v_break_direction := NULL;
        END IF;

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

  IF p_approach_details IS NOT NULL AND jsonb_array_length(p_approach_details) > 0 THEN
    FOR v_approach IN SELECT * FROM jsonb_array_elements(p_approach_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_target_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_approach->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_approach->>'shot_number')::INT
      LIMIT 1;

      IF v_target_shot_id IS NOT NULL THEN
        v_lie_type := v_approach->>'lie_type';
        IF v_lie_type IS NOT NULL AND v_lie_type NOT IN (
          'fairway', 'rough', 'sand', 'bunker', 'recovery', 'hazard',
          'green', 'tee', 'other', 'penalty', 'deep_rough'
        ) THEN
          v_lie_type := NULL;
        END IF;

        v_miss_direction := v_approach->>'miss_direction';
        IF v_miss_direction IS NOT NULL AND v_miss_direction NOT IN (
          'short', 'long', 'left', 'right', 'short_left', 'short_right', 'long_left', 'long_right'
        ) THEN
          v_miss_direction := NULL;
        END IF;

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

WITH repaired_holes AS (
  SELECT
    r.id AS round_id,
    (hole->>'holeNumber')::INT AS hole_number,
    (hole->>'par')::INT AS par,
    CASE WHEN hole->>'yardage' IS NULL THEN NULL ELSE (hole->>'yardage')::INT END AS yardage,
    CASE WHEN hole->>'score' IS NULL THEN NULL ELSE (hole->>'score')::INT END AS score,
    CASE WHEN hole->>'putts' IS NULL THEN NULL ELSE (hole->>'putts')::INT END AS putts,
    CASE
      WHEN hole->>'fairwayHit' IS NULL OR hole->>'fairwayHit' = 'null' THEN NULL
      ELSE (hole->>'fairwayHit')::BOOLEAN
    END AS fairway_hit,
    CASE
      WHEN hole->>'greenInRegulation' IS NULL OR hole->>'greenInRegulation' = 'null' THEN NULL
      ELSE (hole->>'greenInRegulation')::BOOLEAN
    END AS gir,
    CASE
      WHEN hole->>'penaltyStrokes' IS NULL OR hole->>'penaltyStrokes' = 'null' THEN NULL
      ELSE (hole->>'penaltyStrokes')::INT
    END AS penalty_strokes,
    CASE
      WHEN COALESCE((hole->>'scrambleAttempt')::BOOLEAN, false) = false THEN NULL
      WHEN hole->>'scrambleMade' IS NULL OR hole->>'scrambleMade' = 'null' THEN NULL
      ELSE (hole->>'scrambleMade')::BOOLEAN
    END AS up_and_down,
    CASE
      WHEN COALESCE((hole->>'sandSaveAttempt')::BOOLEAN, false) = false THEN NULL
      WHEN hole->>'sandSaveMade' IS NULL OR hole->>'sandSaveMade' = 'null' THEN NULL
      ELSE (hole->>'sandSaveMade')::BOOLEAN
    END AS sand_save
  FROM golf_rounds r
  CROSS JOIN LATERAL jsonb_array_elements(r.draft_data->'completedHoleStats') AS hole
  WHERE r.id = '03b0ea5d-7a4f-4a51-b699-c90e9204baf3'
    AND r.draft_data ? 'completedHoleStats'
), updated_holes AS (
  UPDATE golf_holes gh
  SET
    par = rh.par,
    yardage = COALESCE(rh.yardage, gh.yardage),
    score = rh.score,
    putts = rh.putts,
    fairway_hit = rh.fairway_hit,
    gir = rh.gir,
    penalty_strokes = rh.penalty_strokes,
    up_and_down = rh.up_and_down,
    sand_save = rh.sand_save
  FROM repaired_holes rh
  WHERE gh.round_id = rh.round_id
    AND gh.hole_number = rh.hole_number
  RETURNING gh.round_id, gh.hole_number, gh.par, gh.score, gh.putts, gh.fairway_hit, gh.gir, gh.penalty_strokes
), repaired_round AS (
  SELECT
    round_id,
    COUNT(*) AS holes_played,
    COALESCE(SUM(score), 0) AS total_score,
    COALESCE(SUM(putts), 0) AS total_putts,
    COALESCE(SUM(CASE WHEN fairway_hit IS TRUE THEN 1 ELSE 0 END), 0) AS total_fairways_hit,
    COALESCE(SUM(CASE WHEN par > 3 THEN 1 ELSE 0 END), 0) AS total_fairways,
    COALESCE(SUM(CASE WHEN gir IS TRUE THEN 1 ELSE 0 END), 0) AS total_gir,
    COALESCE(SUM(CASE WHEN penalty_strokes IS NULL THEN 0 ELSE penalty_strokes END), 0) AS total_penalties,
    COALESCE(SUM(CASE WHEN hole_number <= 9 THEN score ELSE 0 END), 0) AS front_nine,
    COALESCE(SUM(CASE WHEN hole_number >= 10 THEN score ELSE 0 END), 0) AS back_nine,
    COALESCE(SUM(score - par), 0) AS score_to_par
  FROM updated_holes
  GROUP BY round_id
)
UPDATE golf_rounds gr
SET
  holes_played = rr.holes_played,
  total_score = rr.total_score,
  total_putts = rr.total_putts,
  total_fairways_hit = rr.total_fairways_hit,
  total_fairways = rr.total_fairways,
  total_gir = rr.total_gir,
  total_gir_possible = rr.holes_played,
  total_penalties = rr.total_penalties,
  front_nine = rr.front_nine,
  back_nine = rr.back_nine,
  score_to_par = rr.score_to_par,
  draft_data = NULL,
  updated_at = NOW()
FROM repaired_round rr
WHERE gr.id = rr.round_id;

DELETE FROM golf_round_stats_cache
WHERE round_id = '03b0ea5d-7a4f-4a51-b699-c90e9204baf3';

UPDATE golf_player_stats_cache
SET is_stale = TRUE
WHERE player_id = (
  SELECT player_id
  FROM golf_rounds
  WHERE id = '03b0ea5d-7a4f-4a51-b699-c90e9204baf3'
);
