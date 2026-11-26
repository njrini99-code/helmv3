-- pgTAP contract for 20261124090000_clubhouse_bridge_signals.sql (Clubhouse Bridge plan PR 1, held).
--
-- The signal tables are the Bridge's: a super admin (admin_allowlist) reads them, a signed-in coach or player reads
-- nothing and writes nothing, anon holds nothing, and only the service role may call the four functions. The ingest
-- function merges counts and histograms, keeps a session's timeline only once it has a failure, counts drift, keeps a
-- session with the first verified user that wrote it, keeps a team only for that user's own team, and drops ids that
-- do not exist. The prune keeps recent rows, and clubhouse_forget_user scrubs a deleted user from the hourly rows.
--
-- Each scenario uses its own release and session id, so the scalar subqueries on release = 'test' stay one row.
--
-- Plan: 5 RLS on + 5 admin reads + 5 coach reads none + 6 coach writes refused + 3 anon reads refused
--       + 12 privileges + 8 merge + 4 service-role batch + 4 missing or malformed ids + 2 non-member team
--       + 6 second user + 2 forget + 5 prune = 67.

BEGIN;
\ir _helpers.sql

SELECT plan(67);

DO $$
DECLARE
  u record;
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000924001', 'admin@bridgesig.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000924002', 'coach@bridgesig.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.admin_allowlist (user_id, email, note)
    VALUES ('00000000-0000-0000-0000-000000924001', 'admin@bridgesig.test', 'clubhouse_bridge_signals test')
  ON CONFLICT (user_id) DO NOTHING;

  -- A coaches team T; B and C are signed-in users with no tie to T.
  FOR u IN SELECT * FROM (VALUES
    ('00000000-0000-0000-0000-000000924003'::uuid, 'a@bridgesig.test'),
    ('00000000-0000-0000-0000-000000924004'::uuid, 'b@bridgesig.test'),
    ('00000000-0000-0000-0000-000000924005'::uuid, 'c@bridgesig.test')
  ) AS t(id, email) LOOP
    INSERT INTO auth.users (id, email, role) VALUES (u.id, u.email, 'authenticated') ON CONFLICT DO NOTHING;
    -- The auth.users insert may already have made the row as a player.
    INSERT INTO public.users (id, email, role) VALUES (u.id, u.email, 'coach')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  END LOOP;
  INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-000000924b01', 'pgTAP Bridge Signals U', 'college');
  INSERT INTO public.golf_teams (id, name, join_code, organization_id)
    VALUES ('00000000-0000-0000-0000-000000924e01', 'pgTAP Bridge Signals Golf', 'PGBRSIG1',
            '00000000-0000-0000-0000-000000924b01');
  INSERT INTO public.golf_coaches (id, user_id, organization_id)
    VALUES ('00000000-0000-0000-0000-000000924c01', '00000000-0000-0000-0000-000000924003',
            '00000000-0000-0000-0000-000000924b01');
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary)
    VALUES ('00000000-0000-0000-0000-000000924e01', '00000000-0000-0000-0000-000000924c01', 'head_coach', true);

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

  -- Retention fixtures: one row past each table's window and one inside it.
  INSERT INTO public.clubhouse_signal_hourly (bucket_hour, code, kind, role, platform, release) VALUES
    (date_trunc('hour', now() - interval '200 days'), 'CH-1703', 'action', 'coach', 'desktop', 'test-prune-old'),
    (date_trunc('hour', now() - interval '1 day'), 'CH-1703', 'action', 'coach', 'desktop', 'test-prune-new');
  INSERT INTO public.clubhouse_drift (kind, code, release, drift_count, first_seen, last_seen) VALUES
    ('unknown-code', 'CH-99999', 'test-prune-old', 1, now() - interval '200 days', now() - interval '200 days'),
    ('unknown-code', 'CH-99999', 'test-prune-new', 1, now() - interval '1 day', now() - interval '1 day');
  INSERT INTO public.clubhouse_sessions (session_id, role, platform, release, started_at, last_at, failure_count) VALUES
    ('bridgesig-prune-old', 'coach', 'desktop', 'test-prune', now() - interval '40 days', now() - interval '40 days', 1),
    ('bridgesig-prune-new', 'coach', 'desktop', 'test-prune', now() - interval '1 day', now() - interval '1 day', 1);
  INSERT INTO public.clubhouse_session_events (session_id, seq, sent_at, kind, received_at) VALUES
    ('bridgesig-prune-new', 1, now() - interval '20 days', 'action', now() - interval '20 days'),
    ('bridgesig-prune-new', 2, now() - interval '1 day', 'action', now() - interval '1 day');

  -- Forget fixture: one hourly row sent by A and B.
  INSERT INTO public.clubhouse_signal_hourly (bucket_hour, code, kind, role, platform, release, user_ids) VALUES
    (date_trunc('hour', now()), 'CH-1703', 'action', 'coach', 'desktop', 'test-forget',
     ARRAY['00000000-0000-0000-0000-000000924003', '00000000-0000-0000-0000-000000924004']::uuid[]);
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
SELECT throws_ok(
  $$INSERT INTO public.clubhouse_signal_hourly (bucket_hour, code, kind, role, platform, release)
    VALUES (now(), 'x', 'action', 'coach', 'desktop', 'x')$$,
  '42501', NULL, 'nor write an hourly count');
SELECT throws_ok(
  $$INSERT INTO public.clubhouse_sessions (session_id, role, platform, release, started_at, last_at)
    VALUES ('bridgesig-forged', 'coach', 'desktop', 'x', now(), now())$$,
  '42501', NULL, 'nor write a session');
SELECT throws_ok(
  $$INSERT INTO public.clubhouse_session_events (session_id, seq, sent_at, kind)
    VALUES ('bridgesig-one', 99, now(), 'action')$$,
  '42501', NULL, 'nor write a session event');
SELECT throws_ok(
  $$INSERT INTO public.clubhouse_drift (kind, code, release, first_seen, last_seen)
    VALUES ('unknown-code', 'x', 'x', now(), now())$$,
  '42501', NULL, 'nor write drift');

RESET role;
SET LOCAL role TO anon;
SELECT throws_ok($$SELECT 1 FROM public.clubhouse_session_events$$, '42501', NULL, 'anon cannot read session events');
SELECT throws_ok($$SELECT 1 FROM public.clubhouse_drift$$, '42501', NULL, 'anon cannot read drift');
SELECT throws_ok($$SELECT 1 FROM public.bridge_notes$$, '42501', NULL, 'anon cannot read notes');

RESET role;
SELECT ok(NOT has_table_privilege('anon', 'public.clubhouse_sessions', 'SELECT'), 'anon cannot read sessions');
SELECT ok(NOT has_table_privilege('anon', 'public.clubhouse_signal_hourly', 'SELECT'), 'anon cannot read hourly counts');
SELECT ok(NOT has_function_privilege('anon', 'public.clubhouse_ingest_signals(jsonb)', 'EXECUTE'), 'anon cannot call the ingest function');
SELECT ok(NOT has_function_privilege('authenticated', 'public.clubhouse_ingest_signals(jsonb)', 'EXECUTE'), 'authenticated holds no execute on ingest');
SELECT ok(has_function_privilege('service_role', 'public.clubhouse_ingest_signals(jsonb)', 'EXECUTE'), 'the service role may ingest');
SELECT ok(NOT has_function_privilege('anon', 'public.clubhouse_signals_prune()', 'EXECUTE'), 'anon cannot run the prune');
SELECT ok(NOT has_function_privilege('authenticated', 'public.clubhouse_signals_prune()', 'EXECUTE'), 'nor can authenticated');
SELECT ok(NOT has_function_privilege('anon', 'public.clubhouse_bucket_quantile(integer[], numeric)', 'EXECUTE'), 'anon cannot call the quantile helper');
SELECT ok(NOT has_function_privilege('authenticated', 'public.clubhouse_bucket_quantile(integer[], numeric)', 'EXECUTE'), 'nor can authenticated');
SELECT ok(NOT has_function_privilege('anon', 'public.clubhouse_forget_user(uuid)', 'EXECUTE'), 'anon cannot forget a user');
SELECT ok(NOT has_function_privilege('authenticated', 'public.clubhouse_forget_user(uuid)', 'EXECUTE'), 'nor can authenticated');
SELECT ok(has_function_privilege('service_role', 'public.clubhouse_forget_user(uuid)', 'EXECUTE'), 'the service role may forget a user');

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

-- The route's own call: the service role, a verified user, a team that user coaches, no failure.
SET LOCAL role TO service_role;
SELECT lives_ok($$SELECT public.clubhouse_ingest_signals(jsonb_build_object(
  'hourly', jsonb_build_array(jsonb_build_object(
    'hour', '2026-11-24T11:00:00Z', 'code', '20101', 'kind', 'view', 'role', 'coach', 'platform', 'ios-app',
    'release', 'test-svc', 'page_id', 'P002', 'count', 1,
    'user_ids', jsonb_build_array('00000000-0000-0000-0000-000000924003'), 'buckets', jsonb_build_array(),
    'first_at', '2026-11-24T11:00:00Z', 'last_at', '2026-11-24T11:00:00Z')),
  'session', jsonb_build_object(
    'session_id', 'bridgesig-svc', 'user_id', '00000000-0000-0000-0000-000000924003', 'role', 'coach',
    'team_id', '00000000-0000-0000-0000-000000924e01', 'platform', 'ios-app', 'release', 'test-svc',
    'first_at', '2026-11-24T11:00:00Z', 'last_at', '2026-11-24T11:00:00Z', 'ended', false,
    'pages', jsonb_build_array('P002'), 'count', 1, 'failures', 0),
  'events', jsonb_build_array(
    jsonb_build_object('seq', 1, 'at', '2026-11-24T11:00:00Z', 'kind', 'view', 'code', '20101', 'page_id', 'P002', 'drift', jsonb_build_array())),
  'drift', jsonb_build_array()
))$$, 'the service role ingests a batch');
RESET role;
SELECT is((SELECT count(*)::int FROM public.clubhouse_session_events WHERE session_id = 'bridgesig-svc'), 0, 'a session with no failure stores no events');
SELECT is((SELECT user_id FROM public.clubhouse_sessions WHERE session_id = 'bridgesig-svc'), '00000000-0000-0000-0000-000000924003'::uuid, 'the session keeps its verified user');
SELECT is((SELECT team_id FROM public.clubhouse_sessions WHERE session_id = 'bridgesig-svc'), '00000000-0000-0000-0000-000000924e01'::uuid, 'and the team that user coaches');

-- Ids that point at nothing are dropped, and an id that is not a uuid does not lose the batch.
SELECT lives_ok($$SELECT public.clubhouse_ingest_signals(jsonb_build_object(
  'session', jsonb_build_object(
    'session_id', 'bridgesig-ghost', 'user_id', '00000000-0000-0000-0000-0000009240ff', 'role', 'coach',
    'team_id', '00000000-0000-0000-0000-0000009240fe', 'platform', 'desktop', 'release', 'test-ghost',
    'first_at', '2026-11-24T12:00:00Z', 'last_at', '2026-11-24T12:00:00Z', 'ended', false,
    'pages', jsonb_build_array(), 'count', 1, 'failures', 0)
))$$, 'a batch naming a user and team that do not exist ingests');
SELECT is((SELECT user_id FROM public.clubhouse_sessions WHERE session_id = 'bridgesig-ghost'), NULL::uuid, 'the missing user is dropped');
SELECT is((SELECT team_id FROM public.clubhouse_sessions WHERE session_id = 'bridgesig-ghost'), NULL::uuid, 'and the missing team');
SELECT lives_ok($$SELECT public.clubhouse_ingest_signals(jsonb_build_object(
  'session', jsonb_build_object(
    'session_id', 'bridgesig-badid', 'user_id', 'not-a-uuid', 'role', 'coach', 'team_id', 'nor-this',
    'platform', 'desktop', 'release', 'test-badid', 'first_at', '2026-11-24T12:00:00Z',
    'last_at', '2026-11-24T12:00:00Z', 'ended', false, 'pages', jsonb_build_array(), 'count', 1, 'failures', 0)
))$$, 'a batch whose ids are not uuids still ingests');

-- A team the user has no place on is not kept.
SELECT lives_ok($$SELECT public.clubhouse_ingest_signals(jsonb_build_object(
  'session', jsonb_build_object(
    'session_id', 'bridgesig-outsider', 'user_id', '00000000-0000-0000-0000-000000924005', 'role', 'coach',
    'team_id', '00000000-0000-0000-0000-000000924e01', 'platform', 'desktop', 'release', 'test-outsider',
    'first_at', '2026-11-24T12:00:00Z', 'last_at', '2026-11-24T12:00:00Z', 'ended', false,
    'pages', jsonb_build_array(), 'count', 1, 'failures', 0)
))$$, 'a user who is not on the team ingests');
SELECT is((SELECT team_id FROM public.clubhouse_sessions WHERE session_id = 'bridgesig-outsider'), NULL::uuid, 'but the team they named is not kept');

-- A session belongs to the first user that wrote it: B's batch for A's session id changes nothing of the session.
SELECT lives_ok($$SELECT public.clubhouse_ingest_signals(jsonb_build_object(
  'session', jsonb_build_object(
    'session_id', 'bridgesig-shared', 'user_id', '00000000-0000-0000-0000-000000924003', 'role', 'coach',
    'platform', 'desktop', 'release', 'test-ab', 'first_at', '2026-11-24T13:00:00Z',
    'last_at', '2026-11-24T13:01:00Z', 'ended', false, 'pages', jsonb_build_array('P003'), 'count', 2, 'failures', 1),
  'events', jsonb_build_array(
    jsonb_build_object('seq', 1, 'at', '2026-11-24T13:00:00Z', 'kind', 'action', 'outcome', 'start', 'page_id', 'P003', 'drift', jsonb_build_array()),
    jsonb_build_object('seq', 2, 'at', '2026-11-24T13:01:00Z', 'kind', 'action', 'outcome', 'failure', 'code', 'CH-1703', 'page_id', 'P003', 'drift', jsonb_build_array()))
))$$, 'user A starts a session with a failure');
SELECT is(
  (SELECT public.clubhouse_ingest_signals(jsonb_build_object(
    'hourly', jsonb_build_array(jsonb_build_object(
      'hour', '2026-11-24T13:00:00Z', 'code', 'CH-1703', 'kind', 'action', 'outcome', 'failure', 'role', 'coach',
      'platform', 'desktop', 'release', 'test-ab', 'page_id', 'P003', 'count', 1,
      'user_ids', jsonb_build_array('00000000-0000-0000-0000-000000924004'), 'buckets', jsonb_build_array(),
      'first_at', '2026-11-24T13:02:00Z', 'last_at', '2026-11-24T13:02:00Z')),
    'session', jsonb_build_object(
      'session_id', 'bridgesig-shared', 'user_id', '00000000-0000-0000-0000-000000924004', 'role', 'coach',
      'platform', 'desktop', 'release', 'test-ab', 'first_at', '2026-11-24T13:02:00Z',
      'last_at', '2026-11-24T13:02:00Z', 'ended', false, 'pages', jsonb_build_array('P999'), 'count', 1, 'failures', 1),
    'events', jsonb_build_array(
      jsonb_build_object('seq', 3, 'at', '2026-11-24T13:02:00Z', 'kind', 'action', 'outcome', 'failure', 'code', 'CH-1703', 'page_id', 'P999', 'drift', jsonb_build_array()))
  )) ->> 'session_refused'),
  'true', 'user B''s batch for the same session id is refused, without an error');
SELECT is((SELECT user_id FROM public.clubhouse_sessions WHERE session_id = 'bridgesig-shared'), '00000000-0000-0000-0000-000000924003'::uuid, 'the session stays user A''s');
SELECT is((SELECT count(*)::int FROM public.clubhouse_session_events WHERE session_id = 'bridgesig-shared'), 2, 'and keeps none of user B''s events');
SELECT is((SELECT failure_count FROM public.clubhouse_sessions WHERE session_id = 'bridgesig-shared'), 1, 'nor user B''s failures');
SELECT is((SELECT user_ids FROM public.clubhouse_signal_hourly WHERE release = 'test-ab'), '{}'::uuid[], 'the hourly count is kept, but user B is not attributed to it');

-- Account deletion scrubs the user from the hourly rows.
SET LOCAL role TO service_role;
SELECT is(public.clubhouse_forget_user('00000000-0000-0000-0000-000000924003'), 2, 'forgetting user A changes the rows that named them');
RESET role;
SELECT is((SELECT user_ids FROM public.clubhouse_signal_hourly WHERE release = 'test-forget'), ARRAY['00000000-0000-0000-0000-000000924004']::uuid[], 'and leaves the other senders');

-- Retention.
SET LOCAL role TO service_role;
SELECT lives_ok($$SELECT public.clubhouse_signals_prune()$$, 'the service role runs the prune');
RESET role;
SELECT is((SELECT array_agg(release ORDER BY release) FROM public.clubhouse_signal_hourly WHERE release LIKE 'test-prune%'), ARRAY['test-prune-new'], 'the prune drops hourly counts past 180 days and keeps recent ones');
SELECT is((SELECT array_agg(release ORDER BY release) FROM public.clubhouse_drift WHERE release LIKE 'test-prune%'), ARRAY['test-prune-new'], 'and drift past 180 days');
SELECT is((SELECT array_agg(session_id ORDER BY session_id) FROM public.clubhouse_sessions WHERE release = 'test-prune'), ARRAY['bridgesig-prune-new'], 'and sessions past 30 days');
SELECT is((SELECT array_agg(seq ORDER BY seq) FROM public.clubhouse_session_events WHERE session_id = 'bridgesig-prune-new'), ARRAY[2], 'and session events past 14 days');

SELECT * FROM finish();
ROLLBACK;
