-- A full round snapshot is the durability boundary for auto-save and submit.
-- It must be rejected before any delete/replace work if one of its shot groups
-- names a hole that does not exist in the accompanying hole snapshot.
--
-- Both existing RPCs were intentionally rebuilt from their live definitions
-- in prior incident migrations. Patch the current definitions defensively
-- rather than reviving an older copy, and fail the migration loudly if either
-- expected lifecycle anchor has changed.

DO $$
DECLARE
  v_function record;
  v_definition text;
  v_preflight text := $preflight$
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
$preflight$;
  v_missing_hole_fallback text := $fallback$
      IF v_hole_id IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'Round snapshot has a shot group without a persisted hole.',
          DETAIL = format('round_id=%s hole_number=%s', p_round_id, v_hole_number),
          HINT = 'Retry with a complete round snapshot.';
      END IF;
$fallback$;
  v_anchor text;
BEGIN
  FOR v_function IN
    SELECT p.oid, p.proname
    FROM pg_proc AS p
    WHERE p.oid IN (
      'public.save_partial_round_atomic(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz)'::regprocedure,
      'public.submit_round_atomic(uuid,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
    )
  LOOP
    v_definition := pg_get_functiondef(v_function.oid);
    v_anchor := CASE v_function.proname
      WHEN 'save_partial_round_atomic' THEN '  v_new_updated_at := NOW();'
      WHEN 'submit_round_atomic' THEN '  UPDATE golf_rounds SET'
    END;

    IF v_anchor IS NULL OR position(v_anchor IN v_definition) = 0 THEN
      RAISE EXCEPTION
        'Cannot safely add snapshot validation to %: expected lifecycle anchor is absent.',
        v_function.proname;
    END IF;

    IF position('Your round snapshot could not be verified.' IN v_definition) > 0 THEN
      RAISE EXCEPTION
        'Cannot safely add snapshot validation to %: guard already exists.',
        v_function.proname;
    END IF;

    IF position('      IF v_hole_id IS NULL THEN' || chr(10) || '        CONTINUE;' || chr(10) || '      END IF;' IN v_definition) = 0 THEN
      RAISE EXCEPTION
        'Cannot safely harden %: the unmatched-shot fallback has changed.',
        v_function.proname;
    END IF;

    v_definition := replace(
      v_definition,
      v_anchor,
      v_preflight || chr(10) || chr(10) || v_anchor
    );
    v_definition := replace(
      v_definition,
      '      IF v_hole_id IS NULL THEN' || chr(10) || '        CONTINUE;' || chr(10) || '      END IF;',
      v_missing_hole_fallback
    );

    EXECUTE v_definition;
  END LOOP;
END
$$;
