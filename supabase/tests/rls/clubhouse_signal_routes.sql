-- pgTAP contract for 20261128090000_clubhouse_signal_routes.sql (held).
--
-- The hourly counts learn which screen each signal fired on. route is a text column, not null, default '' (screen
-- not told), and sits in the primary key after page_id, so the screens of one page count apart. v2 writes it, cut
-- to 160 characters; only the service role may call v2. The first function hands its batch to v2, so a deploy that
-- sends no route still counts, under route '', into the row that was there. Access to the table is unchanged.
--
-- Each scenario uses its own release, so the scalar subqueries stay one row.
--
-- Plan: 4 column and key + 5 privileges + 4 two screens + 2 first function + 1 long route = 16.

BEGIN;
\ir _helpers.sql

SELECT plan(16);

-- Column and key.
SELECT has_column('public', 'clubhouse_signal_hourly', 'route', 'the hourly counts have a route column');
SELECT col_not_null('public', 'clubhouse_signal_hourly', 'route', 'route is never null');
SELECT col_default_is('public', 'clubhouse_signal_hourly', 'route', '', 'a row that is not told its screen reads route empty');
SELECT is(
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conrelid = 'public.clubhouse_signal_hourly'::regclass AND contype = 'p'),
  'PRIMARY KEY (bucket_hour, code, kind, outcome, act, page_id, route, role, platform, release)',
  'the primary key counts each screen of a page apart'
);

-- Privileges.
SELECT ok(NOT has_function_privilege('anon', 'public.clubhouse_ingest_signals_v2(jsonb)', 'EXECUTE'), 'anon cannot call v2');
SELECT ok(NOT has_function_privilege('authenticated', 'public.clubhouse_ingest_signals_v2(jsonb)', 'EXECUTE'), 'authenticated holds no execute on v2');
SELECT ok(has_function_privilege('service_role', 'public.clubhouse_ingest_signals_v2(jsonb)', 'EXECUTE'), 'the service role may call v2');
SELECT ok(NOT has_function_privilege('authenticated', 'public.clubhouse_ingest_signals(jsonb)', 'EXECUTE'), 'the first function keeps its grants');
SELECT ok(has_function_privilege('service_role', 'public.clubhouse_ingest_signals(jsonb)', 'EXECUTE'), 'and the service role still calls it');

-- Two screens of CoachHelm in one batch, then the second screen again.
DO $$
BEGIN
  PERFORM public.clubhouse_ingest_signals_v2(jsonb_build_object(
    'hourly', jsonb_build_array(
      jsonb_build_object(
        'hour', '2026-11-28T09:00:00Z', 'code', '', 'kind', 'view', 'outcome', '', 'act', '', 'role', 'coach',
        'platform', 'ios-app', 'release', 'test-route', 'page_id', 'P013', 'route', '/golf/dashboard/coachhelm',
        'count', 1, 'user_ids', jsonb_build_array(),
        'buckets', jsonb_build_array(0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        'first_at', '2026-11-28T09:01:00Z', 'last_at', '2026-11-28T09:01:00Z'),
      jsonb_build_object(
        'hour', '2026-11-28T09:00:00Z', 'code', '', 'kind', 'view', 'outcome', '', 'act', '', 'role', 'coach',
        'platform', 'ios-app', 'release', 'test-route', 'page_id', 'P013', 'route', '/golf/dashboard/coachhelm?view=ask',
        'count', 2, 'user_ids', jsonb_build_array(),
        'buckets', jsonb_build_array(0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        'first_at', '2026-11-28T09:02:00Z', 'last_at', '2026-11-28T09:03:00Z')),
    'session', null, 'events', '[]'::jsonb, 'drift', '[]'::jsonb));
  PERFORM public.clubhouse_ingest_signals_v2(jsonb_build_object(
    'hourly', jsonb_build_array(jsonb_build_object(
      'hour', '2026-11-28T09:00:00Z', 'code', '', 'kind', 'view', 'outcome', '', 'act', '', 'role', 'coach',
      'platform', 'ios-app', 'release', 'test-route', 'page_id', 'P013', 'route', '/golf/dashboard/coachhelm?view=ask',
      'count', 1, 'user_ids', jsonb_build_array(),
      'buckets', jsonb_build_array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0),
      'first_at', '2026-11-28T09:04:00Z', 'last_at', '2026-11-28T09:04:00Z')),
    'session', null, 'events', '[]'::jsonb, 'drift', '[]'::jsonb));
END $$;

SELECT is((SELECT count(*)::int FROM public.clubhouse_signal_hourly WHERE release = 'test-route'), 2, 'two screens of one page count apart');
SELECT is(
  (SELECT signal_count::int FROM public.clubhouse_signal_hourly
   WHERE release = 'test-route' AND route = '/golf/dashboard/coachhelm?view=ask'),
  3, 'a screen seen again merges into its own row'
);
SELECT is(
  (SELECT duration_buckets FROM public.clubhouse_signal_hourly
   WHERE release = 'test-route' AND route = '/golf/dashboard/coachhelm?view=ask'),
  ARRAY[0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0], 'its histogram adds per bucket'
);
SELECT ok(
  (SELECT p95_ms IS NOT NULL FROM public.clubhouse_signal_hourly
   WHERE release = 'test-route' AND route = '/golf/dashboard/coachhelm?view=ask'),
  'its percentiles follow the merged histogram'
);

-- A deploy that predates the column: the first function, no route, into the row that was there.
DO $$
BEGIN
  INSERT INTO public.clubhouse_signal_hourly (bucket_hour, code, kind, role, platform, release, page_id, signal_count)
    VALUES ('2026-11-27T01:00:00Z', '', 'view', 'coach', 'desktop', 'test-route-v1', 'P007', 3);
  PERFORM public.clubhouse_ingest_signals(jsonb_build_object(
    'hourly', jsonb_build_array(jsonb_build_object(
      'hour', '2026-11-27T01:00:00Z', 'code', '', 'kind', 'view', 'outcome', '', 'act', '', 'role', 'coach',
      'platform', 'desktop', 'release', 'test-route-v1', 'page_id', 'P007', 'count', 2,
      'user_ids', jsonb_build_array(), 'buckets', jsonb_build_array(),
      'first_at', '2026-11-27T01:50:00Z', 'last_at', '2026-11-27T01:50:00Z')),
    'session', null, 'events', '[]'::jsonb, 'drift', '[]'::jsonb));
END $$;

SELECT is((SELECT count(*)::int FROM public.clubhouse_signal_hourly WHERE release = 'test-route-v1'), 1, 'the first function adds no row of its own');
SELECT is(
  (SELECT signal_count::int FROM public.clubhouse_signal_hourly WHERE release = 'test-route-v1' AND route = ''),
  5, 'and still counts, under route empty, into the row that was there'
);

-- A route over 160 characters is cut, not refused.
DO $$
BEGIN
  PERFORM public.clubhouse_ingest_signals_v2(jsonb_build_object(
    'hourly', jsonb_build_array(jsonb_build_object(
      'hour', '2026-11-28T10:00:00Z', 'code', '', 'kind', 'tap', 'role', 'player', 'platform', 'other',
      'release', 'test-route-long', 'page_id', 'P011', 'route', repeat('x', 400), 'count', 1,
      'first_at', '2026-11-28T10:00:00Z', 'last_at', '2026-11-28T10:00:00Z')),
    'session', null, 'events', '[]'::jsonb, 'drift', '[]'::jsonb));
END $$;

SELECT is((SELECT length(route) FROM public.clubhouse_signal_hourly WHERE release = 'test-route-long'), 160, 'a long route is cut to 160 characters');

SELECT * FROM finish();
ROLLBACK;
