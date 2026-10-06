-- UNAPPLIED DRAFT (swap audit C-6 / R-6). Not applied anywhere, not run
-- against a local stack, and nothing in the app sends the key yet. Owner
-- review, `npm run test:rls`, and a db-migration-reviewer pass come first.
--
-- submit_round_atomic has no optimistic lock. save_partial_round_atomic
-- refuses a write when the row moved past the caller's `p_expected_updated_at`
-- ('conflict'); the terminal submit only has the client's best-effort
-- `checkRoundStaleness`, which proceeds on any error. A stale device that
-- misses that check replaces another device's newer holes on submit.
--
-- This adds the same check inside the submit, read from
-- `p_round_data->>'expected_updated_at'` instead of a new parameter, so the
-- function signature (and every grant, comment and PostgREST route on it)
-- stays the same and an app build that sends the key is safe to ship before
-- or after this migration: an unknown jsonb key is ignored, and a missing key
-- skips the check. The check runs after the row lock the single-flight guard
-- already takes, so it is atomic with the write.
--
-- Same comparison as save_partial_round_atomic: conflict only when the row is
-- NEWER than the caller's token (`>`), never on equality.
--
-- The function body is patched by anchored text replacement, as
-- 20260823000000_preserve_started_round_identity.sql does; it refuses to run
-- if the anchor is not found exactly once.
--
-- ROLLBACK: apply the inverse anchored replacement (remove the
--   "Optimistic lock (swap audit C-6)" block); the key is then ignored again.
--
-- VERIFY: select 1 from pg_proc where proname = 'submit_round_atomic'
-- VERIFY:   and position('expected_updated_at' in prosrc) > 0;
--
-- App follow-up once applied (src/app/golf/actions/golf.ts submit path, both
-- engines): send `expected_updated_at` from lastServerUpdatedAtRef in
-- p_round_data, and treat `error = 'conflict'` like the save path does.

DO $$
DECLARE
  fn_definition TEXT;
  anchor CONSTANT TEXT := $anchor$    RETURN jsonb_build_object('success', false, 'error', 'Round not found, already completed, or no permission.');
  END IF;$anchor$;
  replacement CONSTANT TEXT := $replacement$    RETURN jsonb_build_object('success', false, 'error', 'Round not found, already completed, or no permission.');
  END IF;

  -- Optimistic lock (swap audit C-6): the caller's last acknowledged
  -- updated_at. The row is already locked above, so this read is current.
  IF NULLIF(p_round_data->>'expected_updated_at', '') IS NOT NULL
     AND (SELECT updated_at FROM golf_rounds WHERE id = p_round_id)
         > (p_round_data->>'expected_updated_at')::timestamptz THEN
    RETURN jsonb_build_object('success', false, 'error', 'conflict');
  END IF;$replacement$;
  occurrences INT;
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
  IF position('expected_updated_at' IN fn_definition) > 0 THEN
    RAISE EXCEPTION 'submit_round_atomic already reads expected_updated_at; refusing to patch twice';
  END IF;

  occurrences := (length(fn_definition) - length(replace(fn_definition, anchor, ''))) / length(anchor);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'submit_round_atomic lock-guard anchor found % times (expected 1); refusing unsafe patch', occurrences;
  END IF;

  EXECUTE replace(fn_definition, anchor, replacement);
END;
$$;

ALTER FUNCTION public.submit_round_atomic(
    uuid, jsonb, jsonb, jsonb, jsonb, jsonb
)
SET search_path TO 'public';
