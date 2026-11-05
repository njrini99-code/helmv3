-- pgTAP contract for 20261105100000_golf_players_coach_reads_inactive_members.sql.
--
-- A coach reads the profile of their own team's inactive member, so Roster can
-- list them and mark them active again. A coach of another team does not, and
-- neither does a teammate.
--
-- Plan arithmetic: 1 own coach + 1 other coach + 1 teammate = 3.

BEGIN;
\ir _helpers.sql

SELECT plan(3);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000183001', 'coach@inactive.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000183002', 'other@inactive.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000183003', 'gone@inactive.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000183004', 'mate@inactive.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000183201', 'Inactive Org', 'college'),
    ('00000000-0000-0000-0000-000000183202', 'Other Org', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000183301', 'Inactive Team', 'GINACT1', '00000000-0000-0000-0000-000000183201'),
    ('00000000-0000-0000-0000-000000183302', 'Other Team', 'GINACT2', '00000000-0000-0000-0000-000000183202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000183401', '00000000-0000-0000-0000-000000183001', '00000000-0000-0000-0000-000000183201'),
    ('00000000-0000-0000-0000-000000183402', '00000000-0000-0000-0000-000000183002', '00000000-0000-0000-0000-000000183202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000183301', '00000000-0000-0000-0000-000000183401'),
    ('00000000-0000-0000-0000-000000183302', '00000000-0000-0000-0000-000000183402')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000183503', '00000000-0000-0000-0000-000000183003', 'Gone', 'Player'),
    ('00000000-0000-0000-0000-000000183504', '00000000-0000-0000-0000-000000183004', 'Team', 'Mate')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000183301', '00000000-0000-0000-0000-000000183503', 'inactive'),
    ('00000000-0000-0000-0000-000000183301', '00000000-0000-0000-0000-000000183504', 'active')
  ON CONFLICT DO NOTHING;
END $$;

SET LOCAL role TO authenticated;

SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000183001", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_players
    WHERE id = '00000000-0000-0000-0000-000000183503'),
  1,
  'the team''s coach reads an inactive member''s profile'
);

SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000183002", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_players
    WHERE id = '00000000-0000-0000-0000-000000183503'),
  0,
  'a coach of another team does not'
);

SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000183004", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_players
    WHERE id = '00000000-0000-0000-0000-000000183503'),
  0,
  'a teammate does not'
);

SELECT * FROM finish();
ROLLBACK;
