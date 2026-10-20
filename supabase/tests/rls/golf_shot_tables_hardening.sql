-- pgTAP contracts for 20261005120000_golf_shot_tables_hardening.sql.
--
-- A. calculate_round_strokes_gained(uuid) and recompute_golf_round_totals(uuid)
--    are SECURITY DEFINER with no ownership check. Their only legitimate
--    callers are postgres-owned SECURITY DEFINER code (the golf_holes totals
--    trigger) and service_role, so no client role may execute them directly.
-- B. anon holds no privilege of any kind on the six golf round/shot tables,
--    while authenticated keeps SELECT (the app reads them as the user).
-- C. The two prefix-redundant golf_shots indexes are gone and the unique
--    index that covers their lookups is still there.
--
-- If any assertion here fails, a later migration has re-opened a cross-team
-- read/write surface on golf round data. Treat as P1.

BEGIN;
\ir _helpers.sql

SELECT plan(28);

-- ============================================================================
-- A. Direct EXECUTE on the two SECURITY DEFINER golf functions
-- ============================================================================

SELECT isnt(
  has_function_privilege('authenticated', 'public.calculate_round_strokes_gained(uuid)', 'EXECUTE'),
  true,
  'authenticated cannot execute calculate_round_strokes_gained (no ownership check inside)'
);
SELECT isnt(
  has_function_privilege('anon', 'public.calculate_round_strokes_gained(uuid)', 'EXECUTE'),
  true,
  'anon cannot execute calculate_round_strokes_gained'
);
SELECT ok(
  has_function_privilege('service_role', 'public.calculate_round_strokes_gained(uuid)', 'EXECUTE'),
  'service_role keeps EXECUTE on calculate_round_strokes_gained'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.recompute_golf_round_totals(uuid)', 'EXECUTE'),
  true,
  'authenticated cannot execute recompute_golf_round_totals (no ownership check inside)'
);
SELECT isnt(
  has_function_privilege('anon', 'public.recompute_golf_round_totals(uuid)', 'EXECUTE'),
  true,
  'anon cannot execute recompute_golf_round_totals'
);
SELECT ok(
  has_function_privilege('service_role', 'public.recompute_golf_round_totals(uuid)', 'EXECUTE'),
  'service_role keeps EXECUTE on recompute_golf_round_totals'
);

-- The trigger path keeps working without a client grant: the trigger
-- function is SECURITY DEFINER and owned by the same role that owns
-- recompute_golf_round_totals, so the nested call runs as that owner.
SELECT is(
  (SELECT pg_get_userbyid(proowner) FROM pg_proc
    WHERE oid = 'public.golf_holes_recompute_round_totals_fn()'::regprocedure),
  (SELECT pg_get_userbyid(proowner) FROM pg_proc
    WHERE oid = 'public.recompute_golf_round_totals(uuid)'::regprocedure),
  'golf_holes trigger function and recompute_golf_round_totals share an owner'
);
SELECT ok(
  (SELECT prosecdef FROM pg_proc
    WHERE oid = 'public.golf_holes_recompute_round_totals_fn()'::regprocedure),
  'golf_holes_recompute_round_totals_fn is SECURITY DEFINER (nested call needs no client grant)'
);

-- Behavioural: a signed-in user calling either RPC on any round id is refused
-- with insufficient_privilege before the body runs.
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.calculate_round_strokes_gained('00000000-0000-0000-0000-0000000c0de1'::uuid)$$,
  '42501',
  NULL,
  'authenticated is refused when calling calculate_round_strokes_gained'
);
SELECT throws_ok(
  $$SELECT public.recompute_golf_round_totals('00000000-0000-0000-0000-0000000c0de1'::uuid)$$,
  '42501',
  NULL,
  'authenticated is refused when calling recompute_golf_round_totals'
);
RESET ROLE;

-- ============================================================================
-- B. anon has no privilege on the six golf round/shot tables
-- ============================================================================

SELECT isnt(
  has_table_privilege('anon', 'public.golf_rounds',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
  true, 'anon has no privilege on golf_rounds'
);
SELECT isnt(
  has_table_privilege('anon', 'public.golf_holes',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
  true, 'anon has no privilege on golf_holes'
);
SELECT isnt(
  has_table_privilege('anon', 'public.golf_shots',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
  true, 'anon has no privilege on golf_shots'
);
SELECT isnt(
  has_table_privilege('anon', 'public.putt_details',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
  true, 'anon has no privilege on putt_details'
);
SELECT isnt(
  has_table_privilege('anon', 'public.approach_miss_details',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
  true, 'anon has no privilege on approach_miss_details'
);
SELECT isnt(
  has_table_privilege('anon', 'public.golf_player_stats_cache',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
  true, 'anon has no privilege on golf_player_stats_cache'
);
SELECT is(
  (SELECT count(*)::int FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND grantee = 'anon'
      AND table_name IN ('golf_rounds', 'golf_holes', 'golf_shots', 'putt_details',
                         'approach_miss_details', 'golf_player_stats_cache')),
  0,
  'anon has no column-level privilege on the six golf round/shot tables'
);

-- Regression half: the signed-in app path still reads these tables.
SELECT ok(has_table_privilege('authenticated', 'public.golf_rounds', 'SELECT'),
  'authenticated keeps SELECT on golf_rounds');
SELECT ok(has_table_privilege('authenticated', 'public.golf_holes', 'SELECT'),
  'authenticated keeps SELECT on golf_holes');
SELECT ok(has_table_privilege('authenticated', 'public.golf_shots', 'SELECT'),
  'authenticated keeps SELECT on golf_shots');
SELECT ok(has_table_privilege('authenticated', 'public.putt_details', 'SELECT'),
  'authenticated keeps SELECT on putt_details');
SELECT ok(has_table_privilege('authenticated', 'public.approach_miss_details', 'SELECT'),
  'authenticated keeps SELECT on approach_miss_details');
SELECT ok(has_table_privilege('authenticated', 'public.golf_player_stats_cache', 'SELECT'),
  'authenticated keeps SELECT on golf_player_stats_cache');

-- Behavioural: a signed-out caller is refused outright, not served zero rows.
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT 1 FROM public.golf_shots LIMIT 1$$,
  '42501',
  NULL,
  'anon SELECT on golf_shots is refused'
);
SELECT throws_ok(
  $$TRUNCATE public.golf_player_stats_cache$$,
  '42501',
  NULL,
  'anon TRUNCATE on golf_player_stats_cache is refused (TRUNCATE bypasses RLS)'
);
RESET ROLE;

-- ============================================================================
-- C. golf_shots prefix-redundant indexes dropped, covering unique index kept
-- ============================================================================

SELECT hasnt_index('public', 'golf_shots', 'idx_golf_shots_round_id',
  'idx_golf_shots_round_id (prefix of idx_golf_shots_round_hole_shot) is dropped');
SELECT hasnt_index('public', 'golf_shots', 'idx_golf_shots_round_hole',
  'idx_golf_shots_round_hole (prefix of idx_golf_shots_round_hole_shot) is dropped');
SELECT has_index('public', 'golf_shots', 'idx_golf_shots_round_hole_shot',
  ARRAY['round_id', 'hole_number', 'shot_number'],
  'unique (round_id, hole_number, shot_number) index still serves round/hole lookups');

SELECT * FROM finish();
ROLLBACK;
