-- Migration: Update save_partial_round_atomic to support:
-- 1. Optimistic locking via p_expected_updated_at (conflict detection)
-- 2. Return updated_at in the response for client tracking
-- 3. Save putt_details and approach_miss_details (previously silently dropped)
--
-- Backward-compatible: all new params default to NULL.
-- Drop old 4-param overload to avoid ambiguous PostgREST routing.
DROP FUNCTION IF EXISTS public.save_partial_round_atomic(uuid, jsonb, jsonb, jsonb);

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

        -- Track inserted shot IDs for detail tables
        v_inserted_shots := v_inserted_shots || jsonb_build_object(
          'shot_id', v_shot_id,
          'hole_number', v_hole_number,
          'shot_number', (v_shot->>'shot_number')::INT
        );
      END LOOP;
    END LOOP;
  END IF;

  -- Insert putt_details if provided
  IF p_putt_details IS NOT NULL AND jsonb_array_length(p_putt_details) > 0 THEN
    FOR v_detail IN SELECT * FROM jsonb_array_elements(p_putt_details)
    LOOP
      -- Find the matching shot_id
      SELECT (elem->>'shot_id')::UUID INTO v_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_detail->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_detail->>'shot_number')::INT
      LIMIT 1;

      IF v_shot_id IS NOT NULL THEN
        INSERT INTO putt_details (shot_id, miss_tags, break_direction, distance_feet, made)
        VALUES (
          v_shot_id,
          CASE WHEN v_detail->'miss_tags' IS NULL THEN '{}' ELSE ARRAY(SELECT jsonb_array_elements_text(v_detail->'miss_tags')) END,
          v_detail->>'break_direction',
          CASE WHEN v_detail->>'distance_feet' IS NULL THEN NULL ELSE (v_detail->>'distance_feet')::NUMERIC END,
          CASE WHEN v_detail->>'made' IS NULL THEN NULL ELSE (v_detail->>'made')::BOOLEAN END
        );
      END IF;
    END LOOP;
  END IF;

  -- Insert approach_miss_details if provided
  IF p_approach_details IS NOT NULL AND jsonb_array_length(p_approach_details) > 0 THEN
    FOR v_detail IN SELECT * FROM jsonb_array_elements(p_approach_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_detail->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_detail->>'shot_number')::INT
      LIMIT 1;

      IF v_shot_id IS NOT NULL THEN
        INSERT INTO approach_miss_details (shot_id, miss_direction, lie_type, distance_from_green_yards)
        VALUES (
          v_shot_id,
          v_detail->>'miss_direction',
          v_detail->>'lie_type',
          CASE WHEN v_detail->>'distance_from_green_yards' IS NULL THEN NULL ELSE (v_detail->>'distance_from_green_yards')::NUMERIC END
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'updated_at', v_new_updated_at
  );
END;
$function$;
