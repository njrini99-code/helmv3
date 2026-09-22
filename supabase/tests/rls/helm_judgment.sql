-- Judgment-layer storage must be private, service-role-only, and reject
-- dispositions/use cases outside the contract in src/lib/ai/judgment/types.ts.

BEGIN;
\ir _helpers.sql

SELECT plan(12);

SELECT ok(
  to_regclass('helm_debug.judgment_evaluations') IS NOT NULL,
  'private judgment_evaluations table exists'
);

SELECT ok(
  to_regclass('helm_debug.judgment_labels') IS NOT NULL,
  'private judgment_labels table exists'
);

SELECT isnt(
  has_table_privilege('anon', 'helm_debug.judgment_evaluations', 'SELECT'),
  true,
  'anon cannot read judgment evaluations'
);

SELECT isnt(
  has_table_privilege('authenticated', 'helm_debug.judgment_labels', 'SELECT'),
  true,
  'authenticated cannot read judgment labels'
);

SELECT isnt(
  has_function_privilege('anon', 'public.helm_debug_record_judgment(jsonb)', 'EXECUTE'),
  true,
  'anon cannot record a judgment'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.helm_debug_list_judgments(integer,text,text,timestamptz)', 'EXECUTE'),
  true,
  'authenticated cannot list judgments'
);

SELECT ok(
  has_function_privilege('service_role', 'public.helm_debug_record_judgment(jsonb)', 'EXECUTE'),
  'service role can record a judgment'
);

SELECT ok(
  has_function_privilege('service_role', 'public.helm_debug_prune_judgments()', 'EXECUTE'),
  'service role can prune judgments'
);

-- Round trip through the facades as the owner (pgTAP runs as postgres).
SELECT lives_ok(
  $$ SELECT public.helm_debug_record_judgment(jsonb_build_object(
       'use_case', 'shot_trace', 'evaluator_version', 'shot-trace:v1',
       'policy_version', 'shot-trace-policy:v1', 'environment', 'test',
       'mode', 'shadow', 'entity_type', 'trace', 'entity_key_hash', 'abc',
       'state_hash', repeat('0', 64), 'evidence_summary', '{"steps": 5}'::jsonb,
       'answers', '{"silent_failure_likely": {"kind": "noul", "p": 0.1}}'::jsonb,
       'disposition', 'pass', 'reason_codes', '["clean"]'::jsonb, 'duration_ms', 210)) $$,
  'record facade accepts a contract-shaped row'
);

SELECT throws_ok(
  $$ SELECT public.helm_debug_record_judgment(jsonb_build_object(
       'use_case', 'not_a_use_case', 'evaluator_version', 'x', 'policy_version', 'x',
       'environment', 'test', 'mode', 'shadow', 'entity_type', 'trace',
       'state_hash', '', 'disposition', 'pass')) $$,
  '23514',
  NULL,
  'record facade rejects an unknown use case'
);

SELECT throws_ok(
  $$ SELECT public.helm_debug_record_judgment(jsonb_build_object(
       'use_case', 'shot_trace', 'evaluator_version', 'x', 'policy_version', 'x',
       'environment', 'test', 'mode', 'shadow', 'entity_type', 'trace',
       'state_hash', '', 'disposition', 'healthy')) $$,
  '23514',
  NULL,
  'record facade rejects a disposition outside the contract'
);

SELECT is(
  jsonb_array_length(public.helm_debug_list_judgments(10, 'shot_trace', NULL, NULL)),
  1,
  'list facade returns the recorded evaluation'
);

SELECT * FROM finish();
ROLLBACK;
