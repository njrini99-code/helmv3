-- pgTAP contract for meeting visibility on golf_events and in
-- public.get_player_hub_events
-- (20261018120000_golf_events_meetings_invitees_only.sql).
--
-- A player used to read every team meeting, 1:1s included. Now a player sees a
-- meeting only when they have their own attendance row on it; every other
-- event type stays visible to the whole team; the team's coach sees
-- everything. The player hub lists the same set. Each refusal is paired with
-- the permission it must not have taken away (the invited player's RSVP
-- upsert, self-RSVP to a team-wide event, the coach's full view).
--
-- Plan arithmetic: 3 structural + 6 uninvited player + 5 invited player
-- + 3 coach + 1 outsider = 18.

BEGIN;
\ir _helpers.sql

SELECT plan(18);

-- ============================================================================
-- Seed. Ids use the 0000...0181xxx range.
--   users:   coach 01 (team A); player 02 (invited to M1), player 03 (invited
--            to nothing); outsider 04 on team B
--   events (team A): PR practice, no invites; PI practice, invite list of 02
--            only; M1 meeting, 02 invited; M2 meeting, nobody invited (the
--            coach's own); CL class row; PX cancelled practice
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000181001', 'coach@meetvis.test',    'authenticated'),
    ('00000000-0000-0000-0000-000000181002', 'invited@meetvis.test',  'authenticated'),
    ('00000000-0000-0000-0000-000000181003', 'other@meetvis.test',    'authenticated'),
    ('00000000-0000-0000-0000-000000181004', 'outsider@meetvis.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000181201', 'Meet Vis Org A', 'college'),
    ('00000000-0000-0000-0000-000000181202', 'Meet Vis Org B', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000181301', 'Meet Vis Team A', 'GMEETVSA', '00000000-0000-0000-0000-000000181201'),
    ('00000000-0000-0000-0000-000000181302', 'Meet Vis Team B', 'GMEETVSB', '00000000-0000-0000-0000-000000181202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000181401', '00000000-0000-0000-0000-000000181001', '00000000-0000-0000-0000-000000181201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000181301', '00000000-0000-0000-0000-000000181401')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000181502', '00000000-0000-0000-0000-000000181002', 'In', 'Vited'),
    ('00000000-0000-0000-0000-000000181503', '00000000-0000-0000-0000-000000181003', 'Not', 'Invited'),
    ('00000000-0000-0000-0000-000000181504', '00000000-0000-0000-0000-000000181004', 'Out', 'Sider')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000181301', '00000000-0000-0000-0000-000000181502', 'active'),
    ('00000000-0000-0000-0000-000000181301', '00000000-0000-0000-0000-000000181503', 'active'),
    ('00000000-0000-0000-0000-000000181302', '00000000-0000-0000-0000-000000181504', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_events (id, team_id, title, event_type, start_time, end_time, cancelled_at, status) VALUES
    ('00000000-0000-0000-0000-000000181601', '00000000-0000-0000-0000-000000181301', 'PR', 'practice', now() + interval '1 day',  now() + interval '1 day 2 hours',  NULL, 'confirmed'),
    ('00000000-0000-0000-0000-000000181602', '00000000-0000-0000-0000-000000181301', 'PI', 'practice', now() + interval '2 days', now() + interval '2 days 2 hours', NULL, 'confirmed'),
    ('00000000-0000-0000-0000-000000181603', '00000000-0000-0000-0000-000000181301', 'M1', 'meeting',  now() + interval '3 days', now() + interval '3 days 1 hour',  NULL, 'confirmed'),
    ('00000000-0000-0000-0000-000000181604', '00000000-0000-0000-0000-000000181301', 'M2', 'meeting',  now() + interval '4 days', now() + interval '4 days 1 hour',  NULL, 'confirmed'),
    ('00000000-0000-0000-0000-000000181605', '00000000-0000-0000-0000-000000181301', 'CL', 'class',    now() + interval '5 days', now() + interval '5 days 1 hour',  NULL, 'confirmed'),
    ('00000000-0000-0000-0000-000000181606', '00000000-0000-0000-0000-000000181301', 'PX', 'practice', now() + interval '6 days', now() + interval '6 days 1 hour',  now(), 'cancelled')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_event_attendance (event_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000181602', '00000000-0000-0000-0000-000000181502', 'pending'),
    ('00000000-0000-0000-0000-000000181603', '00000000-0000-0000-0000-000000181502', 'pending')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Structural
-- ============================================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'golf_player_invited_to_event'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
  ),
  'golf_player_invited_to_event is SECURITY DEFINER with search_path = ""'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.golf_player_invited_to_event(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.golf_player_invited_to_event(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.golf_player_invited_to_event(uuid)', 'EXECUTE'),
  'golf_player_invited_to_event is executable by authenticated and NOT by anon or PUBLIC'
);
SELECT is(
  (SELECT roles::text FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_events' AND policyname = 'golf_events_select_team'),
  '{authenticated}',
  'golf_events_select_team applies to authenticated'
);

-- ============================================================================
-- A player invited to nothing
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000181003", "role": "authenticated"}';
SELECT is(
  (SELECT string_agg(title, ',' ORDER BY title) FROM public.golf_events
    WHERE team_id = '00000000-0000-0000-0000-000000181301'),
  'CL,PI,PR,PX',
  'a player sees the team''s non-meeting events (an invite list does not hide a practice) and no meeting they are not on'
);
SELECT is(
  (SELECT count(*)::int FROM public.golf_event_attendance
    WHERE event_id = '00000000-0000-0000-0000-000000181603'),
  0,
  'the attendance rows of a hidden meeting read as none (and the policies do not recurse)'
);
SELECT throws_ok(
  $$INSERT INTO public.golf_event_attendance (event_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-000000181603', '00000000-0000-0000-0000-000000181503', 'accepted')$$,
  '42501',
  NULL,
  'a player cannot self-RSVP onto a meeting they are not invited to'
);
SELECT lives_ok(
  $$INSERT INTO public.golf_event_attendance (event_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-000000181601', '00000000-0000-0000-0000-000000181503', 'accepted')$$,
  'a player can still self-RSVP to a team-wide event'
);
SELECT is(
  (SELECT string_agg(e->>'title', ',' ORDER BY e->>'title')
     FROM jsonb_array_elements(public.get_player_hub_events(
       '00000000-0000-0000-0000-000000181301',
       '00000000-0000-0000-0000-000000181503',
       now() - interval '1 day')) e),
  'CL,PI,PR',
  'the player hub lists no meeting the player is not on (and no cancelled event)'
);
SELECT throws_ok(
  $$SELECT public.get_player_hub_events(
      '00000000-0000-0000-0000-000000181301',
      '00000000-0000-0000-0000-000000181502',
      now() - interval '1 day')$$,
  '42501',
  NULL,
  'a player cannot read a teammate''s hub (gate unchanged)'
);
RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- The invited player
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000181002", "role": "authenticated"}';
SELECT is(
  (SELECT string_agg(title, ',' ORDER BY title) FROM public.golf_events
    WHERE team_id = '00000000-0000-0000-0000-000000181301'),
  'CL,M1,PI,PR,PX',
  'an invited player sees their meeting, and not the meeting nobody is invited to'
);
SELECT is(
  (SELECT count(*)::int FROM public.golf_event_attendance
    WHERE event_id = '00000000-0000-0000-0000-000000181603'
      AND player_id = '00000000-0000-0000-0000-000000181502'),
  1,
  'an invited player reads their own row on the meeting'
);
SELECT lives_ok(
  $$INSERT INTO public.golf_event_attendance (event_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-000000181603', '00000000-0000-0000-0000-000000181502', 'accepted')
    ON CONFLICT (event_id, player_id) DO UPDATE SET status = EXCLUDED.status$$,
  'an invited player can still upsert their RSVP on the meeting'
);
SELECT ok(
  public.golf_player_invited_to_event('00000000-0000-0000-0000-000000181603')
  AND NOT public.golf_player_invited_to_event('00000000-0000-0000-0000-000000181604'),
  'golf_player_invited_to_event answers for the caller'
);
SELECT is(
  (SELECT string_agg(e->>'title', ',' ORDER BY e->>'title')
     FROM jsonb_array_elements(public.get_player_hub_events(
       '00000000-0000-0000-0000-000000181301',
       '00000000-0000-0000-0000-000000181502',
       now() - interval '1 day')) e),
  'CL,M1,PI,PR',
  'the invited player''s hub lists their meeting'
);
RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- The team's coach
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000181001", "role": "authenticated"}';
SELECT is(
  (SELECT string_agg(title, ',' ORDER BY title) FROM public.golf_events
    WHERE team_id = '00000000-0000-0000-0000-000000181301'),
  'CL,M1,M2,PI,PR,PX',
  'the coach sees every event, every meeting included'
);
SELECT is(
  (SELECT count(*)::int FROM public.golf_event_attendance
    WHERE event_id = '00000000-0000-0000-0000-000000181603'),
  1,
  'the coach reads the meeting''s attendance rows'
);
SELECT is(
  (SELECT string_agg(e->>'title', ',' ORDER BY e->>'title')
     FROM jsonb_array_elements(public.get_player_hub_events(
       '00000000-0000-0000-0000-000000181301',
       '00000000-0000-0000-0000-000000181503',
       now() - interval '1 day')) e),
  'CL,M1,M2,PI,PR',
  'a coach''s hub call is unchanged: every meeting, still no cancelled event'
);
RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- Another team's player
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000181004", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_events
    WHERE team_id = '00000000-0000-0000-0000-000000181301'),
  0,
  'a player of another team sees none of team A''s events'
);
RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
