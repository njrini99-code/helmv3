-- Open submission to a completed qualifier in the database, as the app already is.
--
-- Owner decision 2026-08-31 (memory/features/golf-round-lifecycle.md, "Submitting and STARTING a round in a completed
-- qualifier are open too"): a round may be started and submitted in a completed qualifier; what protects the standings
-- is entry, the round number within num_rounds and a free slot, all kept. 20260831180000 removed the refusal from
-- reclassify_golf_round and the app's guards went in the same change, but submit_round_atomic still refused:
-- a player who started a qualifier round and finished it after the coach closed the qualifier lost the submit with
-- "This qualifier has already been completed". Owner approved this fix 2026-10-31.
--
-- Removes that one IF block (and its comment) by anchored text replacement, as 20261001000000 does; refuses to run
-- unless the anchor occurs exactly once. Every other check is unchanged, including the started-round number guard
-- and the duplicate-slot guard that follow it. No table, row, grant or signature change.
--
-- ROLLBACK: supabase/rollbacks/20261031134708_submit_round_open_completed_qualifier.rollback.sql (live body verbatim,
--   read-only capture 2026-10-31, prosrc md5 dde64d4f093e39d0b96d6119adab4093).
--
-- VERIFY: select 1 from pg_proc where proname = 'submit_round_atomic'
-- VERIFY:   and position('This qualifier has already been completed' in prosrc) = 0
-- VERIFY:   and position('You have already submitted this qualifier round' in prosrc) > 0
-- VERIFY:   and position('expected_updated_at' in prosrc) > 0;

DO $$
DECLARE
  fn_definition TEXT;
  anchor CONSTANT TEXT := $anchor$  -- The action layer validates these conditions for a helpful UI error. Keep
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

$anchor$;
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

  occurrences := (length(fn_definition) - length(replace(fn_definition, anchor, ''))) / length(anchor);
  IF occurrences <> 1 THEN
    RAISE EXCEPTION 'submit_round_atomic completed-qualifier anchor found % times (expected 1); refusing unsafe patch', occurrences;
  END IF;

  EXECUTE replace(fn_definition, anchor, '');
END;
$$;

ALTER FUNCTION public.submit_round_atomic(
    uuid, jsonb, jsonb, jsonb, jsonb, jsonb
)
SET search_path TO 'public';
