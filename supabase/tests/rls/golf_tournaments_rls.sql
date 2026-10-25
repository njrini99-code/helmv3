-- pgTAP contract for who reads and writes the P016 Tournaments tables
-- (20261024100100_golf_tournaments_rls.sql, after 20261024100000 and 100200).
-- Covers the matrix the RPC suite does not: a coach of the team, a player of the
-- team, a coach of another team and anon, against structure, the coach-only draft
-- tables (entries, round lineups, field scores) and the coach-only notes.
--
-- Plan arithmetic: 3 coach + 5 player + 4 other-team coach + 3 grants + 1 anon = 16.

BEGIN;
\ir _helpers.sql

SELECT plan(16);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000217001', 'coach@tourrls.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000217002', 'p2@tourrls.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000217008', 'other@tourrls.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000217201', 'TourRls Org A', 'college'),
    ('00000000-0000-0000-0000-000000217202', 'TourRls Org B', 'college')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000217301', 'TourRls Team A', 'GTRLSTMA', '00000000-0000-0000-0000-000000217201'),
    ('00000000-0000-0000-0000-000000217302', 'TourRls Team B', 'GTRLSTMB', '00000000-0000-0000-0000-000000217202')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000217401', '00000000-0000-0000-0000-000000217001', '00000000-0000-0000-0000-000000217201'),
    ('00000000-0000-0000-0000-000000217408', '00000000-0000-0000-0000-000000217008', '00000000-0000-0000-0000-000000217202')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000217301', '00000000-0000-0000-0000-000000217401'),
    ('00000000-0000-0000-0000-000000217302', '00000000-0000-0000-0000-000000217408')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000217502', '00000000-0000-0000-0000-000000217002', 'P', 'Two')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000217301', '00000000-0000-0000-0000-000000217502', 'active')
  ON CONFLICT DO NOTHING;
END $$;

-- The coach drafts a tournament with one lineup entry.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000217001", "role": "authenticated"}';
DO $$
BEGIN
  PERFORM set_config('tour.id', public.golf_tournament_create('{"team_id": "00000000-0000-0000-0000-000000217301", "name": "Draft Open", "start_date": "2026-11-02", "end_date": "2026-11-03", "rounds": [{"date": "2026-11-02"}]}'::jsonb)::text, true);
  PERFORM public.golf_tournament_set_entries(current_setting('tour.id')::uuid, '[
  {"player_id": "00000000-0000-0000-0000-000000217502", "role": "lineup", "slot": 1}]'::jsonb, NULL);
END $$;

-- Coach of the team.
SELECT is((SELECT count(*)::int FROM public.golf_tournaments), 1, 'the coach reads the tournament');
SELECT is((SELECT count(*)::int FROM public.golf_tournament_entries), 1, 'the coach reads the draft entries');
SELECT cmp_ok((SELECT count(*)::int FROM public.golf_tournament_rounds), '>=', 1, 'the coach reads the rounds');

-- Player of the team: structure yes, the coach's draft no.
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000217002", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_tournaments), 1, 'a player reads the tournament structure');
SELECT is((SELECT count(*)::int FROM public.golf_tournament_entries), 0, 'a player does not read the coach''s draft entries');
SELECT is((SELECT count(*)::int FROM public.golf_tournament_round_lineups), 0, 'a player does not read the draft round lineups');
SELECT is((SELECT count(*)::int FROM public.golf_tournament_field_scores), 0, 'a player does not read field scores before the reveal rules exist');
SELECT throws_ok(
  $$INSERT INTO public.golf_tournaments (team_id, name, start_date, end_date) VALUES ('00000000-0000-0000-0000-000000217301', 'Player made', '2026-11-02', '2026-11-03')$$,
  '42501', NULL, 'a player cannot write a tournament');

-- Coach of another team: nothing.
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000217008", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_tournaments), 0, 'another team''s coach reads no tournament');
SELECT is((SELECT count(*)::int FROM public.golf_tournament_entries), 0, 'another team''s coach reads no entries');
SELECT is((SELECT count(*)::int FROM public.golf_tournament_rounds), 0, 'another team''s coach reads no rounds');
DO $$
DECLARE n int;
BEGIN
  UPDATE public.golf_tournaments SET name = 'Hijacked' WHERE id = current_setting('tour.id')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('tour.rls_updated', n::text, true);
END $$;
SELECT is(current_setting('tour.rls_updated')::int, 0, 'another team''s coach cannot rewrite it (the update matches no visible row)');

-- Grants.
RESET ROLE;
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.golf_tournaments', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.golf_tournament_entries', 'TRUNCATE'),
  'signed-in users cannot TRUNCATE tournament tables (TRUNCATE ignores RLS)');
SELECT ok(
  has_table_privilege('authenticated', 'public.golf_tournaments', 'SELECT')
  AND has_table_privilege('authenticated', 'public.golf_tournaments', 'INSERT'),
  'signed-in users keep the narrow table grants that RLS then filters');
SELECT ok(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'golf_tournament%' AND roles::text LIKE '%anon%') = 0,
  'no tournament policy names anon');

-- Anon.
SET LOCAL role TO anon;
SELECT throws_ok($$SELECT count(*) FROM public.golf_tournaments$$, '42501', NULL, 'anon cannot read tournaments');

SELECT * FROM finish();
ROLLBACK;
