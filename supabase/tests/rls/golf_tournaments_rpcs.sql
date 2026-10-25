-- pgTAP contract for the P016 Tournaments write RPCs and the lineup guard
-- (20261024100200_golf_tournaments_rpcs.sql, after 20261024100000 and
-- 20261024100100). Held: these run only on a stack that has the three files
-- applied (npm run test:rls). WRITTEN; run on a scratch Postgres 16 with stub
-- live tables and a pgTAP shim where it was authored (no Docker), not yet
-- through test:rls.
--
-- Cases: every RPC is SECURITY INVOKER with search_path = '' and not
-- executable by anon; a non-coach is refused (not_coach); an edit made on an
-- old version is refused (stale) and the current one passes; after lock the
-- guard refuses an entry or snapshot change (locked) while a substitution
-- passes; a round cannot start before the one before it (round_order); a
-- delete with a linked GolfHelm round is refused (rounds_linked) until told
-- to unlink, and then removes the owned round-day event but never the
-- golf_rounds row.
--
-- Plan arithmetic: 3 structural + 2 not_coach + 2 stale + 4 lock and guard
-- + 1 round_order + 4 delete = 16.

BEGIN;
\ir _helpers.sql

SELECT plan(16);

-- ============================================================================
-- Seed. Ids use the 0000...0216xxx range.
--   users: coach 01 (team A); player 02, 03, 04, 05, 06, 07 on team A
--          (06 is the alternate); outsider coach 08 (team B)
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000216001', 'coach@tour.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000216002', 'p2@tour.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000216003', 'p3@tour.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000216004', 'p4@tour.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000216005', 'p5@tour.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000216006', 'p6@tour.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000216007', 'p7@tour.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000216008', 'other@tour.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000216201', 'Tour Org A', 'college'),
    ('00000000-0000-0000-0000-000000216202', 'Tour Org B', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000216301', 'Tour Team A', 'GTOURTMA', '00000000-0000-0000-0000-000000216201'),
    ('00000000-0000-0000-0000-000000216302', 'Tour Team B', 'GTOURTMB', '00000000-0000-0000-0000-000000216202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000216401', '00000000-0000-0000-0000-000000216001', '00000000-0000-0000-0000-000000216201'),
    ('00000000-0000-0000-0000-000000216408', '00000000-0000-0000-0000-000000216008', '00000000-0000-0000-0000-000000216202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000216301', '00000000-0000-0000-0000-000000216401'),
    ('00000000-0000-0000-0000-000000216302', '00000000-0000-0000-0000-000000216408')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000216502', '00000000-0000-0000-0000-000000216002', 'P', 'Two'),
    ('00000000-0000-0000-0000-000000216503', '00000000-0000-0000-0000-000000216003', 'P', 'Three'),
    ('00000000-0000-0000-0000-000000216504', '00000000-0000-0000-0000-000000216004', 'P', 'Four'),
    ('00000000-0000-0000-0000-000000216505', '00000000-0000-0000-0000-000000216005', 'P', 'Five'),
    ('00000000-0000-0000-0000-000000216506', '00000000-0000-0000-0000-000000216006', 'P', 'Six'),
    ('00000000-0000-0000-0000-000000216507', '00000000-0000-0000-0000-000000216007', 'P', 'Seven')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000216301', '00000000-0000-0000-0000-000000216502', 'active'),
    ('00000000-0000-0000-0000-000000216301', '00000000-0000-0000-0000-000000216503', 'active'),
    ('00000000-0000-0000-0000-000000216301', '00000000-0000-0000-0000-000000216504', 'active'),
    ('00000000-0000-0000-0000-000000216301', '00000000-0000-0000-0000-000000216505', 'active'),
    ('00000000-0000-0000-0000-000000216301', '00000000-0000-0000-0000-000000216506', 'active'),
    ('00000000-0000-0000-0000-000000216301', '00000000-0000-0000-0000-000000216507', 'active')
  ON CONFLICT DO NOTHING;

  -- An in-progress GolfHelm round of player 02 (a completed row cannot be
  -- inserted directly: the round lifecycle guard), linked further down.
  INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, status) VALUES
    ('00000000-0000-0000-0000-000000216701', '00000000-0000-0000-0000-000000216502',
     '00000000-0000-0000-0000-000000216301', current_date, 'in_progress')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Structural
-- ============================================================================
SELECT is(
  (SELECT count(*)::int FROM unnest(ARRAY[
      'public.golf_tournament_create(jsonb)',
      'public.golf_tournament_update(uuid, jsonb, integer)',
      'public.golf_tournament_delete(uuid, boolean)',
      'public.golf_tournament_set_entries(uuid, jsonb, integer)',
      'public.golf_tournament_lock_lineup(uuid)',
      'public.golf_tournament_substitute(uuid, uuid, uuid)',
      'public.golf_tournament_set_round_status(uuid, text, text)',
      'public.golf_tournament_mark(uuid, text, text)',
      'public.golf_tournament_publish(uuid, timestamptz)',
      'public.golf_tournament_link_candidates(uuid)']) AS f(sig)
    JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
    WHERE NOT p.prosecdef AND p.proconfig = ARRAY['search_path=""']
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('public', p.oid, 'EXECUTE')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  10,
  'the ten RPCs exist, are SECURITY INVOKER with search_path = "", and only authenticated (not anon or PUBLIC) executes them'
);
SELECT ok(
  (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure('helm_private.guard_tournament_lineup()'))
  AND NOT has_function_privilege('authenticated', 'helm_private.guard_tournament_lineup()', 'EXECUTE'),
  'the lineup guard is SECURITY DEFINER and not callable by authenticated'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'golf_tournament_entries_lineup_guard')
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'golf_tournament_round_lineups_lineup_guard'),
  'the lineup guard is on entries and round lineups'
);

-- ============================================================================
-- Not a coach of the team
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000216002", "role": "authenticated"}';
SELECT throws_ok(
  $$SELECT public.golf_tournament_create('{"team_id": "00000000-0000-0000-0000-000000216301", "name": "Player made", "start_date": "2026-11-02", "end_date": "2026-11-03", "rounds": [{"date": "2026-11-02"}]}'::jsonb)$$,
  'P0001', 'not_coach',
  'a player cannot create a tournament'
);
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000216008", "role": "authenticated"}';
SELECT throws_ok(
  $$SELECT public.golf_tournament_create('{"team_id": "00000000-0000-0000-0000-000000216301", "name": "Other coach", "start_date": "2026-11-02", "end_date": "2026-11-03", "rounds": [{"date": "2026-11-02"}]}'::jsonb)$$,
  'P0001', 'not_coach',
  'another team''s coach cannot create one for this team'
);

-- ============================================================================
-- The coach: create, then compare-and-set
-- ============================================================================
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000216001", "role": "authenticated"}';
DO $$
BEGIN
  PERFORM set_config('tour.id', public.golf_tournament_create('{"team_id": "00000000-0000-0000-0000-000000216301", "name": "Oakmont Fall Classic", "start_date": "2026-11-02", "end_date": "2026-11-03", "substitutions": true, "rounds": [{"date": "2026-11-02"}, {"date": "2026-11-03"}]}'::jsonb)::text, true);
END $$;

SELECT throws_ok(
  $$SELECT public.golf_tournament_update(current_setting('tour.id')::uuid, '{"name": "Renamed"}'::jsonb, 0)$$,
  'P0001', 'stale',
  'an edit made on an old version is refused as stale'
);
SELECT is(
  public.golf_tournament_update(current_setting('tour.id')::uuid, '{"name": "Oakmont Classic"}'::jsonb,
    (SELECT version FROM public.golf_tournaments WHERE id = current_setting('tour.id')::uuid)),
  2,
  'an edit on the current version passes and moves the version'
);

-- ============================================================================
-- Lineup, lock and the guard
-- ============================================================================
DO $$
BEGIN
  PERFORM public.golf_tournament_set_entries(current_setting('tour.id')::uuid, '[
  {"player_id": "00000000-0000-0000-0000-000000216502", "role": "lineup", "slot": 1},
  {"player_id": "00000000-0000-0000-0000-000000216503", "role": "lineup", "slot": 2},
  {"player_id": "00000000-0000-0000-0000-000000216504", "role": "lineup", "slot": 3},
  {"player_id": "00000000-0000-0000-0000-000000216505", "role": "lineup", "slot": 4},
  {"player_id": "00000000-0000-0000-0000-000000216507", "role": "lineup", "slot": 5},
  {"player_id": "00000000-0000-0000-0000-000000216506", "role": "alternate"}]'::jsonb, NULL);
  PERFORM public.golf_tournament_lock_lineup(current_setting('tour.id')::uuid);
END $$;

SELECT throws_ok(
  $$UPDATE public.golf_tournament_entries SET slot = 6
    WHERE tournament_id = current_setting('tour.id')::uuid AND player_id = '00000000-0000-0000-0000-000000216507'$$,
  'P0001', 'locked',
  'after lock an entry cannot be changed directly'
);
SELECT throws_ok(
  $$DELETE FROM public.golf_tournament_round_lineups
    WHERE player_id = '00000000-0000-0000-0000-000000216503'
      AND round_event_id IN (SELECT round_event_id FROM public.golf_tournament_rounds WHERE tournament_id = current_setting('tour.id')::uuid)$$,
  'P0001', 'locked',
  'after lock the round snapshot cannot be changed directly'
);
SELECT lives_ok(
  $$SELECT public.golf_tournament_substitute(
      (SELECT round_event_id FROM public.golf_tournament_rounds WHERE tournament_id = current_setting('tour.id')::uuid AND round_number = 1),
      '00000000-0000-0000-0000-000000216507', '00000000-0000-0000-0000-000000216506')$$,
  'a substitution passes the guard'
);
SELECT is(
  (SELECT count(*)::int FROM public.golf_tournament_round_lineups rl
    JOIN public.golf_tournament_rounds r ON r.round_event_id = rl.round_event_id
    WHERE r.tournament_id = current_setting('tour.id')::uuid
      AND rl.player_id = '00000000-0000-0000-0000-000000216506'
      AND rl.role = 'lineup' AND rl.slot = 5
      AND rl.substituted_for = '00000000-0000-0000-0000-000000216507'),
  2,
  'the substitute takes slot 5 in this round and the later one'
);

-- ============================================================================
-- Round order
-- ============================================================================
SELECT throws_ok(
  $$SELECT public.golf_tournament_set_round_status(
      (SELECT round_event_id FROM public.golf_tournament_rounds WHERE tournament_id = current_setting('tour.id')::uuid AND round_number = 2),
      'live', NULL)$$,
  'P0001', 'round_order',
  'round 2 cannot start while round 1 is upcoming'
);

-- ============================================================================
-- Delete with a linked GolfHelm round
-- ============================================================================
DO $$
BEGIN
  INSERT INTO public.golf_tournament_player_rounds (round_event_id, team_id, player_id, round_id, link_source)
  SELECT r.round_event_id, r.team_id, '00000000-0000-0000-0000-000000216502',
    '00000000-0000-0000-0000-000000216701', 'coach'
  FROM public.golf_tournament_rounds r
  WHERE r.tournament_id = current_setting('tour.id')::uuid AND r.round_number = 1;
  PERFORM set_config('tour.events', (SELECT string_agg(round_event_id::text, ',') FROM public.golf_tournament_rounds WHERE tournament_id = current_setting('tour.id')::uuid), true);
END $$;

SELECT throws_ok(
  $$SELECT public.golf_tournament_delete(current_setting('tour.id')::uuid, false)$$,
  'P0001', 'rounds_linked',
  'a tournament with a linked round is not deleted unless told to unlink'
);
SELECT lives_ok(
  $$SELECT public.golf_tournament_delete(current_setting('tour.id')::uuid, true)$$,
  'told to unlink, the delete passes (the locked lineup does not block its own cascade)'
);
SELECT is(
  (SELECT count(*)::int FROM public.golf_events WHERE id = ANY (string_to_array(current_setting('tour.events'), ',')::uuid[])),
  0,
  'the round-day events the tournament owned are deleted with it'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-000000216701'),
  'the linked GolfHelm round itself is untouched'
);

SELECT * FROM finish();
ROLLBACK;
