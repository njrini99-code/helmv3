-- ROLLBACK CAPTURE for supabase/migrations/20261031134708_submit_round_open_completed_qualifier.sql
--
-- Forward change: removes the completed-qualifier refusal from submit_round_atomic by anchored text replacement.
-- Prior definition below was captured VERBATIM from the live production catalog (pg_get_functiondef, read-only,
-- 2026-10-31). prosrc md5 at capture: dde64d4f093e39d0b96d6119adab4093. Running this file restores it.

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
  PERFORM set_config('helm.golf_lifecycle_write', 'atomic', true);
  PERFORM helm_private.configure_trace_context(p_round_data);
  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic', NULL, 'enter', 'started', jsonb_build_object('function', 'submit_round_atomic'));
  SELECT id INTO v_player_id FROM golf_players WHERE user_id = auth.uid();

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player profile not found.');
  END IF;

  -- SINGLE-FLIGHT GUARD (bounded wait, not NOWAIT -- see header). If a
  -- same-round auto-save (or a second submit) already holds this row, wait up
  -- to 3s for it to release rather than failing on first contact; if the
  -- round is still locked past that, fail fast with 'busy' instead of queuing
  -- behind the function's ambient 15s lock_timeout.
  BEGIN
    SET LOCAL lock_timeout = '3s';
    PERFORM 1 FROM golf_rounds
    WHERE id = p_round_id
      AND player_id = v_player_id
      AND status != 'completed'
    FOR UPDATE;
  EXCEPTION WHEN lock_not_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'busy');
  END;
  SET LOCAL lock_timeout = '15s';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round not found, already completed, or no permission.');
  END IF;

  -- Optimistic lock (swap audit C-6): the caller's last acknowledged
  -- updated_at. The row is already locked above, so this read is current.
  IF NULLIF(p_round_data->>'expected_updated_at', '') IS NOT NULL
     AND (SELECT updated_at FROM golf_rounds WHERE id = p_round_id)
         > (p_round_data->>'expected_updated_at')::timestamptz THEN
    RETURN jsonb_build_object('success', false, 'error', 'conflict');
  END IF;

  IF p_holes IS NULL OR jsonb_typeof(p_holes) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round submission requires a complete hole payload.');
  END IF;

  v_supplied_holes := jsonb_array_length(p_holes);
  v_expected_holes := COALESCE((p_round_data->>'holes_played')::INT, v_supplied_holes);

  IF v_supplied_holes = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round submission requires at least one hole.');
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
    v_null_score_holes, v_null_putt_holes, v_hole_score_sum, v_hole_putt_sum,
    v_distinct_hole_numbers, v_min_hole_number, v_max_hole_number
  FROM jsonb_array_elements(p_holes) elem;

  IF v_supplied_holes <> v_expected_holes THEN
    RETURN jsonb_build_object('success', false, 'error', format('Hole count mismatch: expected %s got %s.', v_expected_holes, v_supplied_holes));
  END IF;

  IF v_distinct_hole_numbers <> v_supplied_holes
     OR COALESCE(v_min_hole_number, 0) <> 1
     OR COALESCE(v_max_hole_number, 0) <> v_expected_holes THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requires one complete hole entry for every hole.');
  END IF;

  IF v_null_score_holes > 0 OR v_null_putt_holes > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', format('%s scores and %s putts missing.', v_null_score_holes, v_null_putt_holes));
  END IF;

  IF p_round_data->>'total_score' IS NOT NULL AND v_hole_score_sum <> (p_round_data->>'total_score')::INT THEN
    RETURN jsonb_build_object('success', false, 'error', format('Score mismatch: round %s vs holes %s.', (p_round_data->>'total_score')::INT, v_hole_score_sum));
  END IF;

  IF p_round_data->>'total_putts' IS NOT NULL AND v_hole_putt_sum <> (p_round_data->>'total_putts')::INT THEN
    RETURN jsonb_build_object('success', false, 'error', format('Putt mismatch: round %s vs holes %s.', (p_round_data->>'total_putts')::INT, v_hole_putt_sum));
  END IF;


  -- The action layer validates these conditions for a helpful UI error. Keep
  -- this SECURITY DEFINER guard too: a direct RPC must not bypass a coach's
  -- manual closure or finish a legacy qualifier row without a safe number.
  IF EXISTS (
    SELECT 1
    FROM golf_rounds r
    JOIN golf_qualifiers q ON q.id = r.qualifier_id
    WHERE r.id = p_round_id
      AND q.status = 'completed'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This qualifier has already been completed. Rounds can no longer be submitted.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM golf_rounds r
    WHERE r.id = p_round_id
      AND r.qualifier_id IS NOT NULL
      AND r.qualifier_round_number IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM golf_qualifiers q
        JOIN golf_qualifier_entries qe
          ON qe.qualifier_id = q.id
         AND qe.player_id = v_player_id
        WHERE q.id = r.qualifier_id
          AND q.status IS DISTINCT FROM 'completed'
          AND p_round_data->>'qualifier_id' = r.qualifier_id::TEXT
          -- CASE guarantees malformed or oversized text is never cast to INT.
          AND CASE
            WHEN (p_round_data->>'qualifier_round_number') ~ '^[1-9][0-9]{0,8}$'
              THEN (p_round_data->>'qualifier_round_number')::INT <= q.num_rounds
            ELSE false
          END
      )
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This started qualifier round needs a valid qualifier round number.'
    );
  END IF;

  -- Serialize the only legacy compatibility mutation before checking for an
  -- existing result. The unique index below remains the durable backstop.
  IF EXISTS (
    SELECT 1
    FROM golf_rounds r
    WHERE r.id = p_round_id
      AND r.qualifier_id IS NOT NULL
      AND r.qualifier_round_number IS NULL
  ) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      (SELECT r.qualifier_id::TEXT FROM golf_rounds r WHERE r.id = p_round_id)
        || ':' || v_player_id::TEXT || ':' || (p_round_data->>'qualifier_round_number'),
      0
    ));

    IF EXISTS (
      SELECT 1
      FROM golf_rounds duplicate_round
      WHERE duplicate_round.qualifier_id = (
        SELECT r.qualifier_id FROM golf_rounds r WHERE r.id = p_round_id
      )
        AND duplicate_round.player_id = v_player_id
        AND duplicate_round.qualifier_round_number =
          (p_round_data->>'qualifier_round_number')::INT
        AND duplicate_round.status IS DISTINCT FROM 'abandoned'
        AND duplicate_round.id <> p_round_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'You have already submitted this qualifier round.'
      );
    END IF;
  END IF;

  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic.update_round', 'db.submit_round_atomic', 'before', 'started', jsonb_build_object('table', 'golf_rounds'));

  -- Validate before the round row, holes, or shots are changed. Returning a
  -- normal ActionResult keeps the prior durable graph available to Continue
  -- Round and avoids turning a stale browser payload into destructive work.
  IF p_shots IS NOT NULL AND jsonb_typeof(p_shots) <> 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_snapshot',
      'error', 'Your round snapshot could not be verified. Your saved shots are safe; please retry.'
    );
  END IF;

  IF p_shots IS NOT NULL AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_shots) AS shot_group
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p_holes) = 'array' THEN p_holes
          ELSE '[]'::jsonb
        END
      ) AS hole_record
      WHERE hole_record->>'hole_number' = shot_group->>'hole_number'
    )
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_snapshot',
      'error', 'Your round snapshot could not be verified. Your saved shots are safe; please retry.'
    );
  END IF;


  UPDATE golf_rounds SET
    course_name = COALESCE(p_round_data->>'course_name', course_name),
    course_city = p_round_data->>'course_city',
    course_state = p_round_data->>'course_state',
    course_rating = CASE WHEN p_round_data->>'course_rating' IS NULL THEN NULL ELSE (p_round_data->>'course_rating')::NUMERIC END,
    course_slope = CASE WHEN p_round_data->>'course_slope' IS NULL THEN NULL ELSE (p_round_data->>'course_slope')::INT END,
    tees_played = p_round_data->>'tees_played',
    tee_id = CASE WHEN p_round_data->>'tee_id' IS NULL THEN NULL ELSE (p_round_data->>'tee_id')::uuid END,
    course_id = COALESCE((p_round_data->>'course_id')::uuid, course_id),
    round_type = CASE WHEN qualifier_id IS NOT NULL THEN 'qualifier' ELSE round_type END,
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
    qualifier_id = qualifier_id,
    qualifier_round_number = CASE WHEN qualifier_round_number IS NOT NULL THEN qualifier_round_number WHEN qualifier_id IS NOT NULL THEN CASE WHEN (p_round_data->>'qualifier_round_number') ~ '^[1-9][0-9]{0,8}$' THEN (p_round_data->>'qualifier_round_number')::INT END ELSE qualifier_round_number END,
    draft_data = NULL,
    updated_at = NOW()
  WHERE id = p_round_id AND player_id = v_player_id;

  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic.replace_snapshot', 'db.submit_round_atomic', 'before', 'started', jsonb_build_object('tables', jsonb_build_array('golf_shots', 'golf_holes')));
  DELETE FROM golf_shots WHERE round_id = p_round_id;
  DELETE FROM golf_holes WHERE round_id = p_round_id;

  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic.insert_holes', 'db.submit_round_atomic', 'before', 'started', jsonb_build_object('expected_holes', coalesce(jsonb_array_length(p_holes), 0)));
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

      v_inserted_holes := v_inserted_holes || jsonb_build_object('hole_id', v_hole_id, 'hole_number', v_hole_number);
    END LOOP;
  END IF;

  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic.insert_shots', 'db.submit_round_atomic', 'before', 'started', jsonb_build_object('shot_groups', coalesce(jsonb_array_length(p_shots), 0)));
  IF p_shots IS NOT NULL AND jsonb_array_length(p_shots) > 0 THEN
    FOR v_shot_group IN SELECT * FROM jsonb_array_elements(p_shots)
    LOOP
      v_hole_number := (v_shot_group->>'hole_number')::INT;
      SELECT (elem->>'hole_id')::UUID INTO v_hole_id
      FROM jsonb_array_elements(v_inserted_holes) elem
      WHERE (elem->>'hole_number')::INT = v_hole_number
      LIMIT 1;


      IF v_hole_id IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'Round snapshot has a shot group without a persisted hole.',
          DETAIL = format('round_id=%s hole_number=%s', p_round_id, v_hole_number),
          HINT = 'Retry with a complete round snapshot.';
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
          is_penalty, penalty_type, lie_after_recovery
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
          v_shot->>'penalty_type', CASE WHEN jsonb_typeof(v_shot->'lie_after_recovery') = 'boolean' THEN (v_shot->>'lie_after_recovery')::BOOLEAN END
        )
        RETURNING id, hole_number, shot_number INTO v_shot_id, v_hole_number, v_shot_number;

        v_inserted_shots := v_inserted_shots || jsonb_build_object('shot_id', v_shot_id, 'hole_number', v_hole_number, 'shot_number', v_shot_number);
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
            'error', v_err_msg
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
        IF v_lie_type IS NOT NULL AND v_lie_type NOT IN ('fairway','rough','sand','bunker','recovery','hazard','green','tee','other','penalty','deep_rough') THEN
          v_lie_type := NULL;
        END IF;

        v_miss_direction := v_approach->>'miss_direction';
        IF v_miss_direction IS NOT NULL AND v_miss_direction NOT IN ('short','long','left','right','short_left','short_right','long_left','long_right') THEN
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
          VALUES (v_target_shot_id, v_miss_direction, v_lie_type, v_distance_from_green);
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
          v_warnings := v_warnings || jsonb_build_object(
            'step', 'insert_approach_miss_details',
            'hole_number', (v_approach->>'hole_number')::INT,
            'shot_number', (v_approach->>'shot_number')::INT,
            'error_code', v_err_state,
            'error', v_err_msg
          );
        END;
      END IF;
    END LOOP;
  END IF;

  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic.recalculate_strokes_gained', 'db.submit_round_atomic', 'before', 'started', jsonb_build_object('round_id', p_round_id));
  PERFORM recalculate_round_strokes_gained(p_round_id);

  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic.commit', 'db.submit_round_atomic', 'before_return', 'success', jsonb_build_object('round_id', p_round_id, 'holes', jsonb_array_length(v_inserted_holes), 'shots', jsonb_array_length(v_inserted_shots)));
  RETURN jsonb_build_object('success', true, 'round_id', p_round_id, 'warnings', v_warnings);
EXCEPTION WHEN OTHERS THEN
  BEGIN
    PERFORM helm_private.trace_exception_checkpoint(p_round_data, 'db.submit_round_atomic.exception', 'db.submit_round_atomic', SQLSTATE, SQLERRM);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE;
END;
$function$;

ALTER FUNCTION public.submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) SET search_path TO 'public';
