-- Contract for 20261007106000_helm_debug_record_trace_steps_batch.sql.
-- The batch function must leave exactly the rows that the same steps recorded
-- one at a time through helm_debug_record_trace_step leave, in one call, and
-- must stay service_role only.

BEGIN;
\ir _helpers.sql

SELECT plan(12);

SELECT ok(
  has_function_privilege('service_role', 'public.helm_debug_record_trace_steps(uuid,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.helm_debug_record_trace_steps(uuid,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.helm_debug_record_trace_steps(uuid,jsonb)', 'EXECUTE'),
  'the batch recorder is executable by service_role only'
);

-- Trace A: three steps through the per-step function. Trace B: the same steps
-- through the batch function, including a second write to one step_key.
SELECT public.helm_debug_start_trace('00000000-0000-0000-0000-00000000f301', 'golf.round.submit', 'test', '{}'::jsonb);
SELECT public.helm_debug_start_trace('00000000-0000-0000-0000-00000000f302', 'golf.round.submit', 'test', '{}'::jsonb);

SELECT public.helm_debug_record_trace_step('00000000-0000-0000-0000-00000000f301', 'server.auth', 'server_action', 'started', 'required', '{"category":"auth"}'::jsonb);
SELECT public.helm_debug_record_trace_step('00000000-0000-0000-0000-00000000f301', 'server.auth', 'server_action', 'success', 'required', '{"duration_ms":12}'::jsonb);
SELECT public.helm_debug_record_trace_step('00000000-0000-0000-0000-00000000f301', 'db.submit', 'postgres', 'failure', 'required', '{"error_code":"23503","error_summary":"fk","table_name":"golf_rounds","expected":{"a":1},"observed":{"a":2}}'::jsonb);
SELECT public.helm_debug_record_trace_step('00000000-0000-0000-0000-00000000f301', 'verify.round', 'verification', 'skipped', 'best_effort', '{"parent_step_key":"db.submit"}'::jsonb);

SELECT is(
  public.helm_debug_record_trace_steps(
    '00000000-0000-0000-0000-00000000f302',
    '[
      {"step_key":"server.auth","layer":"server_action","status":"started","requiredness":"required","metadata":{"category":"auth"}},
      {"step_key":"server.auth","layer":"server_action","status":"success","requiredness":"required","metadata":{"duration_ms":12}},
      {"step_key":"db.submit","layer":"postgres","status":"failure","requiredness":"required","metadata":{"error_code":"23503","error_summary":"fk","table_name":"golf_rounds","expected":{"a":1},"observed":{"a":2}}},
      {"step_key":"verify.round","layer":"verification","status":"skipped","requiredness":"best_effort","metadata":{"parent_step_key":"db.submit"}}
    ]'::jsonb),
  4,
  'the batch call reports the number of steps it wrote'
);

CREATE TEMP TABLE cols AS
SELECT trace_id, step_key, parent_step_key, layer, category, status, requiredness,
       (finished_at IS NOT NULL) AS finished, duration_ms, table_name, function_name,
       trigger_name, error_code, error_summary, expected, observed, metadata
FROM helm_debug.trace_steps
WHERE trace_id IN ('00000000-0000-0000-0000-00000000f301', '00000000-0000-0000-0000-00000000f302');

SELECT is(
  (SELECT count(*)::int FROM cols WHERE trace_id = '00000000-0000-0000-0000-00000000f302'),
  3,
  'batch wrote three distinct steps (the repeated key was upserted, not duplicated)'
);

SELECT is_empty(
  $$SELECT step_key, parent_step_key, layer, category, status, requiredness, finished, duration_ms,
           table_name, function_name, trigger_name, error_code, error_summary, expected, observed, metadata
    FROM cols WHERE trace_id = '00000000-0000-0000-0000-00000000f301'
    EXCEPT
    SELECT step_key, parent_step_key, layer, category, status, requiredness, finished, duration_ms,
           table_name, function_name, trigger_name, error_code, error_summary, expected, observed, metadata
    FROM cols WHERE trace_id = '00000000-0000-0000-0000-00000000f302'$$,
  'every batch row equals the row the per-step function produced'
);

SELECT is_empty(
  $$SELECT step_key, parent_step_key, layer, category, status, requiredness, finished, duration_ms,
           table_name, function_name, trigger_name, error_code, error_summary, expected, observed, metadata
    FROM cols WHERE trace_id = '00000000-0000-0000-0000-00000000f302'
    EXCEPT
    SELECT step_key, parent_step_key, layer, category, status, requiredness, finished, duration_ms,
           table_name, function_name, trigger_name, error_code, error_summary, expected, observed, metadata
    FROM cols WHERE trace_id = '00000000-0000-0000-0000-00000000f301'$$,
  'and the per-step function produced no row the batch lacks'
);

SELECT is(
  (SELECT observed_step_count FROM helm_debug.trace_runs WHERE trace_id = '00000000-0000-0000-0000-00000000f302'),
  3,
  'observed_step_count is recounted once and is correct'
);

SELECT throws_ok(
  $$SELECT public.helm_debug_record_trace_steps('00000000-0000-0000-0000-00000000f302', '{"step_key":"x"}'::jsonb)$$,
  '22023', NULL,
  'a non-array argument is rejected'
);

SELECT throws_ok(
  $$SELECT public.helm_debug_record_trace_steps(
      '00000000-0000-0000-0000-00000000f302',
      (SELECT jsonb_agg(jsonb_build_object('step_key','s'||g,'layer','next','status','success','requiredness','best_effort','metadata','{}'::jsonb))
       FROM generate_series(1, 101) g))$$,
  '22023', NULL,
  'more than 100 steps in one call is rejected'
);

-- Timing: a step the app buffered carries the age it had when the batch was
-- sent, and the stamps are backdated by it, so the tracer still sees a real
-- elapsed time between start and complete.
SELECT public.helm_debug_start_trace('00000000-0000-0000-0000-00000000f303', 'golf.round.submit', 'test', '{}'::jsonb);
SELECT public.helm_debug_record_trace_steps(
  '00000000-0000-0000-0000-00000000f303',
  '[
    {"step_key":"server.auth","layer":"server_action","status":"started","requiredness":"required","metadata":{},"age_ms":500},
    {"step_key":"server.auth","layer":"server_action","status":"success","requiredness":"required","metadata":{},"age_ms":100},
    {"step_key":"db.submit","layer":"postgres","status":"started","requiredness":"required","metadata":{},"age_ms":99999999}
  ]'::jsonb);

SELECT ok(
  (SELECT extract(epoch FROM (finished_at - started_at)) * 1000 BETWEEN 390 AND 410
   FROM helm_debug.trace_steps
   WHERE trace_id = '00000000-0000-0000-0000-00000000f303' AND step_key = 'server.auth'),
  'a buffered start and complete keep a real 400 ms elapsed time (finished_at - started_at)'
);

SELECT ok(
  (SELECT finished_at IS NULL FROM helm_debug.trace_steps
   WHERE trace_id = '00000000-0000-0000-0000-00000000f303' AND step_key = 'db.submit'),
  'a started step gets no finished_at'
);

SELECT ok(
  (SELECT extract(epoch FROM (clock_timestamp() - started_at)) BETWEEN 590 AND 610
   FROM helm_debug.trace_steps
   WHERE trace_id = '00000000-0000-0000-0000-00000000f303' AND step_key = 'db.submit'),
  'an absurd age_ms is clamped to ten minutes'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.helm_debug_record_trace_steps('00000000-0000-0000-0000-00000000f302', '[]'::jsonb)$$,
  '42501', NULL,
  'authenticated cannot call the batch recorder'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
