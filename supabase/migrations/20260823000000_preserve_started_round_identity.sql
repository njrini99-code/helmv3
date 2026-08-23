-- A started round's qualifier identity is durable server state.  Submission
-- may be retried by an older browser build or recovered local snapshot whose
-- qualifier fields are absent or stale; neither situation may clear or change
-- the qualifier_id / qualifier_round_number that was saved at round start.
--
-- The action layer performs the same validation so it can show a useful error.
-- This database guard is intentionally independent: direct RPC callers and
-- future action paths cannot bypass the invariant.

DO $$
DECLARE
  fn_definition text;
  old_qualifier_id text := 'qualifier_id = CASE WHEN p_round_data->>''qualifier_id'' = ''null'' OR p_round_data->>''qualifier_id'' IS NULL THEN NULL ELSE (p_round_data->>''qualifier_id'')::UUID END';
  old_qualifier_round_number text := 'qualifier_round_number = CASE WHEN p_round_data->>''qualifier_round_number'' IS NULL THEN NULL ELSE (p_round_data->>''qualifier_round_number'')::INT END';
  new_qualifier_id text := 'qualifier_id = COALESCE(qualifier_id, CASE WHEN p_round_data->>''qualifier_id'' = ''null'' OR p_round_data->>''qualifier_id'' IS NULL THEN NULL ELSE (p_round_data->>''qualifier_id'')::UUID END)';
  new_qualifier_round_number text := 'qualifier_round_number = COALESCE(qualifier_round_number, CASE WHEN p_round_data->>''qualifier_round_number'' IS NULL THEN NULL ELSE (p_round_data->>''qualifier_round_number'')::INT END)';
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO fn_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'submit_round_atomic'
    AND pg_get_function_identity_arguments(p.oid) = 'p_round_id uuid, p_round_data jsonb, p_holes jsonb, p_shots jsonb, p_putt_details jsonb, p_approach_details jsonb';

  IF fn_definition IS NULL THEN
    RAISE EXCEPTION 'submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) not found';
  END IF;
  IF position(old_qualifier_id IN fn_definition) = 0
     OR position(old_qualifier_round_number IN fn_definition) = 0 THEN
    RAISE EXCEPTION 'submit_round_atomic qualifier assignment shape changed; refusing unsafe identity patch';
  END IF;

  fn_definition := replace(fn_definition, old_qualifier_id, new_qualifier_id);
  fn_definition := replace(fn_definition, old_qualifier_round_number, new_qualifier_round_number);
  EXECUTE fn_definition;
END;
$$;

COMMENT ON FUNCTION public.submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) IS
'Terminal round submit. A started round retains its persisted qualifier identity even if a stale client retry omits or changes qualifier fields.';
