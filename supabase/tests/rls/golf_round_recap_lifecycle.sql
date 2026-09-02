BEGIN;

SELECT plan(10);

SELECT ok(
  has_function_privilege('authenticated', 'public.save_round_ai_recap(uuid, text)', 'EXECUTE'),
  'authenticated players and coaches may request a recap write'
);

SELECT isnt(
  has_function_privilege('anon', 'public.save_round_ai_recap(uuid, text)', 'EXECUTE'),
  true,
  'anonymous callers cannot request a recap write'
);

SELECT isnt(
  has_function_privilege('public', 'public.save_round_ai_recap(uuid, text)', 'EXECUTE'),
  true,
  'the recap endpoint is not granted to PUBLIC'
);

-- Regression (Sentry JAVASCRIPT-NEXTJS-PT): the wrapper MUST run with definer
-- rights (prosecdef = true). helm_private grants no USAGE to authenticated,
-- so an invoker wrapper fails the schema hop with 42501 for every real
-- caller. The earlier version of this suite asserted the opposite and
-- enshrined the bug.
SELECT is(
  (SELECT p.prosecdef
   FROM pg_proc p
   WHERE p.oid = 'public.save_round_ai_recap(uuid, text)'::regprocedure),
  true,
  'the public recap endpoint is a definer boundary into helm_private'
);

SELECT ok(
  (SELECT 'search_path=public, pg_temp' = ANY (p.proconfig)
   FROM pg_proc p
   WHERE p.oid = 'public.save_round_ai_recap(uuid, text)'::regprocedure),
  'the public recap endpoint pins a safe search path'
);

SELECT is(
  (SELECT p.prosecdef
   FROM pg_proc p
   WHERE p.oid = 'helm_private.save_round_ai_recap(uuid, text, uuid)'::regprocedure),
  true,
  'the protected implementation is SECURITY DEFINER in the private schema'
);

SELECT ok(
  (SELECT 'search_path=public, pg_temp' = ANY (p.proconfig)
   FROM pg_proc p
   WHERE p.oid = 'helm_private.save_round_ai_recap(uuid, text, uuid)'::regprocedure),
  'the protected implementation pins a safe search path'
);

SELECT ok(
  position('round_recap' IN pg_get_functiondef('helm_private.guard_golf_round_lifecycle()'::regprocedure)) > 0,
  'the lifecycle guard permits only the explicit recap capability'
);

SELECT ok(
  position('verify_coach_owns_player' IN pg_get_functiondef('helm_private.save_round_ai_recap(uuid, text, uuid)'::regprocedure)) > 0,
  'the protected implementation verifies player or coach access before writing'
);

-- Call-path regression: actually invoke the endpoint as the authenticated
-- role. With no JWT claims, auth.uid() is NULL, so reaching the private
-- implementation yields its own "Sign in" rejection. Under the broken invoker
-- wrapper this instead failed earlier with "permission denied for schema
-- helm_private" — catalog assertions alone never exercised the hop.
SET ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.save_round_ai_recap(
      '00000000-0000-0000-0000-000000000000'::uuid, repeat('x', 40))$$,
  '42501',
  'Sign in to save a round recap.',
  'an authenticated caller reaches the private implementation instead of dying at the schema boundary'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
