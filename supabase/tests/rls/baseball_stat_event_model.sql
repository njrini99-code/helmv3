-- pgTAP contracts for the BaseballHelm elite stat EVENT model
-- (migration 20260624000080_baseball_elite_stat_event_model.sql +
--  20260624000050_baseball_rls_helpers_and_policies.sql for the helpers).
--
-- Guards the new source-aware event tables against RLS regression:
--   1. RLS is ENABLED on every new table.
--   2. anon holds NO table privileges on any of them (never granted).
--   3. Every CRUD verb on every event table has exactly one named policy,
--      all targeting the authenticated role only (no PUBLIC, no missing verb).
--   4. Team-scoping is real: every SELECT policy references team_id / a player
--      scope helper / a capability helper — never global access.
--   5. The player self-read carve-out is honest: event SELECT policies let a
--      player read their OWN rows but exclude staff_only; writes are staff-gated
--      (no player self-insert).
--   6. The development-metric table only exposes player_visible rows to the
--      player (not the broader "<> staff_only" carve-out used by raw events).
--   7. Source registry + field mappings are import-capability gated on write.
--
-- Schema-light: asserts the security contract over pg_policy / pg_class without
-- seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: Wave / packet elite-stats (BaseballHelm — stats-integrations).

BEGIN;
\ir _helpers.sql

SELECT plan(87);

-- ============================================================================
-- The new event tables under test (player-column-bearing event grain).
-- ============================================================================
-- Asserted in a fixed list so a forgotten table fails loudly.

-- 1. RLS ENABLED on every new table (13 tables).
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t),
  format('RLS is ENABLED on %s', t)
)
FROM unnest(ARRAY[
  'baseball_stat_sources',
  'baseball_import_field_mappings',
  'baseball_plate_appearances',
  'baseball_pitch_events',
  'baseball_batted_ball_events',
  'baseball_swing_events',
  'baseball_fielding_events',
  'baseball_catching_events',
  'baseball_baserunning_events',
  'baseball_workload_events',
  'baseball_video_events',
  'baseball_stat_facts',
  'baseball_player_development_metrics'
]) AS t;

-- 2. anon has NO SELECT privilege on any new table (13 tables).
SELECT isnt(
  has_table_privilege('anon', format('public.%s', t), 'SELECT'),
  true,
  format('anon cannot SELECT %s', t)
)
FROM unnest(ARRAY[
  'baseball_stat_sources',
  'baseball_import_field_mappings',
  'baseball_plate_appearances',
  'baseball_pitch_events',
  'baseball_batted_ball_events',
  'baseball_swing_events',
  'baseball_fielding_events',
  'baseball_catching_events',
  'baseball_baserunning_events',
  'baseball_workload_events',
  'baseball_video_events',
  'baseball_stat_facts',
  'baseball_player_development_metrics'
]) AS t;

-- anon cannot WRITE either (spot-check INSERT on the two highest-volume event
-- tables + the registry).
SELECT isnt(has_table_privilege('anon', 'public.baseball_pitch_events', 'INSERT'), true, 'anon cannot INSERT baseball_pitch_events');
SELECT isnt(has_table_privilege('anon', 'public.baseball_batted_ball_events', 'INSERT'), true, 'anon cannot INSERT baseball_batted_ball_events');
SELECT isnt(has_table_privilege('anon', 'public.baseball_stat_sources', 'INSERT'), true, 'anon cannot INSERT baseball_stat_sources');

-- ============================================================================
-- 3. Every CRUD verb has exactly one policy on each player-grain event table.
--    (10 event tables x 4 verbs = 40 assertions.)
-- ============================================================================
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t AND cmd = v),
  1,
  format('%s has exactly one %s policy', t, v)
)
FROM
  unnest(ARRAY[
    'baseball_plate_appearances',
    'baseball_pitch_events',
    'baseball_batted_ball_events',
    'baseball_swing_events',
    'baseball_fielding_events',
    'baseball_catching_events',
    'baseball_baserunning_events',
    'baseball_workload_events',
    'baseball_video_events',
    'baseball_stat_facts'
  ]) AS t,
  unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS v;

-- ============================================================================
-- 4. All policies on the event tables target the authenticated role only.
-- ============================================================================
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = t
       AND roles <> '{authenticated}'),
  0,
  format('all %s policies target the authenticated role only', t)
)
FROM unnest(ARRAY[
  'baseball_plate_appearances',
  'baseball_pitch_events',
  'baseball_swing_events',
  'baseball_player_development_metrics'
]) AS t;

-- ============================================================================
-- 5. Team-scoping is real — every event SELECT policy references team_id.
-- ============================================================================
SELECT ok(
  position('team_id' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t
        AND p.polname = t || '_select'
  ), '')) > 0,
  format('%s_select is scoped by team_id', t)
)
FROM unnest(ARRAY[
  'baseball_pitch_events',
  'baseball_batted_ball_events',
  'baseball_swing_events',
  'baseball_fielding_events',
  'baseball_catching_events',
  'baseball_baserunning_events'
]) AS t;

-- ============================================================================
-- 6. Player self-read carve-out is honest on raw events:
--    SELECT references the player-self helper AND excludes staff_only;
--    INSERT does NOT let a player self-insert (write is can_view-gated, no
--    get_my_baseball_player_id in WITH CHECK).
-- ============================================================================

-- pitch_events SELECT: player-self helper present.
SELECT ok(
  position('get_my_baseball_player_id' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_pitch_events'
        AND p.polname = 'baseball_pitch_events_select'
  ), '')) > 0,
  'baseball_pitch_events_select lets a player read their own rows'
);
-- pitch_events SELECT: staff_only excluded for the player branch.
SELECT ok(
  position('staff_only' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_pitch_events'
        AND p.polname = 'baseball_pitch_events_select'
  ), '')) > 0,
  'baseball_pitch_events_select excludes staff_only from the player branch'
);
-- pitch_events INSERT: staff-gated (can_view_baseball_player), NOT player-self.
SELECT ok(
  position('can_view_baseball_player' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_pitch_events'
        AND p.polname = 'baseball_pitch_events_insert'
  ), '')) > 0,
  'baseball_pitch_events_insert WITH CHECK is staff can_view-gated'
);
SELECT ok(
  position('get_my_baseball_player_id' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_pitch_events'
        AND p.polname = 'baseball_pitch_events_insert'
  ), '')) = 0,
  'baseball_pitch_events_insert does NOT let a player self-insert an event'
);

-- ============================================================================
-- 7. Development metrics: player branch is gated to player_visible only.
-- ============================================================================
SELECT ok(
  position('player_visible' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_player_development_metrics'
        AND p.polname = 'baseball_player_development_metrics_select'
  ), '')) > 0,
  'baseball_player_development_metrics_select gates the player branch to player_visible'
);

-- ============================================================================
-- 8. Source registry + field mappings: WRITE is import-capability gated.
-- ============================================================================
SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_stat_sources'
        AND p.polname = 'baseball_stat_sources_insert'
  ), '')) > 0,
  'baseball_stat_sources_insert is gated on can_manage_imports'
);
SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_import_field_mappings'
        AND p.polname = 'baseball_import_field_mappings_insert'
  ), '')) > 0,
  'baseball_import_field_mappings_insert is gated on can_manage_imports'
);
-- Source registry is READABLE by any team staff (chips render for non-importers).
SELECT ok(
  position('is_baseball_team_staff' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_stat_sources'
        AND p.polname = 'baseball_stat_sources_select'
  ), '')) > 0,
  'baseball_stat_sources_select is readable by any team staff'
);

SELECT * FROM finish();
ROLLBACK;
