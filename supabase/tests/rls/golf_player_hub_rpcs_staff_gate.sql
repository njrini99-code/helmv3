-- pgTAP contracts for 20261017001000_golf_player_hub_rpcs_staff_gate.sql
-- (security review 2026-10-16, S3).
--
-- get_player_hub_announcements / get_player_hub_events are SECURITY DEFINER,
-- so RLS does not bound them: their own gate is the only control. It used to
-- admit any coach row in the team's ORGANIZATION (an unapproved assistant with
-- no staff row included) and to trust a coach's p_player_id outright.
--
-- Behavioural, as real users through request.jwt.claims. Each refusal is
-- paired with the legitimate read it must not take away:
--   1-2   an org coach with no staff row on the team is refused (the attack)
--   3-4   a staffed coach reads the team for one of its players (kept)
--   5     a staffed coach cannot point it at a player who is not on the team
--   6-7   a player reads their own hub (kept), targeting honoured
--   8-9   a player who names a teammate still gets their OWN hub
--   10    a player not on the team is refused
--   11    anon cannot execute either function
--
-- Plan arithmetic: 11. Counted, not eyeballed: a miscounted plan aborts the
-- runner's loop and skips every later suite.

BEGIN;
\ir _helpers.sql

SELECT plan(11);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000017001001', 'staffed@hubgate.test',   'authenticated'),
    ('00000000-0000-0000-0000-000017001002', 'orgcoach@hubgate.test',  'authenticated'),
    ('00000000-0000-0000-0000-000017001003', 'playera@hubgate.test',   'authenticated'),
    ('00000000-0000-0000-0000-000017001004', 'playerb@hubgate.test',   'authenticated'),
    ('00000000-0000-0000-0000-000017001005', 'outsider@hubgate.test',  'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-000017001101', 'Hub Gate Org', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000017001201', 'Hub Gate Team',  'HUBG0001', '00000000-0000-0000-0000-000017001101'),
    ('00000000-0000-0000-0000-000017001202', 'Hub Gate Other', 'HUBG0002', '00000000-0000-0000-0000-000017001101')
  ON CONFLICT DO NOTHING;

  -- Both coaches are in the team's organization; only the first is staffed.
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000017001301', '00000000-0000-0000-0000-000017001001', '00000000-0000-0000-0000-000017001101'),
    ('00000000-0000-0000-0000-000017001302', '00000000-0000-0000-0000-000017001002', '00000000-0000-0000-0000-000017001101')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id)
    VALUES ('00000000-0000-0000-0000-000017001201', '00000000-0000-0000-0000-000017001301')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000017001401', '00000000-0000-0000-0000-000017001003', 'Player', 'A'),
    ('00000000-0000-0000-0000-000017001402', '00000000-0000-0000-0000-000017001004', 'Player', 'B'),
    ('00000000-0000-0000-0000-000017001403', '00000000-0000-0000-0000-000017001005', 'Out',    'Sider')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000017001201', '00000000-0000-0000-0000-000017001401', 'active'),
    ('00000000-0000-0000-0000-000017001201', '00000000-0000-0000-0000-000017001402', 'active'),
    ('00000000-0000-0000-0000-000017001202', '00000000-0000-0000-0000-000017001403', 'active')
  ON CONFLICT DO NOTHING;

  -- One upcoming event; only player B has replied.
  INSERT INTO public.golf_events (id, team_id, title, event_type, start_time)
    VALUES ('00000000-0000-0000-0000-000017001501', '00000000-0000-0000-0000-000017001201',
            'Hub Gate Practice', 'practice', now() + interval '2 days')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_event_attendance (event_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-000017001501', '00000000-0000-0000-0000-000017001402', 'accepted')
  ON CONFLICT DO NOTHING;

  -- One announcement addressed to player B alone.
  INSERT INTO public.golf_announcements (id, team_id, title, published_at)
    VALUES ('00000000-0000-0000-0000-000017001601', '00000000-0000-0000-0000-000017001201',
            'For B only', now() - interval '1 hour')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_announcement_recipients (announcement_id, player_id)
    VALUES ('00000000-0000-0000-0000-000017001601', '00000000-0000-0000-0000-000017001402')
  ON CONFLICT DO NOTHING;
END $$;

SET LOCAL role TO authenticated;

-- ---------------------------------------------------------------------------
-- The attack: an organization coach with no staff row on the team.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000017001002", "role": "authenticated"}';

SELECT throws_ok(
  $$SELECT public.get_player_hub_events('00000000-0000-0000-0000-000017001201',
      '00000000-0000-0000-0000-000017001402', now() - interval '1 day')$$,
  '42501', NULL,
  'an org coach NOT staffed on the team cannot read its events'
);

SELECT throws_ok(
  $$SELECT public.get_player_hub_announcements('00000000-0000-0000-0000-000017001201',
      '00000000-0000-0000-0000-000017001402')$$,
  '42501', NULL,
  'an org coach NOT staffed on the team cannot read its targeted announcements'
);

-- ---------------------------------------------------------------------------
-- A staffed coach, for one of the team's players.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000017001001", "role": "authenticated"}';

SELECT is(
  (SELECT public.get_player_hub_events('00000000-0000-0000-0000-000017001201',
      '00000000-0000-0000-0000-000017001402', now() - interval '1 day') -> 0 ->> 'rsvp_status'),
  'accepted',
  'a staffed coach reads the team''s events with player B''s reply'
);

SELECT is(
  jsonb_array_length(public.get_player_hub_announcements('00000000-0000-0000-0000-000017001201',
      '00000000-0000-0000-0000-000017001402')),
  1,
  'a staffed coach reads the announcement addressed to player B, for player B'
);

SELECT throws_ok(
  $$SELECT public.get_player_hub_events('00000000-0000-0000-0000-000017001201',
      '00000000-0000-0000-0000-000017001403', now() - interval '1 day')$$,
  '42501', NULL,
  'a staffed coach cannot name a player who is not on the team'
);

-- ---------------------------------------------------------------------------
-- Players.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000017001004", "role": "authenticated"}';

SELECT is(
  (SELECT public.get_player_hub_events('00000000-0000-0000-0000-000017001201',
      '00000000-0000-0000-0000-000017001402', now() - interval '1 day') -> 0 ->> 'rsvp_status'),
  'accepted',
  'player B reads their own hub, with their own reply'
);

SELECT is(
  jsonb_array_length(public.get_player_hub_announcements('00000000-0000-0000-0000-000017001201',
      '00000000-0000-0000-0000-000017001402')),
  1,
  'player B sees the announcement addressed to them'
);

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000017001003", "role": "authenticated"}';

SELECT is(
  (SELECT public.get_player_hub_events('00000000-0000-0000-0000-000017001201',
      '00000000-0000-0000-0000-000017001402', now() - interval '1 day') -> 0 ->> 'rsvp_status'),
  NULL,
  'player A naming player B gets their OWN hub: no reply, not B''s'
);

SELECT is(
  jsonb_array_length(public.get_player_hub_announcements('00000000-0000-0000-0000-000017001201',
      '00000000-0000-0000-0000-000017001402')),
  0,
  'player A naming player B does not see the announcement addressed to B'
);

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000017001005", "role": "authenticated"}';

SELECT throws_ok(
  $$SELECT public.get_player_hub_events('00000000-0000-0000-0000-000017001201',
      '00000000-0000-0000-0000-000017001403', now() - interval '1 day')$$,
  '42501', NULL,
  'a player on another team is refused'
);

RESET role;

SELECT ok(
  NOT has_function_privilege('anon', 'public.get_player_hub_announcements(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_player_hub_events(uuid, uuid, timestamp with time zone)', 'EXECUTE'),
  'anon cannot execute either player-hub function'
);

SELECT * FROM finish();
ROLLBACK;
