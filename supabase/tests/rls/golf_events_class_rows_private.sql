-- pgTAP contract for class-row privacy on golf_events and in
-- public.get_player_hub_events
-- (20261031142000_golf_events_class_rows_private.sql and
-- 20261105090000_golf_player_hub_events_class_rows.sql).
--
-- A class row is one player's own timetable. The owner reads it, a teammate
-- does not, by a direct read or through the hub RPC. The coach reads it. Other
-- event types stay visible to the team.
--
-- Plan arithmetic: 2 owner + 2 teammate + 2 coach = 6.

BEGIN;
\ir _helpers.sql

SELECT plan(6);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000182001', 'coach@classpriv.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000182002', 'owner@classpriv.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000182003', 'mate@classpriv.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000182201', 'Class Privacy Org', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000182301', 'Class Privacy Team', 'GCLSPRIV', '00000000-0000-0000-0000-000000182201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000182401', '00000000-0000-0000-0000-000000182001', '00000000-0000-0000-0000-000000182201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000182301', '00000000-0000-0000-0000-000000182401')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000182502', '00000000-0000-0000-0000-000000182002', 'Own', 'Er'),
    ('00000000-0000-0000-0000-000000182503', '00000000-0000-0000-0000-000000182003', 'Team', 'Mate')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000182301', '00000000-0000-0000-0000-000000182502', 'active'),
    ('00000000-0000-0000-0000-000000182301', '00000000-0000-0000-0000-000000182503', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_player_classes (id, player_id, class_name) VALUES
    ('00000000-0000-0000-0000-000000182701', '00000000-0000-0000-0000-000000182502', 'CHEM 101')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_events (id, team_id, title, description, event_type, start_time, end_time, status) VALUES
    ('00000000-0000-0000-0000-000000182601', '00000000-0000-0000-0000-000000182301', 'CLS',
     '[class:00000000-0000-0000-0000-000000182701]', 'class',
     now() + interval '1 day', now() + interval '1 day 1 hour', 'scheduled'),
    ('00000000-0000-0000-0000-000000182602', '00000000-0000-0000-0000-000000182301', 'PR',
     NULL, 'practice',
     now() + interval '2 days', now() + interval '2 days 1 hour', 'scheduled')
  ON CONFLICT DO NOTHING;
END $$;

SET LOCAL role TO authenticated;

-- The owner
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000182002", "role": "authenticated"}';
SELECT is(
  (SELECT string_agg(title, ',' ORDER BY title) FROM public.golf_events
    WHERE team_id = '00000000-0000-0000-0000-000000182301'),
  'CLS,PR',
  'the owner reads their own class row'
);
SELECT is(
  (SELECT string_agg(e->>'title', ',' ORDER BY e->>'title')
     FROM jsonb_array_elements(public.get_player_hub_events(
       '00000000-0000-0000-0000-000000182301',
       '00000000-0000-0000-0000-000000182502',
       now() - interval '1 day')) e),
  'CLS,PR',
  'the hub lists the owner''s own class row'
);

-- A teammate
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000182003", "role": "authenticated"}';
SELECT is(
  (SELECT string_agg(title, ',' ORDER BY title) FROM public.golf_events
    WHERE team_id = '00000000-0000-0000-0000-000000182301'),
  'PR',
  'a teammate cannot read the class row directly'
);
SELECT is(
  (SELECT string_agg(e->>'title', ',' ORDER BY e->>'title')
     FROM jsonb_array_elements(public.get_player_hub_events(
       '00000000-0000-0000-0000-000000182301',
       '00000000-0000-0000-0000-000000182503',
       now() - interval '1 day')) e),
  'PR',
  'a teammate cannot read the class row through the hub'
);

-- The coach
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000182001", "role": "authenticated"}';
SELECT is(
  (SELECT string_agg(title, ',' ORDER BY title) FROM public.golf_events
    WHERE team_id = '00000000-0000-0000-0000-000000182301'),
  'CLS,PR',
  'the coach reads the class row'
);
SELECT is(
  (SELECT string_agg(e->>'title', ',' ORDER BY e->>'title')
     FROM jsonb_array_elements(public.get_player_hub_events(
       '00000000-0000-0000-0000-000000182301',
       '00000000-0000-0000-0000-000000182503',
       now() - interval '1 day')) e),
  'CLS,PR',
  'the coach reads the class row through the hub'
);

SELECT * FROM finish();
ROLLBACK;
