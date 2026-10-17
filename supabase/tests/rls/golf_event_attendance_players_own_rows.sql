-- pgTAP contract for golf_event_attendance player visibility and
-- public.golf_event_attendance_counts
-- (20261017102000_golf_event_attendance_players_own_rows.sql).
--
-- A player used to read every teammate's RSVP row for the team's events. Now
-- a player reads only their own row, the team's coach still reads every row,
-- and the counts a player's screens show come from a SECURITY DEFINER function
-- that returns numbers only, for the caller's own teams only. Each refusal is
-- paired with the permission it must not have taken away.
--
-- Plan arithmetic: 2 structural + 4 row visibility + 5 counts + 1 own upsert
-- = 12.

BEGIN;
\ir _helpers.sql

SELECT plan(12);

-- ============================================================================
-- Seed. Ids use the 0000...0173xxx range.
--   users:   coach 01 (team A); players 02..05 on team A; outsider 06 on team B
--   events:  E1 (team A, four invitees), E2 (team A, none), F1 (team B, one)
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000173001', 'coach@attown.test',    'authenticated'),
    ('00000000-0000-0000-0000-000000173002', 'p1@attown.test',       'authenticated'),
    ('00000000-0000-0000-0000-000000173003', 'p2@attown.test',       'authenticated'),
    ('00000000-0000-0000-0000-000000173004', 'p3@attown.test',       'authenticated'),
    ('00000000-0000-0000-0000-000000173005', 'p4@attown.test',       'authenticated'),
    ('00000000-0000-0000-0000-000000173006', 'outsider@attown.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000173201', 'Att Own Org A', 'college'),
    ('00000000-0000-0000-0000-000000173202', 'Att Own Org B', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000173301', 'Att Own Team A', 'GATTOWNA', '00000000-0000-0000-0000-000000173201'),
    ('00000000-0000-0000-0000-000000173302', 'Att Own Team B', 'GATTOWNB', '00000000-0000-0000-0000-000000173202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000173401', '00000000-0000-0000-0000-000000173001', '00000000-0000-0000-0000-000000173201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000173301', '00000000-0000-0000-0000-000000173401')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000173502', '00000000-0000-0000-0000-000000173002', 'P', 'One'),
    ('00000000-0000-0000-0000-000000173503', '00000000-0000-0000-0000-000000173003', 'P', 'Two'),
    ('00000000-0000-0000-0000-000000173504', '00000000-0000-0000-0000-000000173004', 'P', 'Three'),
    ('00000000-0000-0000-0000-000000173505', '00000000-0000-0000-0000-000000173005', 'P', 'Four'),
    ('00000000-0000-0000-0000-000000173506', '00000000-0000-0000-0000-000000173006', 'Out', 'Sider')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000173301', '00000000-0000-0000-0000-000000173502', 'active'),
    ('00000000-0000-0000-0000-000000173301', '00000000-0000-0000-0000-000000173503', 'active'),
    ('00000000-0000-0000-0000-000000173301', '00000000-0000-0000-0000-000000173504', 'active'),
    ('00000000-0000-0000-0000-000000173301', '00000000-0000-0000-0000-000000173505', 'active'),
    ('00000000-0000-0000-0000-000000173302', '00000000-0000-0000-0000-000000173506', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_events (id, team_id, title, event_type, start_time) VALUES
    ('00000000-0000-0000-0000-000000173601', '00000000-0000-0000-0000-000000173301', 'E1', 'practice', now() + interval '1 day'),
    ('00000000-0000-0000-0000-000000173602', '00000000-0000-0000-0000-000000173301', 'E2', 'meeting',  now() + interval '2 days'),
    ('00000000-0000-0000-0000-000000173603', '00000000-0000-0000-0000-000000173302', 'F1', 'practice', now() + interval '1 day')
  ON CONFLICT DO NOTHING;

  -- E1: accepted, declined (legacy not_attending), maybe (invited only), pending.
  INSERT INTO public.golf_event_attendance (event_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000173601', '00000000-0000-0000-0000-000000173502', 'accepted'),
    ('00000000-0000-0000-0000-000000173601', '00000000-0000-0000-0000-000000173503', 'not_attending'),
    ('00000000-0000-0000-0000-000000173601', '00000000-0000-0000-0000-000000173504', 'tentative'),
    ('00000000-0000-0000-0000-000000173601', '00000000-0000-0000-0000-000000173505', 'pending'),
    ('00000000-0000-0000-0000-000000173603', '00000000-0000-0000-0000-000000173506', 'accepted')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Structural
-- ============================================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'golf_event_attendance_counts'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
  ),
  'golf_event_attendance_counts is SECURITY DEFINER with search_path = ""'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.golf_event_attendance_counts(uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.golf_event_attendance_counts(uuid[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.golf_event_attendance_counts(uuid[])', 'EXECUTE'),
  'golf_event_attendance_counts is executable by authenticated and NOT by anon or PUBLIC'
);

-- ============================================================================
-- Row visibility
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000173002", "role": "authenticated"}';
SELECT is(
  (SELECT string_agg(player_id::text, ',') FROM public.golf_event_attendance
    WHERE event_id = '00000000-0000-0000-0000-000000173601'),
  '00000000-0000-0000-0000-000000173502',
  'a player reads only their own RSVP row, not teammates'''
);
RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000173001", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_event_attendance
    WHERE event_id = '00000000-0000-0000-0000-000000173601'),
  4,
  'the team''s coach still reads every RSVP row'
);
SELECT is(
  (SELECT count(*)::int FROM public.golf_event_attendance
    WHERE event_id = '00000000-0000-0000-0000-000000173603'),
  0,
  'the coach does not read another team''s rows'
);
RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000173006", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_event_attendance
    WHERE event_id = '00000000-0000-0000-0000-000000173601'),
  0,
  'a player of another team reads no rows'
);

-- ============================================================================
-- Counts
-- ============================================================================
SELECT is(
  (SELECT count(*)::int FROM public.golf_event_attendance_counts(ARRAY[
     '00000000-0000-0000-0000-000000173601'::uuid])),
  0,
  'a player of another team gets no counts for team A''s event'
);
RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000173002", "role": "authenticated"}';
SELECT is(
  (SELECT format('%s/%s/%s/%s', invited, accepted, declined, pending)
     FROM public.golf_event_attendance_counts(ARRAY['00000000-0000-0000-0000-000000173601'::uuid])),
  '4/1/1/1',
  'a player gets the team event''s counts (maybe counts in invited only)'
);
SELECT is(
  (SELECT format('%s/%s/%s/%s', invited, accepted, declined, pending)
     FROM public.golf_event_attendance_counts(ARRAY['00000000-0000-0000-0000-000000173602'::uuid])),
  '0/0/0/0',
  'an event with no invitees returns a row of zeros'
);
SELECT is(
  (SELECT string_agg(event_id::text, ',' ORDER BY event_id) FROM public.golf_event_attendance_counts(ARRAY[
     '00000000-0000-0000-0000-000000173601'::uuid,
     '00000000-0000-0000-0000-000000173602'::uuid,
     '00000000-0000-0000-0000-000000173603'::uuid])),
  '00000000-0000-0000-0000-000000173601,00000000-0000-0000-0000-000000173602',
  'another team''s event is left out of a player''s counts'
);

-- The player's own RSVP upsert (updateRSVP) still works: ON CONFLICT DO UPDATE
-- checks the existing row against SELECT and UPDATE.
SELECT lives_ok(
  $$INSERT INTO public.golf_event_attendance (event_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-000000173601', '00000000-0000-0000-0000-000000173502', 'declined')
    ON CONFLICT (event_id, player_id) DO UPDATE SET status = EXCLUDED.status$$,
  'a player can still upsert their own RSVP'
);
RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000173001", "role": "authenticated"}';
SELECT is(
  (SELECT format('%s/%s/%s/%s', invited, accepted, declined, pending)
     FROM public.golf_event_attendance_counts(ARRAY['00000000-0000-0000-0000-000000173601'::uuid])),
  '4/0/2/1',
  'the coach gets the same counts, reflecting the player''s new reply'
);
RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
