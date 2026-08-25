-- Flight-recorder storage must be private, service-role-only, and able to
-- represent a required step that never ran.  This is intentionally a schema
-- and privilege contract; rollback survival is proven by the local Docker
-- fault-injection test once HELM_TRACE log collection is available.

BEGIN;
\ir _helpers.sql

SELECT plan(12);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'helm_debug'),
  'helm_debug private schema exists'
);

SELECT ok(
  to_regclass('helm_debug.trace_runs') IS NOT NULL,
  'private trace_runs table exists'
);

SELECT ok(
  to_regclass('helm_debug.trace_steps') IS NOT NULL,
  'private trace_steps table exists'
);

SELECT isnt(
  has_table_privilege('anon', 'helm_debug.trace_runs', 'SELECT'),
  true,
  'anon cannot read private trace runs'
);

SELECT isnt(
  has_table_privilege('authenticated', 'helm_debug.trace_steps', 'SELECT'),
  true,
  'authenticated cannot read private trace steps'
);

SELECT isnt(
  has_function_privilege('anon', 'public.helm_debug_start_trace(uuid,text,text,jsonb)', 'EXECUTE'),
  true,
  'anon cannot start a debug trace'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.helm_debug_record_trace_step(uuid,text,text,text,text,jsonb)', 'EXECUTE'),
  true,
  'authenticated cannot write a debug trace step'
);

SELECT ok(
  has_function_privilege('service_role', 'public.helm_debug_finalize_trace(uuid,text,jsonb)', 'EXECUTE'),
  'service role can finalize a debug trace'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.helm_debug_get_trace(uuid)', 'EXECUTE'),
  true,
  'authenticated cannot read a debug trace through the facade'
);

SELECT ok(
  has_function_privilege('service_role', 'public.helm_debug_list_traces(integer,text,uuid)', 'EXECUTE'),
  'service role can list debug traces for the admin explorer'
);

SELECT ok(
  position('helm_private.trace_checkpoint' in pg_get_functiondef('public.submit_round_atomic(uuid,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure)) > 0,
  'submit_round_atomic emits rollback-proof HELM_TRACE checkpoints'
);

SELECT ok(
  position('helm_private.trace_checkpoint' in pg_get_functiondef('public.save_partial_round_atomic(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz)'::regprocedure)) > 0,
  'save_partial_round_atomic emits rollback-proof HELM_TRACE checkpoints'
);

SELECT * FROM finish();
ROLLBACK;
