-- Single-flight round SUBMIT against a same-round auto-save it may collide with
--
-- INCIDENT 2026-08-20/21, 17:07-17:30 UTC: a lock pile-up on
-- submit_round_atomic during a team submit window.
-- save_partial_round_atomic already got the
-- single-flight fix (20260820170000, FOR UPDATE NOWAIT -> {success:false,
-- error:'busy'}) because dropping an auto-save is safe by construction: the
-- next tick resends full state. Submit is not that: it is the terminal,
-- once-per-round action, and the client's 35s abort budget
-- (docs/audits/ROUND_SUBMIT_TIMEOUT_INVERSION_2026-08-20.md, fix 3) already
-- closed the "abandon and retry into a pile-up" hole that made NOWAIT
-- necessary for auto-save. db-migration-review therefore chose a bounded
-- 3s WAIT over NOWAIT here: give a same-round auto-save or a second submit tab
-- a short window to finish and release the row before failing, rather than
-- refusing on the first collision.
--
-- FIX: SET LOCAL lock_timeout = '3s' around the existing top-of-function
-- lookup, now taken FOR UPDATE. Reaching the 3s bound raises lock_not_available
-- (55P03) -- the same SQLSTATE NOWAIT raises immediately -- so the surrounding
-- BEGIN/EXCEPTION shape from 20260820170000 applies unchanged. FOUND is
-- function-scoped in plpgsql and survives the block, so the pre-existing
-- "not found / already completed / no permission" check below it is untouched.
-- lock_timeout is then restored to the function's ambient 15s so nothing
-- later in the body (or a future edit) inherits the 3s value by accident.
--
-- Everything else below is BYTE-IDENTICAL in logic to the production
-- definition captured via pg_get_functiondef on 2026-08-21 (the repo's prior
-- migration history for this function is NOT trusted as current -- "recorded
-- != applied"; this file was built from that live pull, reformatted for
-- readability, not from supabase/migrations/*.sql history).
--
-- This file is NOT YET APPLIED to production as of this commit. It ships as
-- a reviewed artifact; the commander applies it out-of-band after merge.
--
-- VERIFIED: diffed this body's clauses against `SELECT pg_get_functiondef(oid)
-- FROM pg_proc WHERE proname = 'submit_round_atomic'` pulled 2026-08-21 --
-- identical aside from the guard substitution described above. SET search_path
-- TO 'public', SET statement_timeout TO '30s', SET lock_timeout TO '15s', and
-- SECURITY DEFINER all appear explicitly on the CREATE OR REPLACE below, so
-- none of them silently reset to the type default the way an omitted SET
-- would (CREATE OR REPLACE replaces the whole proconfig, it does not merge it).
--
-- ROLLBACK: re-apply the prior body, i.e. this same CREATE OR REPLACE with the
-- guard section reverted to:
--   PERFORM 1 FROM golf_rounds
--     WHERE id = p_round_id AND player_id = v_player_id
--     AND status != 'completed';
--   IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error',
--     'Round not found, already completed, or no permission.'); END IF;
-- (the pull this migration was built from, and the body of
-- supabase/migrations/<any prior submit_round_atomic migration>, share that
-- text -- there is no separate rollback file because CREATE OR REPLACE is
-- itself the rollback mechanism.)

CREATE OR REPLACE FUNCTION public.submit_round_atomic(
    p_round_id uuid,
    p_round_data jsonb,
    p_holes jsonb,
    p_shots jsonb,
    p_putt_details jsonb DEFAULT '[]'::jsonb,
    p_approach_details jsonb DEFAULT '[]'::jsonb
)
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

  UPDATE golf_rounds SET
    course_name = COALESCE(p_round_data->>'course_name', course_name),
    course_city = p_round_data->>'course_city',
    course_state = p_round_data->>'course_state',
    course_rating = CASE WHEN p_round_data->>'course_rating' IS NULL THEN NULL ELSE (p_round_data->>'course_rating')::NUMERIC END,
    course_slope = CASE WHEN p_round_data->>'course_slope' IS NULL THEN NULL ELSE (p_round_data->>'course_slope')::INT END,
    tees_played = p_round_data->>'tees_played',
    tee_id = CASE WHEN p_round_data->>'tee_id' IS NULL THEN NULL ELSE (p_round_data->>'tee_id')::uuid END,
    course_id = COALESCE((p_round_data->>'course_id')::uuid, course_id),
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
  WHERE id = p_round_id AND player_id = v_player_id;

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

      v_inserted_holes := v_inserted_holes || jsonb_build_object('hole_id', v_hole_id, 'hole_number', v_hole_number);
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

  PERFORM recalculate_round_strokes_gained(p_round_id);

  RETURN jsonb_build_object('success', true, 'round_id', p_round_id, 'warnings', v_warnings);
END;
$function$;

-- Definer-function hygiene: CREATE OR REPLACE preserves the existing ACL, but
-- re-assert it explicitly so this migration is safe standalone and the
-- function can never be left callable by anon.
REVOKE EXECUTE ON FUNCTION public.submit_round_atomic(
    uuid, jsonb, jsonb, jsonb, jsonb, jsonb
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_round_atomic(
    uuid, jsonb, jsonb, jsonb, jsonb, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.submit_round_atomic(
    uuid, jsonb, jsonb, jsonb, jsonb, jsonb
) IS
'Terminal round submit. Single-flight guard against a same-round auto-save or a'
' second submit: FOR UPDATE with a 3s SET LOCAL lock_timeout (not NOWAIT --'
' submit is a terminal action and the 35s client-abort fix already closed the'
' pile-up hole that made NOWAIT necessary for save_partial_round_atomic).'
' Returns {success:false, error:busy} on lock_not_available (55P03); ambient'
' lock_timeout is restored to 15s immediately after the guard.';
