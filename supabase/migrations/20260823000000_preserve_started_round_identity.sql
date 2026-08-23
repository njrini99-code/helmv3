-- A started round's qualifier identity is durable server state.  Submission
-- may be retried by an older browser build or recovered local snapshot whose
-- identity fields are absent or stale. The persisted qualifier link and round
-- type are authoritative; a browser may never clear, attach, or retarget them.
--
-- The action layer performs the same validation so it can show a useful error.
-- This database guard is intentionally independent: direct RPC callers and
-- future action paths cannot bypass the invariant.

DO $$
DECLARE
  fn_definition text;
  old_round_type text := 'round_type = COALESCE(p_round_data->>''round_type'', round_type)';
  old_qualifier_id text :=
    'qualifier_id = CASE WHEN p_round_data->>''qualifier_id'' = ''null'' '
    || 'OR p_round_data->>''qualifier_id'' IS NULL THEN NULL '
    || 'ELSE (p_round_data->>''qualifier_id'')::UUID END';
  old_qualifier_round_number text :=
    'qualifier_round_number = CASE WHEN p_round_data->>''qualifier_round_number'' '
    || 'IS NULL THEN NULL ELSE (p_round_data->>''qualifier_round_number'')::INT END';
  old_update_anchor text := '  UPDATE golf_rounds SET';
  new_round_type text :=
    'round_type = CASE WHEN qualifier_id IS NOT NULL THEN ''qualifier'' ELSE round_type END';
  new_qualifier_id text := 'qualifier_id = qualifier_id';
  new_qualifier_round_number text :=
    'qualifier_round_number = CASE WHEN qualifier_round_number IS NOT NULL '
    || 'THEN qualifier_round_number WHEN qualifier_id IS NOT NULL '
    || 'THEN CASE WHEN (p_round_data->>''qualifier_round_number'') '
    || '~ ''^[1-9][0-9]{0,8}$'' THEN (p_round_data->>''qualifier_round_number'')::INT END '
    || 'ELSE qualifier_round_number END';
  new_update_anchor text := $guard$
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

  UPDATE golf_rounds SET$guard$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO fn_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'submit_round_atomic'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_round_id uuid, p_round_data jsonb, p_holes jsonb, p_shots jsonb, '
      || 'p_putt_details jsonb, p_approach_details jsonb';

  IF fn_definition IS NULL THEN
    RAISE EXCEPTION 'submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) not found';
  END IF;
  IF position(old_round_type IN fn_definition) = 0
     OR position(old_qualifier_id IN fn_definition) = 0
     OR position(old_qualifier_round_number IN fn_definition) = 0
     OR position(old_update_anchor IN fn_definition) = 0 THEN
    RAISE EXCEPTION 'submit_round_atomic qualifier assignment shape changed; refusing unsafe identity patch';
  END IF;

  fn_definition := replace(fn_definition, old_round_type, new_round_type);
  fn_definition := replace(fn_definition, old_qualifier_id, new_qualifier_id);
  fn_definition := replace(fn_definition, old_qualifier_round_number, new_qualifier_round_number);
  fn_definition := replace(fn_definition, old_update_anchor, new_update_anchor);
  EXECUTE fn_definition;
END;
$$;

-- The dynamic rewrite preserves the function's existing configuration, and
-- this explicit setting keeps the SECURITY DEFINER boundary pinned even if a
-- future function definition omits it.
ALTER FUNCTION public.submit_round_atomic(
    uuid, jsonb, jsonb, jsonb, jsonb, jsonb
)
SET search_path TO 'public';

-- The terminal RPC and normal action path share this one qualifier-result
-- uniqueness contract. Existing historical duplicates block deployment for
-- explicit remediation instead of letting the migration choose a score to hide.
CREATE UNIQUE INDEX IF NOT EXISTS golf_rounds_qualifier_player_round_number_uq
ON public.golf_rounds (qualifier_id, player_id, qualifier_round_number)
WHERE qualifier_id IS NOT NULL
AND qualifier_round_number IS NOT NULL
AND status IS DISTINCT FROM 'abandoned';

COMMENT ON FUNCTION public.submit_round_atomic(
    uuid, jsonb, jsonb, jsonb, jsonb, jsonb
) IS
'Terminal round submit. A started round retains its persisted qualifier '
'link and type even if a stale client retry omits or changes identity '
'fields. A legacy missing qualifier round number may be filled only for '
'the same entered player, open configured qualifier, and an unused valid '
'round number.';
