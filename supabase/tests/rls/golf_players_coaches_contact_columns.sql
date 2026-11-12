-- pgTAP contract for 20261112090000_golf_players_coaches_contact_columns.sql (held).
--
-- e-mail and phone on golf_players and golf_coaches are not readable by `authenticated` through the tables; the other columns
-- are. golf_player_contacts(uuid[]) gives a player their own row only, and a staffed coach the players active or inactive on
-- their team plus pending applicants; never a teammate's, never another team's, never anon.
--
-- Plan: 6 grants + 6 as a player + 4 as the coach + 1 as anon = 17. Before the migration the 4 column-privilege checks,
-- the function check and the 3 refused reads as a player fail, and the first call of the missing function stops the run.

BEGIN;
\ir _helpers.sql

SELECT plan(17);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000c7a001', 'coach@contactcols.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000c7a002', 'me@contactcols.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000c7a003', 'mate@contactcols.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000c7a004', 'benched@contactcols.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000c7a005', 'applicant@contactcols.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000c7a008', 'other@contactcols.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000c7b001', 'Contact Org A', 'college'),
    ('00000000-0000-0000-0000-000000c7b002', 'Contact Org B', 'college')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000c7c001', 'Contact Team A', 'GCNTCTA1', '00000000-0000-0000-0000-000000c7b001'),
    ('00000000-0000-0000-0000-000000c7c002', 'Contact Team B', 'GCNTCTB1', '00000000-0000-0000-0000-000000c7b002')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id, organization_id, full_name, email, phone) VALUES
    ('00000000-0000-0000-0000-000000c7d001', '00000000-0000-0000-0000-000000c7a001', '00000000-0000-0000-0000-000000c7b001',
     'Coach Contact', 'coach@contactcols.test', '555-0100')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000c7c001', '00000000-0000-0000-0000-000000c7d001')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id, first_name, last_name, email, phone) VALUES
    ('00000000-0000-0000-0000-000000c7e002', '00000000-0000-0000-0000-000000c7a002', 'Me', 'Player', 'me@contactcols.test', '555-0102'),
    ('00000000-0000-0000-0000-000000c7e003', '00000000-0000-0000-0000-000000c7a003', 'Mate', 'Player', 'mate@contactcols.test', '555-0103'),
    ('00000000-0000-0000-0000-000000c7e004', '00000000-0000-0000-0000-000000c7a004', 'Benched', 'Player', 'benched@contactcols.test', '555-0104'),
    ('00000000-0000-0000-0000-000000c7e005', '00000000-0000-0000-0000-000000c7a005', 'Applicant', 'Player', 'applicant@contactcols.test', '555-0105'),
    ('00000000-0000-0000-0000-000000c7e008', '00000000-0000-0000-0000-000000c7a008', 'Other', 'Team', 'other@contactcols.test', '555-0108')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000c7c001', '00000000-0000-0000-0000-000000c7e002', 'active'),
    ('00000000-0000-0000-0000-000000c7c001', '00000000-0000-0000-0000-000000c7e003', 'active'),
    ('00000000-0000-0000-0000-000000c7c001', '00000000-0000-0000-0000-000000c7e004', 'inactive'),
    ('00000000-0000-0000-0000-000000c7c002', '00000000-0000-0000-0000-000000c7e008', 'active')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_join_requests (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000c7c001', '00000000-0000-0000-0000-000000c7e005', 'pending')
  ON CONFLICT DO NOTHING;
END $$;

-- Grants -------------------------------------------------------------------------------------------------------------
SELECT ok(NOT has_column_privilege('authenticated', 'public.golf_players', 'email', 'SELECT'), 'authenticated cannot read golf_players.email');
SELECT ok(NOT has_column_privilege('authenticated', 'public.golf_players', 'phone', 'SELECT'), 'authenticated cannot read golf_players.phone');
SELECT ok(NOT has_column_privilege('authenticated', 'public.golf_coaches', 'email', 'SELECT'), 'authenticated cannot read golf_coaches.email');
SELECT ok(NOT has_column_privilege('authenticated', 'public.golf_coaches', 'phone', 'SELECT'), 'authenticated cannot read golf_coaches.phone');
SELECT ok(
  has_column_privilege('authenticated', 'public.golf_players', 'first_name', 'SELECT')
  AND has_column_privilege('authenticated', 'public.golf_players', 'handicap_index', 'SELECT')
  AND has_column_privilege('authenticated', 'public.golf_coaches', 'full_name', 'SELECT')
  AND has_column_privilege('authenticated', 'public.golf_coaches', 'organization_id', 'SELECT'),
  'every other column stays readable');
SELECT has_function('public', 'golf_player_contacts', ARRAY['uuid[]'], 'golf_player_contacts(uuid[]) exists');

-- As a player on team A ----------------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000c7a002", "role": "authenticated"}';
SELECT throws_ok(
  $$SELECT email FROM public.golf_players WHERE id = '00000000-0000-0000-0000-000000c7e003'$$,
  '42501', NULL, 'a player cannot read a teammate''s e-mail from the table');
SELECT throws_ok(
  $$SELECT phone FROM public.golf_players WHERE id = '00000000-0000-0000-0000-000000c7e003'$$,
  '42501', NULL, 'nor their phone');
SELECT throws_ok(
  $$SELECT * FROM public.golf_players$$,
  '42501', NULL, 'nor the whole row');
SELECT is(
  (SELECT first_name FROM public.golf_players WHERE id = '00000000-0000-0000-0000-000000c7e003'),
  'Mate', 'the teammate''s name is still readable (the row policy is unchanged)');
SELECT is(
  (SELECT array_agg(email ORDER BY email) FROM public.golf_player_contacts(ARRAY[
    '00000000-0000-0000-0000-000000c7e002', '00000000-0000-0000-0000-000000c7e003', '00000000-0000-0000-0000-000000c7e008']::uuid[])),
  ARRAY['me@contactcols.test']::text[], 'golf_player_contacts gives a player their own e-mail and no one else''s');
SELECT throws_ok(
  $$SELECT email FROM public.golf_coaches$$,
  '42501', NULL, 'a player cannot read coaches'' e-mail');

-- As the coach of team A ---------------------------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000c7a001", "role": "authenticated"}';
SELECT is(
  (SELECT array_agg(email ORDER BY email) FROM public.golf_player_contacts(ARRAY[
    '00000000-0000-0000-0000-000000c7e002', '00000000-0000-0000-0000-000000c7e003', '00000000-0000-0000-0000-000000c7e004',
    '00000000-0000-0000-0000-000000c7e005', '00000000-0000-0000-0000-000000c7e008']::uuid[])),
  ARRAY['applicant@contactcols.test', 'benched@contactcols.test', 'mate@contactcols.test', 'me@contactcols.test']::text[],
  'the coach gets active, inactive and applying players of their team');
SELECT is(
  (SELECT phone FROM public.golf_player_contacts(ARRAY['00000000-0000-0000-0000-000000c7e002']::uuid[])),
  '555-0102', 'and their phone');
SELECT is(
  (SELECT count(*)::int FROM public.golf_player_contacts(ARRAY['00000000-0000-0000-0000-000000c7e008']::uuid[])),
  0, 'but nothing of another team''s player');
SELECT throws_ok(
  $$SELECT email FROM public.golf_coaches WHERE id = '00000000-0000-0000-0000-000000c7d001'$$,
  '42501', NULL, 'a coach reads their own e-mail from auth, not from the table');

-- As anon ------------------------------------------------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims TO '{"role": "anon"}';
SELECT throws_ok(
  $$SELECT * FROM public.golf_player_contacts(ARRAY['00000000-0000-0000-0000-000000c7e002']::uuid[])$$,
  '42501', NULL, 'anon cannot call golf_player_contacts');

SELECT * FROM finish();
ROLLBACK;
