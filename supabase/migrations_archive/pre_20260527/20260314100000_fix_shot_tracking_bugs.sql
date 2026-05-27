-- =============================================================================
-- Migration: fix_shot_tracking_bugs
-- Date: 2026-03-14
-- Fixes bugs 1-6 from SHOT_TRACKING_DEEP_SCRUB.md
-- Idempotent: safe to run multiple times
-- =============================================================================

-- =============================================================================
-- BUG 2 FIX: Drop dead `club_used` column from golf_shots
-- =============================================================================
ALTER TABLE golf_shots DROP COLUMN IF EXISTS club_used;

-- =============================================================================
-- BUG 3 FIX: Populate golf_course_holes from existing round data
-- SKIPPED: All 27 completed rounds have course_id = NULL, so there is no
-- course_id to use as FK into golf_course_holes. This fix will be applied
-- once rounds start being linked to courses via course_id.
-- =============================================================================

-- =============================================================================
-- BUG 1 + BUG 6 FIX: SG calculation timing + consolidate SG functions
-- =============================================================================

-- Step 1: Drop the BEFORE trigger that fires before holes are re-inserted
DROP TRIGGER IF EXISTS trg_calculate_strokes_gained ON golf_rounds;

-- Step 2: Drop the coarse get_expected_strokes function (keep sg_expected_strokes)
DROP FUNCTION IF EXISTS get_expected_strokes(text, numeric, boolean);

-- Step 3: Update calculate_round_strokes_gained to use sg_expected_strokes
CREATE OR REPLACE FUNCTION public.calculate_round_strokes_gained(p_round_id uuid)
 RETURNS TABLE(sg_total numeric, sg_tee numeric, sg_approach numeric, sg_around_green numeric, sg_putting numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shot RECORD;
  v_expected_before NUMERIC(5,3);
  v_expected_after NUMERIC(5,3);
  v_shot_sg NUMERIC(5,3);
  v_distance_before NUMERIC;
  v_distance_after NUMERIC;
  v_lie_before TEXT;
  v_lie_after TEXT;
  v_is_putting BOOLEAN;
  v_shot_type TEXT;
  v_sg_total NUMERIC(5,2) := 0;
  v_sg_tee NUMERIC(5,2) := 0;
  v_sg_approach NUMERIC(5,2) := 0;
  v_sg_around_green NUMERIC(5,2) := 0;
  v_sg_putting NUMERIC(5,2) := 0;
BEGIN
  FOR v_shot IN
    SELECT
      s.shot_type,
      s.lie_before,
      COALESCE(s.lie_after, s.result) AS lie_after,
      s.distance_to_hole_before,
      s.distance_to_hole_after,
      s.distance_unit_before,
      s.distance_unit_after,
      s.result,
      s.is_penalty
    FROM golf_shots s
    JOIN golf_holes h ON h.id = s.hole_id
    WHERE h.round_id = p_round_id
      AND s.is_penalty IS NOT TRUE
    ORDER BY h.hole_number, s.shot_number
  LOOP
    IF v_shot.distance_to_hole_before IS NULL THEN
      CONTINUE;
    END IF;

    v_lie_before := COALESCE(v_shot.lie_before, 'fairway');
    v_lie_after := COALESCE(v_shot.lie_after, v_shot.result, 'fairway');
    v_is_putting := v_lie_before = 'green' OR v_shot.shot_type = 'putting';

    -- Convert distance to yards for sg_expected_strokes
    v_distance_before := v_shot.distance_to_hole_before;
    IF v_is_putting THEN
      -- For putting, sg_expected_strokes expects yards, so convert feet to yards
      IF v_shot.distance_unit_before = 'feet' THEN
        v_distance_before := v_distance_before / 3.0;
      END IF;
      -- If already yards, use as-is
      v_expected_before := sg_expected_strokes('green', v_distance_before);
    ELSE
      IF v_shot.distance_unit_before = 'feet' THEN
        v_distance_before := v_distance_before / 3.0;
      END IF;
      v_expected_before := sg_expected_strokes(v_lie_before, v_distance_before);
    END IF;

    IF v_shot.result = 'hole' OR v_shot.distance_to_hole_after = 0 THEN
      v_expected_after := 0;
    ELSIF v_shot.distance_to_hole_after IS NOT NULL THEN
      v_distance_after := v_shot.distance_to_hole_after;
      IF v_lie_after = 'green' THEN
        -- For green, convert feet to yards for sg_expected_strokes
        IF v_shot.distance_unit_after = 'feet' THEN
          v_distance_after := v_distance_after / 3.0;
        END IF;
        v_expected_after := sg_expected_strokes('green', v_distance_after);
      ELSE
        IF v_shot.distance_unit_after = 'feet' THEN
          v_distance_after := v_distance_after / 3.0;
        END IF;
        v_expected_after := sg_expected_strokes(v_lie_after, v_distance_after);
      END IF;
    ELSE
      CONTINUE;
    END IF;

    v_shot_sg := v_expected_before - (1 + v_expected_after);

    v_shot_type := COALESCE(v_shot.shot_type,
      CASE
        WHEN v_lie_before = 'green' THEN 'putting'
        WHEN v_lie_before = 'tee' THEN 'tee'
        WHEN v_distance_before <= 50 THEN 'around_green'
        ELSE 'approach'
      END
    );

    CASE v_shot_type
      WHEN 'tee' THEN v_sg_tee := v_sg_tee + v_shot_sg;
      WHEN 'approach' THEN v_sg_approach := v_sg_approach + v_shot_sg;
      WHEN 'around_green' THEN v_sg_around_green := v_sg_around_green + v_shot_sg;
      WHEN 'putting' THEN v_sg_putting := v_sg_putting + v_shot_sg;
      ELSE v_sg_approach := v_sg_approach + v_shot_sg;
    END CASE;

    v_sg_total := v_sg_total + v_shot_sg;
  END LOOP;

  sg_total := ROUND(v_sg_total, 2);
  sg_tee := ROUND(v_sg_tee, 2);
  sg_approach := ROUND(v_sg_approach, 2);
  sg_around_green := ROUND(v_sg_around_green, 2);
  sg_putting := ROUND(v_sg_putting, 2);

  RETURN NEXT;
END;
$function$;

-- Step 4: Modify submit_round_atomic to call recalculate_round_strokes_gained
-- after all data is inserted
CREATE OR REPLACE FUNCTION public.submit_round_atomic(p_round_id uuid, p_round_data jsonb, p_holes jsonb, p_shots jsonb, p_putt_details jsonb DEFAULT '[]'::jsonb, p_approach_details jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
 SET lock_timeout TO '15s'
AS $function$
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

  -- Calculate strokes gained after all data is inserted
  PERFORM recalculate_round_strokes_gained(p_round_id);

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'warnings', v_warnings
  );
END;
$function$;

-- Step 5: Fix the broken rounds by recalculating SG
SELECT recalculate_round_strokes_gained(id) FROM golf_rounds
WHERE status = 'completed'
AND (strokes_gained_total = 0 OR strokes_gained_total IS NULL
     OR strokes_gained_tee IS NULL);

-- =============================================================================
-- BUG 4 FIX: Auto-save UPSERT instead of DELETE+INSERT
-- =============================================================================
CREATE OR REPLACE FUNCTION public.save_partial_round_atomic(p_round_id uuid, p_round_data jsonb, p_holes jsonb, p_shots jsonb, p_putt_details jsonb DEFAULT NULL::jsonb, p_approach_details jsonb DEFAULT NULL::jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
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
  v_max_hole_number INT := 0;
  v_max_shot_numbers JSONB := '{}'::JSONB;
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

  -- Optimistic locking: reject if the round was modified since the client last saved
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

  -- UPSERT holes instead of DELETE+INSERT
  IF p_holes IS NOT NULL AND jsonb_array_length(p_holes) > 0 THEN
    FOR v_hole_record IN SELECT * FROM jsonb_array_elements(p_holes)
    LOOP
      v_hole_number := (v_hole_record->>'hole_number')::INT;

      -- Track max hole number for cleanup
      IF v_hole_number > v_max_hole_number THEN
        v_max_hole_number := v_hole_number;
      END IF;

      INSERT INTO golf_holes (
        round_id, hole_number, par, score, putts,
        fairway_hit, gir, penalty_strokes,
        up_and_down, sand_save, yardage
      ) VALUES (
        p_round_id,
        v_hole_number,
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
      ON CONFLICT (round_id, hole_number) DO UPDATE SET
        par = EXCLUDED.par,
        score = EXCLUDED.score,
        putts = EXCLUDED.putts,
        fairway_hit = EXCLUDED.fairway_hit,
        gir = EXCLUDED.gir,
        penalty_strokes = EXCLUDED.penalty_strokes,
        up_and_down = EXCLUDED.up_and_down,
        sand_save = EXCLUDED.sand_save,
        yardage = EXCLUDED.yardage
      RETURNING id, hole_number INTO v_hole_id, v_hole_number;

      v_inserted_holes := v_inserted_holes || jsonb_build_object(
        'hole_id', v_hole_id,
        'hole_number', v_hole_number
      );
    END LOOP;

    -- Delete holes beyond the current payload
    DELETE FROM golf_shots WHERE round_id = p_round_id AND hole_number > v_max_hole_number;
    DELETE FROM golf_holes WHERE round_id = p_round_id AND hole_number > v_max_hole_number;
  END IF;

  -- UPSERT shots instead of DELETE+INSERT
  IF p_shots IS NOT NULL AND jsonb_array_length(p_shots) > 0 THEN
    FOR v_shot_group IN SELECT * FROM jsonb_array_elements(p_shots)
    LOOP
      v_hole_number := (v_shot_group->>'hole_number')::INT;
      SELECT (elem->>'hole_id')::UUID INTO v_hole_id
      FROM jsonb_array_elements(v_inserted_holes) elem
      WHERE (elem->>'hole_number')::INT = v_hole_number
      LIMIT 1;

      IF v_hole_id IS NULL THEN
        -- Try to find the hole_id from existing data
        SELECT id INTO v_hole_id FROM golf_holes
        WHERE round_id = p_round_id AND hole_number = v_hole_number;
      END IF;

      IF v_hole_id IS NULL THEN
        CONTINUE;
      END IF;

      DECLARE
        v_max_shot_in_hole INT := 0;
        v_shot_number_val INT;
      BEGIN
        FOR v_shot IN SELECT * FROM jsonb_array_elements(v_shot_group->'shots')
        LOOP
          v_shot_number_val := (v_shot->>'shot_number')::INT;

          IF v_shot_number_val > v_max_shot_in_hole THEN
            v_max_shot_in_hole := v_shot_number_val;
          END IF;

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
            v_shot_number_val,
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
          ON CONFLICT (round_id, hole_number, shot_number) DO UPDATE SET
            hole_id = EXCLUDED.hole_id,
            shot_type = EXCLUDED.shot_type,
            club_type = EXCLUDED.club_type,
            lie_before = EXCLUDED.lie_before,
            lie_after = EXCLUDED.lie_after,
            distance_to_hole_before = EXCLUDED.distance_to_hole_before,
            distance_unit_before = EXCLUDED.distance_unit_before,
            result = EXCLUDED.result,
            distance_to_hole_after = EXCLUDED.distance_to_hole_after,
            distance_unit_after = EXCLUDED.distance_unit_after,
            shot_distance = EXCLUDED.shot_distance,
            miss_direction = EXCLUDED.miss_direction,
            putt_break = EXCLUDED.putt_break,
            putt_slope = EXCLUDED.putt_slope,
            putt_distance_feet = EXCLUDED.putt_distance_feet,
            putt_made = EXCLUDED.putt_made,
            is_penalty = EXCLUDED.is_penalty,
            penalty_type = EXCLUDED.penalty_type
          RETURNING id INTO v_shot_id;

          v_inserted_shots := v_inserted_shots || jsonb_build_object(
            'shot_id', v_shot_id,
            'hole_number', v_hole_number,
            'shot_number', v_shot_number_val
          );
        END LOOP;

        -- Delete extra shots beyond what was in this hole's payload
        IF v_max_shot_in_hole > 0 THEN
          DELETE FROM golf_shots
          WHERE round_id = p_round_id
            AND hole_number = v_hole_number
            AND shot_number > v_max_shot_in_hole;
        END IF;
      END;
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

-- =============================================================================
-- BUG 5 FIX: Merge 3 player stats triggers into 1
-- =============================================================================

-- Step 1: Create combined function
CREATE OR REPLACE FUNCTION update_player_stats_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_player_id UUID;
  -- Base stats variables
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
  v_rounds_18 INTEGER;
  v_total_score_18 NUMERIC;
  v_score_to_par_18 NUMERIC;
  -- Enhanced stats variables
  v_last_5_avg NUMERIC(5,2);
  v_last_10_avg NUMERIC(5,2);
  v_prev_5_avg NUMERIC(5,2);
  v_improvement NUMERIC(5,2);
  v_trend TEXT;
  v_round_ids UUID[];
  v_season_start DATE;
  v_rounds_this_season INTEGER;
  -- Strokes gained variables
  v_sg_total_avg NUMERIC;
  v_sg_tee_avg NUMERIC;
  v_sg_approach_avg NUMERIC;
  v_sg_ag_avg NUMERIC;
  v_sg_putting_avg NUMERIC;
  v_sg_total_sum NUMERIC;
  v_sg_tee_sum NUMERIC;
  v_sg_approach_sum NUMERIC;
  v_sg_ag_sum NUMERIC;
  v_sg_putting_sum NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_player_id := OLD.player_id;
  ELSE
    v_player_id := NEW.player_id;
  END IF;

  -- =========================================================================
  -- PART 1: Base stats (from update_player_stats_cache)
  -- =========================================================================
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

  SELECT MIN(round_date), MAX(round_date)
  INTO v_first_round_date, v_last_round_date
  FROM golf_rounds
  WHERE player_id = v_player_id AND status = 'completed';

  SELECT
    AVG(CASE WHEN par = 3 THEN score END),
    AVG(CASE WHEN par = 4 THEN score END),
    AVG(CASE WHEN par = 5 THEN score END)
  INTO v_par3_average, v_par4_average, v_par5_average
  FROM golf_holes h
  JOIN golf_rounds r ON r.id = h.round_id
  WHERE r.player_id = v_player_id AND r.status = 'completed';

  SELECT COALESCE(SUM(COALESCE(holes_played, 18)), 0)
  INTO v_total_holes
  FROM golf_rounds
  WHERE player_id = v_player_id AND status = 'completed';

  SELECT COUNT(*), SUM(r.total_score), SUM(r.score_to_par)
  INTO v_rounds_18, v_total_score_18, v_score_to_par_18
  FROM golf_rounds r
  WHERE r.player_id = v_player_id
    AND r.status = 'completed'
    AND r.total_score IS NOT NULL
    AND COALESCE(r.holes_played, 18) = 18;

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

  IF v_rounds_18 > 0 THEN
    v_scoring_average := v_total_score_18::NUMERIC / v_rounds_18;
    v_scoring_average_vs_par := v_score_to_par_18::NUMERIC / v_rounds_18;
  END IF;

  IF v_total_holes > 0 THEN
    v_putts_per_round := (v_total_putts::NUMERIC / v_total_holes) * 18;
    v_penalty_per_round := (v_total_penalties::NUMERIC / v_total_holes) * 18;
    v_one_putt_percentage := (v_total_one_putts::NUMERIC / v_total_holes) * 100;
    v_three_putt_percentage := (v_total_three_putts::NUMERIC / v_total_holes) * 100;
  ELSIF v_rounds_played > 0 THEN
    v_putts_per_round := v_total_putts::NUMERIC / v_rounds_played;
    v_penalty_per_round := v_total_penalties::NUMERIC / v_rounds_played;
  END IF;

  SELECT
    MIN(r.total_score * (18.0 / COALESCE(r.holes_played, 18))),
    MAX(r.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_best_round_normalized, v_worst_round_normalized
  FROM golf_rounds r
  WHERE r.player_id = v_player_id
    AND r.status = 'completed'
    AND r.total_score IS NOT NULL;

  -- If no rounds, delete the cache row and return
  IF v_rounds_played = 0 OR v_rounds_played IS NULL THEN
    DELETE FROM golf_player_stats_cache WHERE player_id = v_player_id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- =========================================================================
  -- PART 2: Enhanced stats (from update_player_stats_cache_enhanced)
  -- =========================================================================
  v_season_start := make_date(
    CASE
      WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
      ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::INTEGER
    END,
    8,
    1
  );

  SELECT COUNT(*), ARRAY_AGG(rsc.round_id ORDER BY r.round_date DESC)
  INTO v_rounds_this_season, v_round_ids
  FROM golf_round_stats_cache rsc
  JOIN golf_rounds r ON r.id = rsc.round_id
  WHERE rsc.player_id = v_player_id
    AND r.round_date >= v_season_start;

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

  -- =========================================================================
  -- PART 3: Strokes gained aggregation (from update_player_stats_strokes_gained)
  -- =========================================================================
  SELECT
    AVG(strokes_gained_total),
    AVG(strokes_gained_tee),
    AVG(strokes_gained_approach),
    AVG(strokes_gained_around_green),
    AVG(strokes_gained_putting),
    SUM(strokes_gained_total),
    SUM(strokes_gained_tee),
    SUM(strokes_gained_approach),
    SUM(strokes_gained_around_green),
    SUM(strokes_gained_putting)
  INTO
    v_sg_total_avg, v_sg_tee_avg, v_sg_approach_avg, v_sg_ag_avg, v_sg_putting_avg,
    v_sg_total_sum, v_sg_tee_sum, v_sg_approach_sum, v_sg_ag_sum, v_sg_putting_sum
  FROM golf_round_stats_cache
  WHERE player_id = v_player_id
    AND strokes_gained_total IS NOT NULL;

  -- =========================================================================
  -- UPSERT: All fields in a single operation
  -- =========================================================================
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
    -- Enhanced fields
    last_5_average,
    last_10_average,
    improvement_trend,
    trend_direction,
    rounds_this_season,
    season_start_date,
    round_ids_included,
    -- Strokes gained fields
    strokes_gained_total,
    strokes_gained_tee,
    strokes_gained_approach,
    strokes_gained_around_green,
    strokes_gained_putting,
    sg_total_per_round,
    sg_tee_per_round,
    sg_approach_per_round,
    sg_around_green_per_round,
    sg_putting_per_round,
    -- Meta
    is_stale,
    next_refresh_due,
    created_at,
    updated_at
  ) VALUES (
    v_player_id,
    v_scoring_average,
    v_scoring_average_vs_par,
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
    -- Enhanced
    v_last_5_avg,
    v_last_10_avg,
    v_improvement,
    v_trend,
    v_rounds_this_season,
    v_season_start,
    v_round_ids,
    -- Strokes gained
    v_sg_total_sum,
    v_sg_tee_sum,
    v_sg_approach_sum,
    v_sg_ag_sum,
    v_sg_putting_sum,
    ROUND(v_sg_total_avg, 2),
    ROUND(v_sg_tee_avg, 2),
    ROUND(v_sg_approach_avg, 2),
    ROUND(v_sg_ag_avg, 2),
    ROUND(v_sg_putting_avg, 2),
    -- Meta
    FALSE,
    NOW() + INTERVAL '1 hour',
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
    -- Enhanced
    last_5_average = EXCLUDED.last_5_average,
    last_10_average = EXCLUDED.last_10_average,
    improvement_trend = EXCLUDED.improvement_trend,
    trend_direction = EXCLUDED.trend_direction,
    rounds_this_season = EXCLUDED.rounds_this_season,
    season_start_date = EXCLUDED.season_start_date,
    round_ids_included = EXCLUDED.round_ids_included,
    -- Strokes gained
    strokes_gained_total = EXCLUDED.strokes_gained_total,
    strokes_gained_tee = EXCLUDED.strokes_gained_tee,
    strokes_gained_approach = EXCLUDED.strokes_gained_approach,
    strokes_gained_around_green = EXCLUDED.strokes_gained_around_green,
    strokes_gained_putting = EXCLUDED.strokes_gained_putting,
    sg_total_per_round = EXCLUDED.sg_total_per_round,
    sg_tee_per_round = EXCLUDED.sg_tee_per_round,
    sg_approach_per_round = EXCLUDED.sg_approach_per_round,
    sg_around_green_per_round = EXCLUDED.sg_around_green_per_round,
    sg_putting_per_round = EXCLUDED.sg_putting_per_round,
    -- Meta
    is_stale = FALSE,
    next_refresh_due = NOW() + INTERVAL '1 hour',
    updated_at = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Step 2: Drop old triggers
DROP TRIGGER IF EXISTS trg_update_player_stats_cache ON golf_round_stats_cache;
DROP TRIGGER IF EXISTS trg_update_player_stats_cache_enhanced ON golf_round_stats_cache;
DROP TRIGGER IF EXISTS trg_update_player_strokes_gained ON golf_round_stats_cache;

-- Step 3: Create single new trigger
CREATE TRIGGER trg_update_player_stats_complete
AFTER INSERT OR DELETE OR UPDATE ON golf_round_stats_cache
FOR EACH ROW EXECUTE FUNCTION update_player_stats_complete();
