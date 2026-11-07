-- pgTAP contract for 20261024100300_golf_tournament_player_reveal.sql (held), on top of 4.33's 20261024100000,
-- 20261024100100 and 20261024100200.
--
-- golf_tournament_my_lineup(uuid) is the player's one door to a published lineup: NULL before the coach publishes, for a
-- coach, for another team's player and for anon; after publishing, the caller's own role and spot, and the round lineups
-- only to a player in the lineup. The select-own policy lets a player read their own snapshot row after publishing and
-- nobody else's.
--
-- Plan: 1 grants + 3 before publish + 1 publish + 4 after publish (lineup player) + 3 alternate + 2 outsiders = 14,
-- + 10 for a locked tournament with a substitution (the select-own policy reads snapshot rows, which exist only after a lock).

BEGIN;
\ir _helpers.sql

SELECT plan(24);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000281001', 'coach@tourreveal.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000281002', 'lineup@tourreveal.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000281003', 'bench@tourreveal.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000281004', 'mate@tourreveal.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000281008', 'other@tourreveal.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000281201', 'Reveal Org A', 'college'),
    ('00000000-0000-0000-0000-000000281202', 'Reveal Org B', 'college')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000281301', 'Reveal Team A', 'GREVLTMA', '00000000-0000-0000-0000-000000281201'),
    ('00000000-0000-0000-0000-000000281302', 'Reveal Team B', 'GREVLTMB', '00000000-0000-0000-0000-000000281202')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000281401', '00000000-0000-0000-0000-000000281001', '00000000-0000-0000-0000-000000281201')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000281301', '00000000-0000-0000-0000-000000281401')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000281502', '00000000-0000-0000-0000-000000281002', 'Lineup', 'Player'),
    ('00000000-0000-0000-0000-000000281503', '00000000-0000-0000-0000-000000281003', 'Bench', 'Player'),
    ('00000000-0000-0000-0000-000000281504', '00000000-0000-0000-0000-000000281004', 'Mate', 'Player'),
    ('00000000-0000-0000-0000-000000281508', '00000000-0000-0000-0000-000000281008', 'Other', 'Team')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000281301', '00000000-0000-0000-0000-000000281502', 'active'),
    ('00000000-0000-0000-0000-000000281301', '00000000-0000-0000-0000-000000281503', 'active'),
    ('00000000-0000-0000-0000-000000281301', '00000000-0000-0000-0000-000000281504', 'active'),
    ('00000000-0000-0000-0000-000000281302', '00000000-0000-0000-0000-000000281508', 'active')
  ON CONFLICT DO NOTHING;
END $$;

-- The coach drafts a tournament: one lineup player, a teammate in the lineup, and a bench alternate.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000281001", "role": "authenticated"}';
DO $$
BEGIN
  PERFORM set_config('rv.id', public.golf_tournament_create('{"team_id": "00000000-0000-0000-0000-000000281301", "name": "Reveal Open", "start_date": "2026-11-12", "end_date": "2026-11-12", "rounds": [{"date": "2026-11-12"}]}'::jsonb)::text, true);
  PERFORM public.golf_tournament_set_entries(current_setting('rv.id')::uuid, '[
    {"player_id": "00000000-0000-0000-0000-000000281502", "role": "lineup", "slot": 1},
    {"player_id": "00000000-0000-0000-0000-000000281504", "role": "lineup", "slot": 2},
    {"player_id": "00000000-0000-0000-0000-000000281503", "role": "alternate"}]'::jsonb, NULL);
END $$;

-- Grants (1)
SELECT ok(
  NOT has_function_privilege('anon', 'public.golf_tournament_my_lineup(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.golf_tournament_my_lineup(uuid)', 'EXECUTE'),
  'anon cannot call it; authenticated can'
);

-- Before publishing (3)
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000281002", "role": "authenticated"}';
SELECT is(public.golf_tournament_my_lineup(current_setting('rv.id')::uuid), NULL, 'a lineup player sees nothing before the coach publishes');
SELECT is((SELECT count(*)::int FROM public.golf_tournament_round_lineups), 0, 'and reads no round lineup row');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000281001", "role": "authenticated"}';
SELECT is(public.golf_tournament_my_lineup(current_setting('rv.id')::uuid), NULL, 'a coach is not a player: NULL for them too');

-- The coach publishes.
SELECT lives_ok($$ SELECT public.golf_tournament_publish(current_setting('rv.id')::uuid, NULL) $$, 'the coach publishes');

-- After publishing, a lineup player (4)
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000281002", "role": "authenticated"}';
SELECT is(public.golf_tournament_my_lineup(current_setting('rv.id')::uuid) ->> 'role', 'lineup', 'a lineup player sees their role');
SELECT is((public.golf_tournament_my_lineup(current_setting('rv.id')::uuid) ->> 'slot')::int, 1, 'and their spot');
SELECT is(jsonb_array_length(public.golf_tournament_my_lineup(current_setting('rv.id')::uuid) -> 'rounds' -> 0 -> 'players'), 2, 'and the round lineup (player ids and spots)');
SELECT ok(NOT (public.golf_tournament_my_lineup(current_setting('rv.id')::uuid)::text LIKE '%score%'), 'with no score or note in it');

-- The alternate (3)
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000281003", "role": "authenticated"}';
SELECT is(public.golf_tournament_my_lineup(current_setting('rv.id')::uuid) ->> 'role', 'alternate', 'the alternate sees their role');
SELECT is(public.golf_tournament_my_lineup(current_setting('rv.id')::uuid) -> 'rounds' -> 0 -> 'players', '[]'::jsonb, 'and not the lineup');
SELECT is((SELECT count(*)::int FROM public.golf_tournament_round_lineups), 0, 'and reads no round lineup row (the policy is for the lineup snapshot, own row only)');

-- Outsiders (2)
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000281008", "role": "authenticated"}';
SELECT is(public.golf_tournament_my_lineup(current_setting('rv.id')::uuid), NULL, 'another team’s player gets NULL');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000999999", "role": "authenticated"}';
SELECT is(public.golf_tournament_my_lineup(current_setting('rv.id')::uuid), NULL, 'a signed-in user with no player row gets NULL');

-- ============================================================================
-- A locked tournament with a substitution (10): the per-round role decides, not the published entries.
--   Entries: 502 lineup 1, 504 lineup 2, 503 alternate. Locked. Round 1: 503 in for 502.
-- ============================================================================
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000281001", "role": "authenticated"}';
SELECT lives_ok($$
  DO $d$
  BEGIN
    PERFORM set_config('rv.sub', public.golf_tournament_create('{"team_id": "00000000-0000-0000-0000-000000281301", "name": "Reveal Subs", "substitutions": true, "start_date": "2026-11-20", "end_date": "2026-11-20", "rounds": [{"date": "2026-11-20"}]}'::jsonb)::text, true);
    PERFORM public.golf_tournament_set_entries(current_setting('rv.sub')::uuid, '[
      {"player_id": "00000000-0000-0000-0000-000000281502", "role": "lineup", "slot": 1},
      {"player_id": "00000000-0000-0000-0000-000000281504", "role": "lineup", "slot": 2},
      {"player_id": "00000000-0000-0000-0000-000000281503", "role": "alternate"}]'::jsonb, NULL);
    PERFORM public.golf_tournament_publish(current_setting('rv.sub')::uuid, NULL);
    PERFORM public.golf_tournament_lock_lineup(current_setting('rv.sub')::uuid);
    PERFORM public.golf_tournament_substitute(
      (SELECT round_event_id FROM public.golf_tournament_rounds WHERE tournament_id = current_setting('rv.sub')::uuid AND round_number = 1),
      '00000000-0000-0000-0000-000000281502', '00000000-0000-0000-0000-000000281503');
  END $d$ $$, 'the coach publishes, locks and substitutes the alternate in for a lineup player');

-- The player substituted IN (published as the alternate).
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000281003", "role": "authenticated"}';
SELECT is(public.golf_tournament_my_lineup(current_setting('rv.sub')::uuid) ->> 'role', 'alternate', 'substituted in: the top-level role is the published entry (stale after the swap)');
SELECT is(public.golf_tournament_my_lineup(current_setting('rv.sub')::uuid) -> 'rounds' -> 0 ->> 'my_role', 'lineup', 'substituted in: the round says lineup');
SELECT is(jsonb_array_length(public.golf_tournament_my_lineup(current_setting('rv.sub')::uuid) -> 'rounds' -> 0 -> 'players'), 2, 'substituted in: the round lineup is shown (gated on the round role)');
SELECT is((SELECT count(*)::int FROM public.golf_tournament_round_lineups), 1, 'substituted in: reads exactly their own round lineup row, not a teammate''s');

-- The player substituted OUT (published as lineup).
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000281002", "role": "authenticated"}';
SELECT is(public.golf_tournament_my_lineup(current_setting('rv.sub')::uuid) ->> 'role', 'lineup', 'substituted out: the top-level role is still the published entry (stale)');
SELECT is(public.golf_tournament_my_lineup(current_setting('rv.sub')::uuid) -> 'rounds' -> 0 ->> 'my_role', 'alternate', 'substituted out: the round says alternate');
SELECT is(public.golf_tournament_my_lineup(current_setting('rv.sub')::uuid) -> 'rounds' -> 0 -> 'players', '[]'::jsonb, 'substituted out: no round lineup is shown (a stale lineup role does not leak it)');

-- A teammate still in the lineup reads only their own row, and another team's player none.
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000281004", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_tournament_round_lineups), 1, 'a lineup teammate reads only their own round lineup row');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000281008", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_tournament_round_lineups), 0, 'another team’s player reads none');

SELECT * FROM finish();
ROLLBACK;
