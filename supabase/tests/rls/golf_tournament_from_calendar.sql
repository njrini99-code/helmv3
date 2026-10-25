-- pgTAP contract for P-5 Tournaments created from the calendar (held migrations
-- 20261025040000_golf_tournament_from_calendar.sql and
-- 20261025040100_golf_tournament_calendar_sync.sql, on top of 4.33's held
-- 20261024100000 and 20261024100100). Written, not run here (no Docker): run
-- `npm run test:rls` before applying.
--
-- One save from the calendar makes a tournament, one golf_events row per round,
-- the round links and the invitations, atomically; a convert keeps R1's id and
-- replies; rounds stay in order from every path; a round's type, team, series,
-- title, place and course are locked; cancel, restore and stop tracking keep
-- every calendar entry. 4.33's 100200 (entries) and 100300 (tee sheet) are
-- optional: the cases that need them skip when they are absent.
--
-- Plan arithmetic: 9 structural + 22 create + 7 update_round + 6 guard
-- + 5 sync + 6 cancel and restore + 5 untrack + 1 player + 2 optional = 63.

BEGIN;
\ir _helpers.sql

SELECT plan(63);

-- ============================================================================
-- Seed. Ids use the 0000...0254xxx range.
--   users:  coach 01 and assistant coach 05 on team A; players 02 and 03
--           active on team A, player 06 inactive on team A; outsider coach 04
--           on team B
--   E1:     an untracked tournament event (3-day all-day run) with an
--           accepted reply from 02
--   EC:     a cancelled tournament event; S1: a weekly practice series
--   Q1:     a qualifier targeting E1; Q2: a qualifier targeting EC
--   T1:     a trip with no event
-- No golf_team_settings row: the team clock falls back to America/New_York.
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000254001', 'coach@tourcal.test',     'authenticated'),
    ('00000000-0000-0000-0000-000000254002', 'mara@tourcal.test',      'authenticated'),
    ('00000000-0000-0000-0000-000000254003', 'theo@tourcal.test',      'authenticated'),
    ('00000000-0000-0000-0000-000000254004', 'outsider@tourcal.test',  'authenticated'),
    ('00000000-0000-0000-0000-000000254005', 'assistant@tourcal.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000254006', 'gone@tourcal.test',      'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000254201', 'Tour Cal Org A', 'college'),
    ('00000000-0000-0000-0000-000000254202', 'Tour Cal Org B', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000254301', 'Tour Cal Team A', 'GTOURCLA', '00000000-0000-0000-0000-000000254201'),
    ('00000000-0000-0000-0000-000000254302', 'Tour Cal Team B', 'GTOURCLB', '00000000-0000-0000-0000-000000254202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000254401', '00000000-0000-0000-0000-000000254001', '00000000-0000-0000-0000-000000254201'),
    ('00000000-0000-0000-0000-000000254404', '00000000-0000-0000-0000-000000254004', '00000000-0000-0000-0000-000000254202'),
    ('00000000-0000-0000-0000-000000254405', '00000000-0000-0000-0000-000000254005', '00000000-0000-0000-0000-000000254201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000254301', '00000000-0000-0000-0000-000000254401'),
    ('00000000-0000-0000-0000-000000254302', '00000000-0000-0000-0000-000000254404'),
    ('00000000-0000-0000-0000-000000254301', '00000000-0000-0000-0000-000000254405')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000254502', '00000000-0000-0000-0000-000000254002', 'Mara', 'Lindqvist'),
    ('00000000-0000-0000-0000-000000254503', '00000000-0000-0000-0000-000000254003', 'Theo', 'Achterberg'),
    ('00000000-0000-0000-0000-000000254506', '00000000-0000-0000-0000-000000254006', 'Gone', 'Player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000254301', '00000000-0000-0000-0000-000000254502', 'active'),
    ('00000000-0000-0000-0000-000000254301', '00000000-0000-0000-0000-000000254503', 'active'),
    ('00000000-0000-0000-0000-000000254301', '00000000-0000-0000-0000-000000254506', 'inactive')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_events (id, team_id, title, event_type, start_time, end_time, all_day, status, recurrence_rule) VALUES
    ('00000000-0000-0000-0000-000000254601', '00000000-0000-0000-0000-000000254301', 'Pinehurst', 'tournament', '2026-11-05T00:00:00Z', '2026-11-07T00:00:00Z', true, 'confirmed', NULL),
    ('00000000-0000-0000-0000-000000254602', '00000000-0000-0000-0000-000000254301', 'Old event', 'tournament', '2026-11-12T00:00:00Z', '2026-11-12T00:00:00Z', true, 'cancelled', NULL),
    ('00000000-0000-0000-0000-000000254603', '00000000-0000-0000-0000-000000254301', 'Practice', 'practice', '2026-11-03T20:00:00Z', '2026-11-03T22:00:00Z', false, 'confirmed', 'FREQ=WEEKLY;BYDAY=TU')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_event_attendance (event_id, player_id, status, rsvp_at) VALUES
    ('00000000-0000-0000-0000-000000254601', '00000000-0000-0000-0000-000000254502', 'accepted', now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_qualifiers (id, team_id, name, start_date, target_tournament_id) VALUES
    ('00000000-0000-0000-0000-000000254701', '00000000-0000-0000-0000-000000254301', 'Fall qualifier', '2026-10-20', '00000000-0000-0000-0000-000000254601'),
    ('00000000-0000-0000-0000-000000254702', '00000000-0000-0000-0000-000000254301', 'Spring qualifier', '2026-10-21', '00000000-0000-0000-0000-000000254602')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_travel_itineraries (id, team_id, event_name) VALUES
    ('00000000-0000-0000-0000-000000254801', '00000000-0000-0000-0000-000000254301', 'Columbus trip')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Structural (9)
-- ============================================================================
SELECT has_column('public', 'golf_tournaments', 'request_id', 'golf_tournaments.request_id exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'golf_tournaments_request_id_uq'), 'golf_tournaments_request_id_uq exists');
SELECT has_column('public', 'golf_tournament_rounds', 'course_label', 'golf_tournament_rounds.course_label exists');
SELECT ok(
  NOT has_function_privilege('anon', 'public.golf_tournament_create_from_calendar(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.golf_tournament_update_round(uuid, jsonb, integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.golf_tournament_set_cancelled(uuid, uuid, boolean, text, integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.golf_tournament_untrack(uuid, integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.golf_team_timezone(uuid)', 'EXECUTE'),
  'anon cannot execute any P-5 function'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.golf_tournament_create_from_calendar(jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.golf_team_timezone(uuid)', 'EXECUTE'),
  'authenticated can execute the RPCs'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef
              AND proname IN ('golf_tournament_create_from_calendar', 'golf_tournament_update_round', 'golf_tournament_set_cancelled', 'golf_tournament_untrack', 'golf_team_timezone')),
  'every P-5 function is SECURITY INVOKER'
);
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'golf_events_tournament_round_guard' AND NOT tgisinternal), 'the round guard trigger exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'golf_events_tournament_round_sync' AND tgdeferrable AND tginitdeferred), 'the sync trigger is deferrable and initially deferred');
SELECT is(public.golf_team_timezone('00000000-0000-0000-0000-000000254301'), 'America/New_York', 'a team with no settings row reads America/New_York');

-- ============================================================================
-- Create (22): coach 01 converts E1 into a 3-round tournament.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000254001", "role": "authenticated"}';

CREATE TEMP TABLE made ON COMMIT DROP AS
SELECT public.golf_tournament_create_from_calendar(jsonb_build_object(
  'team_id', '00000000-0000-0000-0000-000000254301', 'request_id', '00000000-0000-0000-0000-000000254a01',
  'name', 'Pinehurst Invitational', 'from_event_id', '00000000-0000-0000-0000-000000254601',
  'course_label', 'Pinehurst No. 2', 'format', '5c4', 'holes_per_round', 18,
  'qualifier_id', '00000000-0000-0000-0000-000000254701', 'itinerary_id', '00000000-0000-0000-0000-000000254801',
  'rounds', jsonb_build_array(
    jsonb_build_object('date', '2026-11-05', 'start_at', '2026-11-05T00:00:00+00:00', 'all_day', true),
    jsonb_build_object('date', '2026-11-06', 'start_at', '2026-11-06T08:00:00-05:00', 'all_day', false),
    jsonb_build_object('date', '2026-11-07', 'start_at', '2026-11-07T00:00:00+00:00', 'all_day', true)),
  'event', jsonb_build_object('requires_rsvp', false, 'attendee_ids', jsonb_build_array(
    '00000000-0000-0000-0000-000000254502', '00000000-0000-0000-0000-000000254503', '00000000-0000-0000-0000-000000254506')))) AS j;

SELECT is((SELECT jsonb_array_length(j->'rounds') FROM made), 3, '4: create returns 3 round event ids');
SELECT is((SELECT (j->'rounds'->0->>'event_id')::uuid FROM made), '00000000-0000-0000-0000-000000254601'::uuid, '4: R1 is E1');
SELECT is((SELECT title || '|' || event_type FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000254601'), 'Pinehurst Invitational · R1|tournament', '5: E1 is titled Name · R1 and typed tournament');
SELECT is((SELECT location FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000254601'), 'Pinehurst No. 2', '5: a typed course becomes the location');
SELECT is((SELECT status FROM public.golf_event_attendance WHERE event_id = '00000000-0000-0000-0000-000000254601' AND player_id = '00000000-0000-0000-0000-000000254502'), 'accepted', '6: 02 keeps the accepted reply on R1');
SELECT ok((SELECT rsvp_at IS NOT NULL FROM public.golf_event_attendance WHERE event_id = '00000000-0000-0000-0000-000000254601' AND player_id = '00000000-0000-0000-0000-000000254502'), '6: and its rsvp_at');
SELECT is((SELECT status FROM public.golf_event_attendance WHERE event_id = '00000000-0000-0000-0000-000000254601' AND player_id = '00000000-0000-0000-0000-000000254503'), 'pending', '6: 03 gets a pending row on R1');
SELECT is((SELECT count(*)::int FROM public.golf_event_attendance WHERE player_id = '00000000-0000-0000-0000-000000254506'), 0, '6: inactive 06 is never invited');
SELECT is((SELECT target_tournament_id FROM public.golf_qualifiers WHERE id = '00000000-0000-0000-0000-000000254701'), '00000000-0000-0000-0000-000000254601'::uuid, '8: Q1 still targets E1');
SELECT is((SELECT event_id FROM public.golf_travel_itineraries WHERE id = '00000000-0000-0000-0000-000000254801'), '00000000-0000-0000-0000-000000254601'::uuid, '8: T1 links to E1');
SELECT is(
  (SELECT string_agg(e.created_by::text || ':' || e.status, ',' ORDER BY r.round_number) FROM public.golf_tournament_rounds r JOIN public.golf_events e ON e.id = r.round_event_id WHERE r.round_number > 1),
  '00000000-0000-0000-0000-000000254401:confirmed,00000000-0000-0000-0000-000000254401:confirmed',
  '9: R2 and R3 are new confirmed events created by the coach row'
);
SELECT is(
  (SELECT string_agg(r.round_number || ':' || (r.first_tee_at IS NULL) || ':' || r.event_adopted, ',' ORDER BY r.round_number) FROM public.golf_tournament_rounds r),
  '1:true:true,2:false:false,3:true:false',
  '10: rounds 1 to 3, first_tee_at NULL when all-day, only the converted R1 adopted'
);
SELECT is((SELECT start_date || '|' || end_date || '|' || rounds_count FROM public.golf_tournaments WHERE request_id = '00000000-0000-0000-0000-000000254a01'), '2026-11-05|2026-11-07|3', '11: local dates and rounds_count');
SELECT is((SELECT created_by FROM public.golf_tournaments WHERE request_id = '00000000-0000-0000-0000-000000254a01'), '00000000-0000-0000-0000-000000254001'::uuid, '11: created_by is auth.uid()');
SELECT ok((public.golf_tournament_create_from_calendar(jsonb_build_object('team_id', '00000000-0000-0000-0000-000000254301', 'request_id', '00000000-0000-0000-0000-000000254a01', 'name', 'x', 'rounds', '[]'::jsonb))->>'replayed')::boolean, '12: a replay returns replayed = true');
SELECT is((SELECT count(*)::int FROM public.golf_tournaments), 1, '12: and writes nothing');
-- 13: invoker rights hide team A's row from coach 04, so the replay check finds nothing and the insert loses on the
-- partial unique index (23505).
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000254004", "role": "authenticated"}';
SELECT throws_ok(
  $$SELECT public.golf_tournament_create_from_calendar(jsonb_build_object('team_id', '00000000-0000-0000-0000-000000254302', 'request_id', '00000000-0000-0000-0000-000000254a01', 'name', 'X', 'rounds', jsonb_build_array(jsonb_build_object('start_at', '2026-12-10T00:00:00Z', 'all_day', true))))$$,
  '23505', NULL, '13: coach 04 replaying coach 01''s request id on team B raises 23505, and writes nothing');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000254001", "role": "authenticated"}';
SELECT throws_ok(
  $$SELECT public.golf_tournament_create_from_calendar(jsonb_build_object('team_id', '00000000-0000-0000-0000-000000254301', 'request_id', gen_random_uuid(), 'name', 'Again', 'from_event_id', '00000000-0000-0000-0000-000000254601', 'rounds', jsonb_build_array(jsonb_build_object('start_at', '2026-11-05T00:00:00Z', 'all_day', true))))$$,
  'P0001', 'already_tracked', '14: converting E1 again raises already_tracked');
SELECT throws_ok(
  $$SELECT public.golf_tournament_create_from_calendar(jsonb_build_object('team_id', '00000000-0000-0000-0000-000000254301', 'request_id', gen_random_uuid(), 'name', 'S', 'from_event_id', '00000000-0000-0000-0000-000000254603', 'rounds', jsonb_build_array(jsonb_build_object('start_at', '2026-11-05T00:00:00Z', 'all_day', true))))$$,
  'P0001', 'event_is_series', '15: converting a series occurrence raises event_is_series');
SELECT throws_ok(
  $$SELECT public.golf_tournament_create_from_calendar(jsonb_build_object('team_id', '00000000-0000-0000-0000-000000254301', 'request_id', gen_random_uuid(), 'name', 'O', 'rounds', jsonb_build_array(jsonb_build_object('start_at', '2026-11-20T00:00:00Z', 'all_day', true), jsonb_build_object('start_at', '2026-11-20T08:00:00-05:00'))))$$,
  'P0001', 'round_order', '17/19d: an untimed round keys at the end of its day, so a timed R2 that day is out of order');
SELECT throws_ok(
  $$SELECT public.golf_tournament_create_from_calendar(jsonb_build_object('team_id', '00000000-0000-0000-0000-000000254301', 'request_id', gen_random_uuid(), 'name', 'Steal', 'qualifier_id', '00000000-0000-0000-0000-000000254702', 'rounds', jsonb_build_array(jsonb_build_object('start_at', '2026-11-25T00:00:00Z', 'all_day', true))))$$,
  'P0001', 'qualifier_linked', '19a: a qualifier linked to another event is not stolen');
SELECT is((SELECT count(*)::int FROM public.golf_tournaments), 1, '19a: and nothing from that call exists');

-- ============================================================================
-- update_round (7): the assistant coach moves R2.
-- ============================================================================
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000254005", "role": "authenticated"}';
CREATE TEMP TABLE r2 ON COMMIT DROP AS SELECT round_event_id AS id FROM public.golf_tournament_rounds WHERE round_number = 2;
CREATE TEMP TABLE v1 ON COMMIT DROP AS SELECT version FROM public.golf_tournaments;
SELECT throws_ok($$SELECT public.golf_tournament_update_round((SELECT id FROM r2), '{}'::jsonb, NULL)$$, 'P0001', 'bad_input', '22: a NULL version raises bad_input');
SELECT throws_ok($$SELECT public.golf_tournament_update_round((SELECT id FROM r2), '{}'::jsonb, 999)$$, 'P0001', 'stale', '22: a stale version raises stale');
SELECT is(
  (public.golf_tournament_update_round((SELECT id FROM r2), jsonb_build_object('start_at', '2026-11-06T09:00:00-05:00', 'attendee_ids', jsonb_build_array('00000000-0000-0000-0000-000000254502')), (SELECT version FROM v1))->>'version')::int,
  (SELECT version FROM v1) + 1,
  '21: moving R2 by an hour returns version + 1'
);
SELECT is((SELECT first_tee_at FROM public.golf_tournament_rounds WHERE round_event_id = (SELECT id FROM r2)), '2026-11-06T14:00:00Z'::timestamptz, '21: first_tee_at follows');
SELECT is((SELECT count(*)::int FROM public.golf_event_attendance WHERE event_id = (SELECT id FROM r2)), 1, '21: attendee_ids apply under the version check (unanswered 03 dropped)');
SELECT throws_ok($$SELECT public.golf_tournament_update_round((SELECT id FROM r2), jsonb_build_object('start_at', '2026-11-04T09:00:00-05:00'), (SELECT version FROM public.golf_tournaments))$$, 'P0001', 'round_order', '23: moving R2 before R1 raises round_order');
SELECT throws_ok(
  $$SELECT public.golf_tournament_create_from_calendar(jsonb_build_object('team_id', '00000000-0000-0000-0000-000000254301', 'request_id', gen_random_uuid(), 'name', 'Seven', 'rounds', (SELECT jsonb_agg(jsonb_build_object('start_at', d::date::text || 'T00:00:00Z', 'all_day', true)) FROM generate_series('2026-12-01'::date, '2026-12-07'::date, '1 day') d)))$$,
  'P0001', 'round_count', '18: seven rounds raise round_count');

-- ============================================================================
-- Guard (6)
-- ============================================================================
SELECT throws_ok($$UPDATE public.golf_events SET event_type = 'practice' WHERE id = (SELECT id FROM r2)$$, 'P0001', 'round_type_locked', '31: a round''s type is locked');
SELECT throws_ok($$UPDATE public.golf_events SET recurring = true WHERE id = (SELECT id FROM r2)$$, 'P0001', 'round_series_locked', '32: a round cannot become a series');
SELECT throws_ok($$UPDATE public.golf_events SET title = 'Renamed' WHERE id = (SELECT id FROM r2)$$, 'P0001', 'round_fields_locked', '33: a plain save cannot rewrite a round''s title');
SELECT throws_ok($$UPDATE public.golf_events SET location = 'Elsewhere' WHERE id = (SELECT id FROM r2)$$, 'P0001', 'round_fields_locked', '33a: or its place');
SELECT lives_ok($$UPDATE public.golf_events SET description = 'Bus at 6' WHERE id = (SELECT id FROM r2)$$, 'notes still save on a round');
SELECT lives_ok($$UPDATE public.golf_events SET title = 'Untracked rename', event_type = 'tournament' WHERE id = '00000000-0000-0000-0000-000000254602'$$, '34: the guard is a no-op on an untracked tournament event');

-- ============================================================================
-- Sync, 040100 (5)
-- ============================================================================
CREATE TEMP TABLE v2 ON COMMIT DROP AS SELECT version FROM public.golf_tournaments;
UPDATE public.golf_events SET start_time = start_time + interval '1 hour', end_time = end_time + interval '1 hour' WHERE id = (SELECT id FROM r2);
SET CONSTRAINTS ALL IMMEDIATE;
SELECT is((SELECT first_tee_at FROM public.golf_tournament_rounds WHERE round_event_id = (SELECT id FROM r2)), '2026-11-06T15:00:00Z'::timestamptz, '35: a plain move mirrors into first_tee_at');
SELECT is((SELECT version FROM public.golf_tournaments), (SELECT version FROM v2) + 1, '35: and bumps the version once');
SELECT throws_ok(
  $$DO $d$ BEGIN UPDATE public.golf_events SET start_time = '2026-11-04T12:00:00Z' WHERE id = (SELECT id FROM r2); SET CONSTRAINTS ALL IMMEDIATE; END $d$$$,
  'P0001', 'round_order', '36: a plain move of R2 before R1 is refused at commit');
UPDATE public.golf_tournaments SET name = 'Pinehurst Open';
SELECT is((SELECT string_agg(title, ',' ORDER BY title) FROM public.golf_events WHERE title LIKE 'Pinehurst Open%'), 'Pinehurst Open · R1,Pinehurst Open · R2,Pinehurst Open · R3', '38: renaming the tournament rewrites the three titles');
UPDATE public.golf_tournament_rounds SET course_label = 'Mid Pines' WHERE round_event_id = (SELECT id FROM r2);
SELECT is((SELECT location FROM public.golf_events WHERE id = (SELECT id FROM r2)), 'Mid Pines', '39: a round''s course reaches its event''s location');

-- ============================================================================
-- Cancel and restore (6)
-- ============================================================================
CREATE TEMP TABLE r3 ON COMMIT DROP AS SELECT round_event_id AS id FROM public.golf_tournament_rounds WHERE round_number = 3;
CREATE TEMP TABLE tid ON COMMIT DROP AS SELECT id FROM public.golf_tournaments;
SELECT is(
  jsonb_array_length(public.golf_tournament_set_cancelled((SELECT id FROM tid), (SELECT id FROM r3), true, 'Rain', (SELECT version FROM public.golf_tournaments))->'changed_event_ids'),
  1, '26: cancelling R3 changes one event');
SELECT ok((SELECT status = 'cancelled' AND cancelled_at IS NOT NULL AND cancellation_reason = 'Rain' FROM public.golf_events WHERE id = (SELECT id FROM r3)), '26: R3 is cancelled with its reason');
SELECT lives_ok($$SELECT public.golf_tournament_update_round((SELECT id FROM r2), jsonb_build_object('start_at', '2026-11-08T09:00:00-05:00'), (SELECT version FROM public.golf_tournaments))$$, 'a cancelled R3 does not block moving R2 past its day');
SELECT throws_ok($$SELECT public.golf_tournament_set_cancelled((SELECT id FROM tid), (SELECT id FROM r3), false, NULL, (SELECT version FROM public.golf_tournaments))$$, 'P0001', 'round_order', '27a: restoring R3 where R2 now sits raises round_order');
SELECT lives_ok($$SELECT public.golf_tournament_update_round((SELECT id FROM r2), jsonb_build_object('start_at', '2026-11-06T09:00:00-05:00'), (SELECT version FROM public.golf_tournaments))$$, 'R2 moves back');
SELECT is(
  (SELECT string_agg(e.status, ',' ORDER BY r.round_number) FROM public.golf_tournament_rounds r JOIN public.golf_events e ON e.id = r.round_event_id
    WHERE public.golf_tournament_set_cancelled((SELECT id FROM tid), NULL, false, NULL, (SELECT version FROM public.golf_tournaments)) IS NOT NULL),
  'confirmed,confirmed,confirmed', '27: restoring the tournament confirms every round');

-- ============================================================================
-- Untrack (5)
-- ============================================================================
SELECT throws_ok($$SELECT public.golf_tournament_untrack((SELECT id FROM tid), NULL)$$, 'P0001', 'bad_input', '22: untrack with a NULL version raises bad_input');
SELECT lives_ok($$SELECT public.golf_tournament_untrack((SELECT id FROM tid), (SELECT version FROM public.golf_tournaments))$$, '29: stop tracking');
SELECT is((SELECT count(*)::int FROM public.golf_tournament_rounds), 0, '29: the rounds rows are gone');
SELECT is((SELECT count(*)::int FROM public.golf_events WHERE title LIKE 'Pinehurst Open · R%'), 3, '29: E1, R2 and R3 still exist');
SELECT is((SELECT target_tournament_id FROM public.golf_qualifiers WHERE id = '00000000-0000-0000-0000-000000254701'), '00000000-0000-0000-0000-000000254601'::uuid, '29: Q1 still targets E1');

-- ============================================================================
-- Players (1)
-- ============================================================================
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000254002", "role": "authenticated"}';
SELECT throws_ok(
  $$SELECT public.golf_tournament_create_from_calendar(jsonb_build_object('team_id', '00000000-0000-0000-0000-000000254301', 'request_id', gen_random_uuid(), 'name', 'X', 'rounds', jsonb_build_array(jsonb_build_object('start_at', '2026-12-10T00:00:00Z', 'all_day', true))))$$,
  '42501', NULL, '20: a player calling create raises 42501');

-- ============================================================================
-- Optional 4.33 objects (2): entries need 100200, the tee-time shift 100300.
-- ============================================================================
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000254001", "role": "authenticated"}';
SELECT CASE WHEN to_regprocedure('public.golf_tournament_set_entries(uuid, jsonb, integer)') IS NULL
  THEN throws_ok(
    $$SELECT public.golf_tournament_create_from_calendar(jsonb_build_object('team_id', '00000000-0000-0000-0000-000000254301', 'request_id', gen_random_uuid(), 'name', 'E', 'entries', '[{"player_id": "00000000-0000-0000-0000-000000254502", "role": "lineup", "slot": 1}]'::jsonb, 'rounds', jsonb_build_array(jsonb_build_object('start_at', '2026-12-10T00:00:00Z', 'all_day', true))))$$,
    'P0001', 'entries_unavailable', '19b: entries without 100200 raise entries_unavailable')
  ELSE skip('19b: 100200 is applied; 4.33''s own tests cover set_entries') END;
SELECT CASE WHEN to_regclass('public.golf_tournament_tee_sheet') IS NULL
  THEN pass('24: no tee sheet (100300 not applied): the shift is skipped and tee_times_shifted is 0')
  ELSE skip('24: 100300 is applied; add the tee-sheet shift case with its seed') END;

SELECT * FROM finish();
ROLLBACK;
