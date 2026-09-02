-- Privilege-contract assertions for the Golf round-lifecycle RPC surface.
--
-- This suite enforces the standing definer discipline of this repository:
-- every SECURITY DEFINER function must carry
--   REVOKE EXECUTE ... FROM PUBLIC, anon;
-- and grant EXECUTE only to the roles the contract names. The assertions
-- below verify that discipline directly against the catalog.
--
-- WHY THIS SUITE EXISTS (2026-08-25, P1-10 prevention):
-- The recap-persist outage (Sentry JAVASCRIPT-NEXTJS-PT, fixed by
-- 20260825233000) passed local behavioral testing while failing for every
-- production caller: local Postgres permitted an invoker-wrapper privilege
-- path that production denied, despite matching PG 17.6 and matching ACL
-- text. Behavioral tests are therefore NOT sufficient evidence for grant
-- contracts in this repository. This suite asserts the contract at the
-- catalog level — "production contract requires X; the catalog says Y" —
-- which holds identically in any environment built from this chain.
--
-- Contract source: the live production catalog, read 2026-08-25 (schema
-- ACLs, pg_proc prosecdef/proconfig/proacl for every function below).
-- If this suite fails, the migration chain has drifted from the production
-- privilege contract — fix the chain, do not relax the test.

BEGIN;

SELECT plan(25);

-- ── helm_private stays closed ────────────────────────────────────────────

SELECT ok(
  NOT has_schema_privilege('authenticated', 'helm_private', 'USAGE'),
  'authenticated has no USAGE on helm_private'
);

SELECT ok(
  NOT has_schema_privilege('anon', 'helm_private', 'USAGE'),
  'anon has no USAGE on helm_private'
);

-- ── helm_private.save_round_ai_recap (protected implementation) ──────────

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p
   WHERE p.oid = 'helm_private.save_round_ai_recap(uuid, text, uuid)'::regprocedure),
  true,
  'the protected recap implementation runs with definer rights'
);

SELECT is(
  (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p
   WHERE p.oid = 'helm_private.save_round_ai_recap(uuid, text, uuid)'::regprocedure),
  'postgres',
  'the protected recap implementation is owned by postgres'
);

SELECT ok(
  NOT has_function_privilege('authenticated',
    'helm_private.save_round_ai_recap(uuid, text, uuid)', 'EXECUTE'),
  'authenticated cannot execute the protected recap implementation directly'
);

SELECT ok(
  NOT has_function_privilege('anon',
    'helm_private.save_round_ai_recap(uuid, text, uuid)', 'EXECUTE'),
  'anon cannot execute the protected recap implementation directly'
);

-- ── public.save_round_ai_recap wrapper ownership ─────────────────────────
-- (definer mode / search_path / role grants for the wrapper are asserted in
--  golf_round_recap_lifecycle.sql; ownership completes the contract)

SELECT is(
  (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p
   WHERE p.oid = 'public.save_round_ai_recap(uuid, text)'::regprocedure),
  'postgres',
  'the public recap wrapper is owned by postgres'
);

-- ── public.heartbeat ─────────────────────────────────────────────────────

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p
   WHERE p.oid = 'public.heartbeat()'::regprocedure),
  true,
  'heartbeat runs with definer rights'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.heartbeat()', 'EXECUTE'),
  'authenticated can execute heartbeat'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.heartbeat()', 'EXECUTE'),
  'anon cannot execute heartbeat (expired sessions must fail closed)'
);

SELECT ok(
  (SELECT EXISTS (
     SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
     WHERE p.oid = 'public.heartbeat()'::regprocedure
       AND c LIKE 'search_path=%')),
  'heartbeat pins its search_path'
);

-- ── public.submit_round_atomic ───────────────────────────────────────────

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p
   WHERE p.oid = 'public.submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)'::regprocedure),
  true,
  'submit_round_atomic runs with definer rights'
);

SELECT is(
  (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p
   WHERE p.oid = 'public.submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)'::regprocedure),
  'postgres',
  'submit_round_atomic is owned by postgres'
);

SELECT ok(
  has_function_privilege('authenticated',
    'public.submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)', 'EXECUTE'),
  'authenticated can execute submit_round_atomic'
);

SELECT ok(
  NOT has_function_privilege('anon',
    'public.submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)', 'EXECUTE'),
  'anon cannot execute submit_round_atomic'
);

SELECT ok(
  (SELECT EXISTS (
     SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
     WHERE p.oid = 'public.submit_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)'::regprocedure
       AND c LIKE 'search_path=%')),
  'submit_round_atomic pins its search_path'
);

-- ── public.save_partial_round_atomic ─────────────────────────────────────

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p
   WHERE p.oid = 'public.save_partial_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz)'::regprocedure),
  true,
  'save_partial_round_atomic runs with definer rights'
);

SELECT is(
  (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p
   WHERE p.oid = 'public.save_partial_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz)'::regprocedure),
  'postgres',
  'save_partial_round_atomic is owned by postgres'
);

SELECT ok(
  has_function_privilege('authenticated',
    'public.save_partial_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz)', 'EXECUTE'),
  'authenticated can execute save_partial_round_atomic'
);

SELECT ok(
  NOT has_function_privilege('anon',
    'public.save_partial_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz)', 'EXECUTE'),
  'anon cannot execute save_partial_round_atomic'
);

SELECT ok(
  (SELECT EXISTS (
     SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
     WHERE p.oid = 'public.save_partial_round_atomic(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz)'::regprocedure
       AND c LIKE 'search_path=%')),
  'save_partial_round_atomic pins its search_path'
);

-- ── lifecycle guard trigger function stays private ───────────────────────

SELECT ok(
  NOT has_function_privilege('authenticated',
    'helm_private.guard_golf_round_lifecycle()', 'EXECUTE'),
  'authenticated cannot execute the lifecycle guard trigger function directly'
);

SELECT ok(
  NOT has_function_privilege('anon',
    'helm_private.guard_golf_round_lifecycle()', 'EXECUTE'),
  'anon cannot execute the lifecycle guard trigger function directly'
);

-- ── surface-wide tripwires (production contract: both counts are ZERO) ───

SELECT is(
  (SELECT count(*)::int
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'no public definer function grants EXECUTE to anon'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef AND p.proacl IS NULL),
  0,
  'no public definer function is left on default (PUBLIC-executable) ACLs'
);

SELECT * FROM finish();

ROLLBACK;
