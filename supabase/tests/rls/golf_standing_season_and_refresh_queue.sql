-- pgTAP contracts for 20261024150000_golf_standing_refresh_queue.sql and
-- 20261024151000_golf_player_standing_season.sql (Clubhouse A+ rows 104,
-- 105 and 121).
--
-- Covers: both new tables are RLS-on and service_role only; every new
-- function is closed to anon and authenticated; the season turns on
-- 1 August on the team's wall clock (the cases season.test.ts pins for
-- seasonStartDate); the queue's debounce, cap and "keep a newer mark" clear;
-- and the season refresh runs against the real schema (a team with no
-- players writes nothing). The metric arithmetic is replayed against fixture
-- rounds on a scratch Postgres 16 (see the migration's header); seeding
-- golf_players here would need auth fixtures this suite does not have.

BEGIN;
\ir _helpers.sql

SELECT plan(26);

-- ============================================================================
-- Part 1: tables are RLS-on and closed to anon / authenticated.
-- ============================================================================
SELECT has_table('public', 'golf_standing_refresh_queue', 'golf_standing_refresh_queue exists');
SELECT has_table('public', 'golf_player_standing_season', 'golf_player_standing_season exists');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_standing_refresh_queue'::regclass),
  'golf_standing_refresh_queue has RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_player_standing_season'::regclass),
  'golf_player_standing_season has RLS enabled'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_player_standing_season', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.golf_player_standing_season', 'SELECT'),
  'anon and authenticated cannot read golf_player_standing_season'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.golf_player_standing_season', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.golf_player_standing_season', 'UPDATE'),
  'authenticated cannot write golf_player_standing_season'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_standing_refresh_queue', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.golf_standing_refresh_queue', 'INSERT'),
  'anon and authenticated cannot touch golf_standing_refresh_queue'
);
SELECT ok(
  has_table_privilege('service_role', 'public.golf_player_standing_season', 'SELECT'),
  'service_role reads golf_player_standing_season'
);
SELECT col_type_is('public', 'golf_player_standing_season', 'rounds_n', 'integer', 'rounds_n is an integer');
SELECT col_not_null('public', 'golf_player_standing_season', 'season_start', 'season_start is required');

-- ============================================================================
-- Part 2: every new function is service_role only.
-- ============================================================================
SELECT ok(
  NOT has_function_privilege('anon', 'public.mark_team_standing_dirty(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.mark_team_standing_dirty(uuid)', 'EXECUTE'),
  'mark_team_standing_dirty is closed to anon and authenticated'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.select_dirty_standing_teams(integer, integer, integer)', 'EXECUTE'),
  'select_dirty_standing_teams is closed to authenticated'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.clear_dirty_standing_teams(uuid[], timestamptz[])', 'EXECUTE'),
  'clear_dirty_standing_teams is closed to authenticated'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.refresh_player_standing_season(uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.refresh_player_standing_season(uuid[])', 'EXECUTE'),
  'refresh_player_standing_season is closed to anon and authenticated'
);
SELECT ok(
  has_function_privilege('service_role', 'public.refresh_player_standing_season(uuid[])', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.mark_team_standing_dirty(uuid)', 'EXECUTE'),
  'service_role can refresh and mark'
);

-- ============================================================================
-- Part 3: the season turns on 1 August on the team's wall clock.
-- ============================================================================
SELECT is(public.golf_season_start('America/Los_Angeles', timestamptz '2026-08-01 05:00+00'), date '2025-08-01',
  'a Pacific team at 10 PM on 31 July is still last season');
SELECT is(public.golf_season_start('America/New_York', timestamptz '2026-08-01 05:00+00'), date '2026-08-01',
  'an Eastern team at 1 AM on 1 August is this season');
SELECT is(public.golf_season_start('Not/AZone', timestamptz '2026-08-01 05:00+00'), date '2026-08-01',
  'a zone Postgres does not know reads New York');
SELECT is(public.golf_season_start('UTC', timestamptz '2027-01-15 12:00+00'), date '2026-08-01',
  'January belongs to the season that began the August before');

-- ============================================================================
-- Part 4: the queue (as postgres, inside this transaction).
-- ============================================================================
INSERT INTO public.golf_teams (id, name, join_code)
VALUES ('5eed0000-0000-4000-8000-000000000001', 'pgTAP standing queue team', 'PGTAPSQ1');

SELECT is(public.mark_team_standing_dirty('5eed0000-0000-4000-8000-0000000000ff'), 0,
  'a player on no team marks nothing');

INSERT INTO public.golf_standing_refresh_queue (team_id, first_marked_at, marked_at)
VALUES ('5eed0000-0000-4000-8000-000000000001', now() - interval '40 minutes', now() - interval '1 minute');

SELECT is((SELECT count(*)::int FROM public.select_dirty_standing_teams(10, 180, 3600)), 0,
  'a team marked a minute ago waits out the quiet period');
SELECT is((SELECT count(*)::int FROM public.select_dirty_standing_teams(10, 180, 1800)), 1,
  'a team dirty past the cap is picked even while it keeps being marked');
SELECT is((SELECT count(*)::int FROM public.select_dirty_standing_teams(10, 30, 3600)), 1,
  'a team quiet past the debounce is picked');
SELECT is(
  public.clear_dirty_standing_teams(ARRAY['5eed0000-0000-4000-8000-000000000001'::uuid], ARRAY[now() - interval '5 minutes']),
  0, 'a mark newer than the run read is kept'
);
SELECT is(
  public.clear_dirty_standing_teams(ARRAY['5eed0000-0000-4000-8000-000000000001'::uuid], ARRAY[now()]),
  1, 'a mark the run covered is cleared'
);

-- ============================================================================
-- Part 5: the season refresh runs against the real schema.
-- ============================================================================
SELECT is(
  (SELECT count(*)::int FROM public.refresh_player_standing_season(ARRAY['5eed0000-0000-4000-8000-000000000001'::uuid])),
  0, 'a team with no players writes no season rows'
);

SELECT * FROM finish();
ROLLBACK;
