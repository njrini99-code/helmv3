BEGIN;
SELECT plan(4);

-- Presence heartbeats are authenticated-only. The browser hook confirms the
-- session before calling this RPC, so anon execution is unnecessary attack
-- surface; authenticated execution is required for a signed-in dashboard.
SELECT ok(
  has_function_privilege('authenticated', 'public.heartbeat()', 'EXECUTE'),
  'authenticated users can execute heartbeat'
);
SELECT isnt(
  has_function_privilege('anon', 'public.heartbeat()', 'EXECUTE'),
  true,
  'anonymous visitors cannot execute heartbeat'
);

-- Completed-round recap writes pass through a capability-scoped RPC. Keep the
-- public endpoint available to a signed-in player or coach, never anon.
SELECT ok(
  has_function_privilege('authenticated', 'public.save_round_ai_recap(uuid, text)', 'EXECUTE'),
  'authenticated users can save a permitted round recap'
);
SELECT isnt(
  has_function_privilege('anon', 'public.save_round_ai_recap(uuid, text)', 'EXECUTE'),
  true,
  'anonymous visitors cannot execute the recap writer'
);

SELECT * FROM finish();
ROLLBACK;
