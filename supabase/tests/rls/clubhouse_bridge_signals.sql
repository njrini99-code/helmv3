-- pgTAP contract for 20261124090000_clubhouse_bridge_signals.sql (Clubhouse Bridge plan PR 1, held).
--
-- The signal tables are the Bridge's: a super admin (admin_allowlist) reads them, a signed-in coach or player reads
-- nothing and writes nothing, anon holds nothing, and only the service role may call the ingest function. The ingest
-- function merges counts and histograms, keeps a session's timeline only once it has a failure, and counts drift.
--
-- Plan: 5 RLS on + 5 admin reads + 5 coach reads none + 2 coach writes refused + 3 anon + 2 execute grants
--       + 7 ingest = 29.

BEGIN;
\ir _helpers.sql

SELECT plan(30);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000924001', 'admin@bridgesig.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000924002', 'coach@bridgesig.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.admin_allowlist (user_id, email, note)
    VALUES ('00000000-0000-0000-0000-000000924001', 'admin@bridgesig.test', 'clubhouse_bridge_signals test')
  ON CONFLICT (user_id) DO NOTHING;

  -- One session with a failure, one hourly row, one drift row, one note: written as the service role would.
  PERFORM public.clubhouse_ingest_signals(jsonb_build_object(
    'hourly', jsonb_build_array(jsonb_build_object(
      'hour', '2026-11-24T10:00:00Z', 'code', 'CH-1703', 'kind', 'action', 'outcome', 'failure', 'act', 'roster.remove',
      'role', 'coach', 'platform', 'desktop', 'release', 'test', 'bridge_id', 10999, 'page_id', 'P003', 'count', 2,
      'user_ids', jsonb_build_array(), 'buckets', jsonb_build_array(0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1),
      'first_at', '2026-11-24T10:01:00Z', 'last_at', '2026-11-24T10:02:00Z')),
    'session', jsonb_build_object(
      'session_id', 'bridgesig-one', 'user_id', NULL, 'role', 'coach', 'team_id', NULL, 'platform', 'desktop',
      'release', 'test', 'first_at', '2026-11-24T10:00:00Z', 'last_at', '2026-11-24T10:02:00Z', 'ended', false,
      'pages', jsonb_build_array('P003'), 'count', 3, 'failures', 1, 'replay_id', NULL),
    'events', jsonb_build_array(
      jsonb_build_object('seq', 1, 'at', '2026-11-24T10:01:00Z', 'kind', 'action', 'outcome', 'start', 'page_id', 'P003', 'act', 'roster.remove', 'drift', jsonb_build_array()),
      jsonb_build_object('seq', 2, 'at', '2026-11-24T10:02:00Z', 'kind', 'action', 'outcome', 'failure', 'code', 'CH-1703', 'page_id', 'P003', 'act', 'roster.remove', 'message', 'failed', 'drift', jsonb_build_array())),
    'drift', jsonb_build_array(jsonb_build_object(
      'kind', 'unknown-code', 'code', 'CH-99999', 'release', 'test', 'count', 1,
      'first_seen', '2026-11-24T10:01:00Z', 'last_seen', '2026-11-24T10:01:00Z'))
  ));
  INSERT INTO public.bridge_notes (kind, code, body) VALUES ('expected', 'CH-1703', 'known');
END $$;

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.clubhouse_signal_hourly'::regclass), 'RLS is on for hourly counts');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.clubhouse_sessions'::regclass), 'RLS is on for sessions');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.clubhouse_session_events'::regclass), 'RLS is on for session events');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.clubhouse_drift'::regclass), 'RLS is on for drift');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bridge_notes'::regclass), 'RLS is on for notes');

SET LOCAL role TO authenticated;

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000924001", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.clubhouse_signal_hourly WHERE release = 'test'), 1, 'a super admin reads the hourly counts');
SELECT is((SELECT count(*)::int FROM public.clubhouse_sessions WHERE session_id = 'bridgesig-one'), 1, 'and the session');
SELECT is((SELECT count(*)::int FROM public.clubhouse_session_events WHERE session_id = 'bridgesig-one'), 2, 'and its timeline');
SELECT is((SELECT count(*)::int FROM public.clubhouse_drift WHERE release = 'test'), 1, 'and the drift');
SELECT is((SELECT count(*)::int FROM public.bridge_notes WHERE body = 'known'), 1, 'and the notes');

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000924002", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.clubhouse_signal_hourly), 0, 'a coach reads no hourly counts');
SELECT is((SELECT count(*)::int FROM public.clubhouse_sessions), 0, 'nor sessions');
SELECT is((SELECT count(*)::int FROM public.clubhouse_session_events), 0, 'nor session events');
SELECT is((SELECT count(*)::int FROM public.clubhouse_drift), 0, 'nor drift');
SELECT is((SELECT count(*)::int FROM public.bridge_notes), 0, 'nor notes');
SELECT throws_ok($$INSERT INTO public.bridge_notes (kind, body) VALUES ('note', 'x')$$, '42501', NULL, 'a coach cannot write a note');
SELECT throws_ok($$SELECT public.clubhouse_ingest_signals('{}'::jsonb)$$, '42501', NULL, 'nor call the ingest function');

RESET role;
SELECT ok(NOT has_table_privilege('anon', 'public.clubhouse_sessions', 'SELECT'), 'anon cannot read sessions');
SELECT ok(NOT has_table_privilege('anon', 'public.clubhouse_signal_hourly', 'SELECT'), 'anon cannot read hourly counts');
SELECT ok(NOT has_function_privilege('anon', 'public.clubhouse_ingest_signals(jsonb)', 'EXECUTE'), 'anon cannot call the ingest function');
SELECT ok(NOT has_function_privilege('authenticated', 'public.clubhouse_ingest_signals(jsonb)', 'EXECUTE'), 'authenticated holds no execute on ingest');
SELECT ok(has_function_privilege('service_role', 'public.clubhouse_ingest_signals(jsonb)', 'EXECUTE'), 'the service role may ingest');

-- A second batch for the same hour and session merges into the same rows.
SELECT lives_ok($$SELECT public.clubhouse_ingest_signals(jsonb_build_object(
  'hourly', jsonb_build_array(jsonb_build_object(
    'hour', '2026-11-24T10:00:00Z', 'code', 'CH-1703', 'kind', 'action', 'outcome', 'failure', 'act', 'roster.remove',
    'page_id', 'P003', 'role', 'coach', 'platform', 'desktop', 'release', 'test', 'count', 1, 'user_ids', jsonb_build_array(),
    'buckets', jsonb_build_array(0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    'first_at', '2026-11-24T10:00:30Z', 'last_at', '2026-11-24T10:05:00Z')),
  'session', jsonb_build_object(
    'session_id', 'bridgesig-one', 'role', 'coach', 'platform', 'desktop', 'release', 'test',
    'first_at', '2026-11-24T10:03:00Z', 'last_at', '2026-11-24T10:05:00Z', 'ended', true,
    'pages', jsonb_build_array('P002'), 'count', 1, 'failures', 0),
  'events', jsonb_build_array(
    jsonb_build_object('seq', 3, 'at', '2026-11-24T10:05:00Z', 'kind', 'view', 'code', '20101', 'page_id', 'P002', 'trail', NULL, 'drift', jsonb_build_array())),
  'drift', jsonb_build_array(jsonb_build_object(
    'kind', 'unknown-code', 'code', 'CH-99999', 'release', 'test', 'count', 2,
    'first_seen', '2026-11-24T09:59:00Z', 'last_seen', '2026-11-24T10:05:00Z'))
))$$, 'a second batch ingests');
SELECT is((SELECT signal_count::int FROM public.clubhouse_signal_hourly WHERE release = 'test'), 3, 'counts add up');
SELECT is((SELECT p50_ms FROM public.clubhouse_signal_hourly WHERE release = 'test'), 500, 'the median reads from the merged histogram');
SELECT is((SELECT p99_ms FROM public.clubhouse_signal_hourly WHERE release = 'test'), 600000, 'the tail reads the open bucket');
SELECT is((SELECT pages FROM public.clubhouse_sessions WHERE session_id = 'bridgesig-one'), ARRAY['P002', 'P003'], 'the session collects its pages');
SELECT is((SELECT count(*)::int FROM public.clubhouse_session_events WHERE session_id = 'bridgesig-one'), 3, 'a failed session keeps the envelopes after its failure');
SELECT is((SELECT drift_count::int FROM public.clubhouse_drift WHERE release = 'test'), 3, 'drift counts add up');
SELECT is((SELECT trail FROM public.clubhouse_session_events WHERE session_id = 'bridgesig-one' AND seq = 3), NULL::text[], 'an envelope sent with trail: null (as the route sends it) stores no trail');

SELECT * FROM finish();
ROLLBACK;
