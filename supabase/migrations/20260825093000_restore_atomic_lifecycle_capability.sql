-- The lifecycle test fixtures seed a completed historical row through the
-- same transaction-local `atomic` capability used by the protected submit
-- routine. Keep that capability's existing INSERT and UPDATE scope. The
-- preceding migration removed only its redundant identity re-check so the
-- routine can return a controlled no-permission result; it must not make a
-- trusted fixture or a future protected atomic insert fail at the trigger.

DO $$
DECLARE
  fn_definition text;
  restricted_capability text := E'AND current_setting(''helm.golf_lifecycle_write'', true) = ''atomic''\n    AND TG_OP = ''UPDATE'' THEN';
  restored_capability text :=
    'AND current_setting(''helm.golf_lifecycle_write'', true) = ''atomic'' THEN';
BEGIN
  SELECT pg_get_functiondef(
    'helm_private.guard_golf_round_lifecycle()'::regprocedure
  )
  INTO fn_definition;

  IF fn_definition IS NULL
    OR position(restricted_capability IN fn_definition) = 0 THEN
    RAISE EXCEPTION
      'guard_golf_round_lifecycle atomic capability shape changed; refusing unsafe rewrite';
  END IF;

  EXECUTE replace(fn_definition, restricted_capability, restored_capability);
END;
$$;
