-- pgTAP contract for 20261117120000_golf_coach_reads.sql (CoachHelm reads, held).
--
-- A read is coach-only: the team's coach reads it (table and the current view); the player it is about does not
-- (their own card is served by a server read that removes the team block); a coach of another team does not; anon
-- holds nothing; authenticated cannot write.
--
-- Plan arithmetic: 3 structure + 2 coach + 2 player + 2 other coach + 2 anon + 1 no insert + 1 view latest = 13.

BEGIN;
\ir _helpers.sql

SELECT plan(13);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000917001', 'coach@reads.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000917002', 'other@reads.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000917003', 'player@reads.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000917201', 'Reads Org', 'college'),
    ('00000000-0000-0000-0000-000000917202', 'Other Reads Org', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000917301', 'Reads Team', 'GREADS1', '00000000-0000-0000-0000-000000917201'),
    ('00000000-0000-0000-0000-000000917302', 'Other Reads Team', 'GREADS2', '00000000-0000-0000-0000-000000917202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000917401', '00000000-0000-0000-0000-000000917001', '00000000-0000-0000-0000-000000917201'),
    ('00000000-0000-0000-0000-000000917402', '00000000-0000-0000-0000-000000917002', '00000000-0000-0000-0000-000000917202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000917301', '00000000-0000-0000-0000-000000917401'),
    ('00000000-0000-0000-0000-000000917302', '00000000-0000-0000-0000-000000917402')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000917503', '00000000-0000-0000-0000-000000917003', 'Read', 'Player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000917301', '00000000-0000-0000-0000-000000917503', 'active')
  ON CONFLICT DO NOTHING;

  -- Two reads of the same player: the view shows the newer one.
  INSERT INTO public.golf_coach_reads (id, team_id, player_id, computed_at, n_rounds, analyst_version, content_hash, payload, trigger) VALUES
    ('00000000-0000-0000-0000-000000917601', '00000000-0000-0000-0000-000000917301', '00000000-0000-0000-0000-000000917503', now() - interval '2 days', 5, 'reads-1', 'old', '{"version":1}', 'nightly'),
    ('00000000-0000-0000-0000-000000917602', '00000000-0000-0000-0000-000000917301', '00000000-0000-0000-0000-000000917503', now(), 6, 'reads-1', 'new', '{"version":1}', 'round');
END $$;

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_coach_reads'::regclass), 'RLS is on for golf_coach_reads');
SELECT policies_are('public', 'golf_coach_reads', ARRAY['golf_coach_reads_select_team_coach'], 'one policy: the team''s coaches read');
SELECT ok(
  (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_coach_reads' AND policyname = 'golf_coach_reads_select_team_coach') LIKE '%is_team_coach(team_id)%',
  'the read policy is is_team_coach(team_id)');

SET LOCAL role TO authenticated;

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000917001", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_coach_reads WHERE player_id = '00000000-0000-0000-0000-000000917503'), 2, 'the team''s coach reads the player''s reads');
SELECT is((SELECT count(*)::int FROM public.golf_coach_reads_current WHERE player_id = '00000000-0000-0000-0000-000000917503'), 1, 'the team''s coach reads one current read');
SELECT is((SELECT content_hash FROM public.golf_coach_reads_current WHERE player_id = '00000000-0000-0000-0000-000000917503'), 'new', 'the current read is the newest');

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000917003", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_coach_reads WHERE player_id = '00000000-0000-0000-0000-000000917503'), 0, 'the player cannot read their own read row');
SELECT is((SELECT count(*)::int FROM public.golf_coach_reads_current WHERE player_id = '00000000-0000-0000-0000-000000917503'), 0, 'nor through the current view');

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000917002", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_coach_reads), 0, 'a coach of another team reads nothing');
SELECT is((SELECT count(*)::int FROM public.golf_coach_reads_current), 0, 'nor through the current view');

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000917001", "role": "authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.golf_coach_reads (team_id, player_id, n_rounds, analyst_version, content_hash, payload, trigger)
    VALUES ('00000000-0000-0000-0000-000000917301', '00000000-0000-0000-0000-000000917503', 1, 'reads-1', 'x', '{}', 'manual')$$,
  '42501', NULL, 'even the team''s coach cannot write a read (service role only)');

RESET role;
SELECT ok(NOT has_table_privilege('anon', 'public.golf_coach_reads', 'SELECT'), 'anon cannot read golf_coach_reads');
SELECT ok(NOT has_table_privilege('anon', 'public.golf_coach_reads_current', 'SELECT'), 'anon cannot read the current view');

SELECT * FROM finish();
ROLLBACK;
