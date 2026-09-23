BEGIN;

SELECT plan(30);

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

-- Package 8 (revision-keyed provenance + single-flight, 2026-09-23):
-- the cheap single-flight guard and the new provenance table.

SELECT ok(
  position('ai_recap IS NULL' IN pg_get_functiondef('helm_private.save_round_ai_recap(uuid, text, uuid)'::regprocedure)) > 0,
  'a concurrent call that lost the single-flight race updates zero rows instead of overwriting the winner'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_round_recap_provenance'::regclass),
  'golf_round_recap_provenance has row level security enabled'
);

SELECT isnt(
  has_table_privilege('anon', 'public.golf_round_recap_provenance', 'SELECT'),
  true,
  'anonymous callers cannot read recap provenance'
);

SELECT isnt(
  has_table_privilege('public', 'public.golf_round_recap_provenance', 'SELECT'),
  true,
  'recap provenance is not granted to PUBLIC'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.golf_round_recap_provenance', 'SELECT'),
  'authenticated players/coaches may read recap provenance (subject to RLS policy)'
);

SELECT isnt(
  has_table_privilege('authenticated', 'public.golf_round_recap_provenance', 'INSERT'),
  true,
  'only the service role writes recap provenance, never an authenticated client'
);

SELECT ok(
  has_table_privilege('service_role', 'public.golf_round_recap_provenance', 'INSERT'),
  'the service role (round-recap.ts admin client) can write recap provenance'
);

-- Package 8 (2026-09-23, migration 20260923100000): the tighter half of
-- single-flight — golf_round_recap_locks and its two claim/release
-- functions. Zero authenticated access at all (unlike provenance, which
-- authenticated may read): this table is purely an internal lease,
-- written and read only through the two functions below, by round-recap.ts's
-- service-role admin client.

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_round_recap_locks'::regclass),
  'golf_round_recap_locks has row level security enabled'
);

SELECT isnt(
  has_table_privilege('anon', 'public.golf_round_recap_locks', 'SELECT'),
  true,
  'anonymous callers cannot read the recap lock table'
);

SELECT isnt(
  has_table_privilege('public', 'public.golf_round_recap_locks', 'SELECT'),
  true,
  'the recap lock table is not granted to PUBLIC'
);

SELECT isnt(
  has_table_privilege('authenticated', 'public.golf_round_recap_locks', 'SELECT'),
  true,
  'authenticated callers cannot read the recap lock table — it has no user-facing purpose'
);

SELECT ok(
  has_table_privilege('service_role', 'public.golf_round_recap_locks', 'SELECT'),
  'the service role (round-recap.ts admin client) can read the recap lock table'
);

SELECT isnt(
  has_function_privilege('anon', 'public.claim_round_recap_lock(uuid, integer, integer)', 'EXECUTE'),
  true,
  'anonymous callers cannot claim a recap lock'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.claim_round_recap_lock(uuid, integer, integer)', 'EXECUTE'),
  true,
  'authenticated callers cannot claim a recap lock directly — only the service role coordinates this'
);

SELECT ok(
  has_function_privilege('service_role', 'public.claim_round_recap_lock(uuid, integer, integer)', 'EXECUTE'),
  'the service role (round-recap.ts admin client) can claim a recap lock'
);

SELECT isnt(
  has_function_privilege('anon', 'public.release_round_recap_lock(uuid, integer, uuid)', 'EXECUTE'),
  true,
  'anonymous callers cannot release a recap lock'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.release_round_recap_lock(uuid, integer, uuid)', 'EXECUTE'),
  true,
  'authenticated callers cannot release a recap lock directly'
);

SELECT ok(
  has_function_privilege('service_role', 'public.release_round_recap_lock(uuid, integer, uuid)', 'EXECUTE'),
  'the service role (round-recap.ts admin client) can release a recap lock'
);

SELECT ok(
  position('WHERE l.expires_at < now()' IN pg_get_functiondef('public.claim_round_recap_lock(uuid, integer, integer)'::regprocedure)) > 0,
  'claim_round_recap_lock only reclaims an EXPIRED lock, never a live one'
);

SELECT ok(
  position('holder_token = p_holder_token' IN pg_get_functiondef('public.release_round_recap_lock(uuid, integer, uuid)'::regprocedure)) > 0,
  'release_round_recap_lock only deletes a row it can prove it still owns'
);

SELECT * FROM finish();

ROLLBACK;
