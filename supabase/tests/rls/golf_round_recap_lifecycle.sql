BEGIN;

SELECT plan(8);

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

SELECT is(
  (SELECT p.prosecdef
   FROM pg_proc p
   WHERE p.oid = 'public.save_round_ai_recap(uuid, text)'::regprocedure),
  false,
  'the public recap endpoint remains SECURITY INVOKER'
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

SELECT * FROM finish();

ROLLBACK;
