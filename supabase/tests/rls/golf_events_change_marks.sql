-- pgTAP contract for change marks on golf_events
-- (20261025080000_golf_events_change_marks.sql, P-14).
--
-- The BEFORE trigger writes golf_events.metadata->'change': what changed, from what, by
-- whom, when. These tests hold the rules the Calendar and the "Message players" draft
-- rely on: one mark per session, the baseline kept across quick edits, a return to the
-- baseline clearing the mark, sessions closing after 30 minutes, quiet title and type
-- for sync writes, series siblings sharing one session id, a client unable to forge a
-- mark, and the mark inheriting golf_events' read rules (including the meetings rule).
--
-- Both BEFORE UPDATE triggers must be present: P-4's golf_events_touch_updated_at
-- (20261025030000) is applied before this migration, and the first test fails loudly if
-- it is not. The two cooperate: the mark trigger sets updated_at on a tracked change
-- (series edits never did); P-4's bumps every real row change, and skips a write made
-- under helm.change_mark_writer.
--
-- Plan arithmetic: 8 structural + 7 coach basics + 5 sessions + 3 settle + 1 class
-- + 4 tampering + 6 quiet and kinds + 2 series + 4 readers = 40.

BEGIN;
\ir _helpers.sql

SELECT plan(40);

-- ============================================================================
-- Seed. Ids use the 0000...0801xxx range.
--   users:   coach 01 (Pat Reyes), coach 02 (Ken Ito), player 03 (team A),
--            outsider 04 (team B)
--   events (team A): E1 practice (a clean move), E2 (quick edits), E3 (move and
--            back), E4 (notes only), E5 class, E6 meeting nobody is invited to,
--            E7 and E13 (planted sessions), E8 (other metadata), E9 (array
--            metadata), E10 (quiet keys), E11 (settle flow), E12 (cancel),
--            E14 (rename), E15 (nested write); S0 a weekly series with
--            children S1 and S2
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000801001', 'coach@marks.test',    'authenticated'),
    ('00000000-0000-0000-0000-000000801002', 'coach2@marks.test',   'authenticated'),
    ('00000000-0000-0000-0000-000000801003', 'player@marks.test',   'authenticated'),
    ('00000000-0000-0000-0000-000000801004', 'outsider@marks.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000801201', 'Marks Org A', 'college'),
    ('00000000-0000-0000-0000-000000801202', 'Marks Org B', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000801301', 'Marks Team A', 'GMARKSA', '00000000-0000-0000-0000-000000801201'),
    ('00000000-0000-0000-0000-000000801302', 'Marks Team B', 'GMARKSB', '00000000-0000-0000-0000-000000801202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id, full_name) VALUES
    ('00000000-0000-0000-0000-000000801401', '00000000-0000-0000-0000-000000801001', '00000000-0000-0000-0000-000000801201', 'Pat Reyes'),
    ('00000000-0000-0000-0000-000000801402', '00000000-0000-0000-0000-000000801002', '00000000-0000-0000-0000-000000801201', 'Ken Ito')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000801301', '00000000-0000-0000-0000-000000801401'),
    ('00000000-0000-0000-0000-000000801301', '00000000-0000-0000-0000-000000801402')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000801503', '00000000-0000-0000-0000-000000801003', 'Pla', 'Yer'),
    ('00000000-0000-0000-0000-000000801504', '00000000-0000-0000-0000-000000801004', 'Out', 'Sider')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000801301', '00000000-0000-0000-0000-000000801503', 'active'),
    ('00000000-0000-0000-0000-000000801302', '00000000-0000-0000-0000-000000801504', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_events (id, team_id, title, event_type, start_time, end_time, location, status, updated_at, metadata, recurrence_rule, parent_event_id) VALUES
    ('00000000-0000-0000-0000-000000801601', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-15 19:00:00+00', '2027-04-15 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801602', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-16 19:00:00+00', '2027-04-16 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801603', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-17 19:00:00+00', '2027-04-17 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801604', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-18 19:00:00+00', '2027-04-18 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801605', '00000000-0000-0000-0000-000000801301', 'STAT 201', 'class', '2027-04-19 19:00:00+00', '2027-04-19 20:00:00+00', 'Room 4', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801606', '00000000-0000-0000-0000-000000801301', 'Captains', 'meeting', '2027-04-20 19:00:00+00', '2027-04-20 20:00:00+00', 'Office', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801607', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-21 19:00:00+00', '2027-04-21 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801608', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-22 19:00:00+00', '2027-04-22 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{"report_min": 30}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801609', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-23 19:00:00+00', '2027-04-23 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '[1, 2]', NULL, NULL),
    ('00000000-0000-0000-0000-000000801610', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-24 19:00:00+00', '2027-04-24 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801611', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-25 19:00:00+00', '2027-04-25 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801612', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-26 19:00:00+00', '2027-04-26 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801613', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-27 19:00:00+00', '2027-04-27 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801614', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-28 19:00:00+00', '2027-04-28 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801615', '00000000-0000-0000-0000-000000801301', 'Practice', 'practice', '2027-04-29 19:00:00+00', '2027-04-29 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, NULL),
    ('00000000-0000-0000-0000-000000801620', '00000000-0000-0000-0000-000000801301', 'Weekly', 'practice', '2027-05-03 19:00:00+00', '2027-05-03 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', 'FREQ=WEEKLY;BYDAY=MO', NULL),
    ('00000000-0000-0000-0000-000000801621', '00000000-0000-0000-0000-000000801301', 'Weekly', 'practice', '2027-05-10 19:00:00+00', '2027-05-10 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, '00000000-0000-0000-0000-000000801620'),
    ('00000000-0000-0000-0000-000000801622', '00000000-0000-0000-0000-000000801301', 'Weekly', 'practice', '2027-05-17 19:00:00+00', '2027-05-17 21:00:00+00', 'Lonnie Poole', 'confirmed', '2020-01-01', '{}', NULL, '00000000-0000-0000-0000-000000801620')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Structural
-- ============================================================================
SELECT has_trigger('public', 'golf_events', 'golf_events_touch_updated_at', 'P-4''s updated_at trigger is present (apply 20261025030000 first)');
SELECT has_trigger('public', 'golf_events', 'golf_events_change_mark', 'the change-mark trigger is present');
SELECT is(
  (SELECT string_agg(tgname::text, ',' ORDER BY tgname) FROM pg_trigger
    WHERE tgrelid = 'public.golf_events'::regclass AND NOT tgisinternal
      AND tgname IN ('golf_events_change_mark', 'golf_events_touch_updated_at')),
  'golf_events_change_mark,golf_events_touch_updated_at',
  'the mark trigger fires before the updated_at trigger (BEFORE triggers fire by name)'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.golf_events_change_mark()'::regprocedure
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
  ),
  'golf_events_change_mark is SECURITY DEFINER with search_path = ""'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.golf_events_change_mark()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.golf_events_change_mark()', 'EXECUTE'),
  'authenticated and anon cannot execute the trigger function'
);
SELECT ok(
  (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid = 'public.golf_events'::regclass AND tgname = 'golf_events_touch_updated_at') LIKE '%helm.change_mark_writer%',
  'the updated_at trigger skips writes made under helm.change_mark_writer'
);
SELECT ok(
  has_function_privilege('service_role', 'public.golf_change_marks_capability()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.golf_change_marks_capability()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.golf_change_marks_capability()', 'EXECUTE'),
  'the capability function is for the service role only'
);
SELECT ok(
  (SELECT marks FROM public.golf_change_marks_capability()),
  'the capability function reports the mark trigger as installed'
);

-- ============================================================================
-- Plant a stale session (31 minutes old) on E7 and a fresh one (29 minutes) on E13.
-- A delivery writer's setting lets the setup bypass the trigger, as a sender would.
-- ============================================================================
DO $$
BEGIN
  PERFORM set_config('helm.change_mark_writer', 'on', true);
  UPDATE public.golf_events SET metadata = jsonb_build_object('change', jsonb_build_object(
    'v', 1, 'id', '00000000-0000-0000-0000-0000008a0007',
    'first_at', to_char((now() - interval '31 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'at', to_char((now() - interval '30 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'by', NULL, 'by_names', '[]'::jsonb,
    'from', jsonb_build_object('start_time', '2027-04-21T18:00:00Z', 'end_time', '2027-04-21T20:00:00Z', 'all_day', false, 'location', 'Lonnie Poole', 'title', 'Practice', 'event_type', 'practice', 'cancelled', false),
    'fields', '["end_time","start_time"]'::jsonb))
  WHERE id = '00000000-0000-0000-0000-000000801607';
  UPDATE public.golf_events SET metadata = jsonb_build_object('change', jsonb_build_object(
    'v', 1, 'id', '00000000-0000-0000-0000-0000008a0013',
    'first_at', to_char((now() - interval '29 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'at', to_char((now() - interval '28 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'by', NULL, 'by_names', '[]'::jsonb,
    'from', jsonb_build_object('start_time', '2027-04-27T18:00:00Z', 'end_time', '2027-04-27T20:00:00Z', 'all_day', false, 'location', 'Lonnie Poole', 'title', 'Practice', 'event_type', 'practice', 'cancelled', false),
    'fields', '["end_time","start_time"]'::jsonb))
  WHERE id = '00000000-0000-0000-0000-000000801613';
  PERFORM set_config('helm.change_mark_writer', 'off', true);
END $$;

-- ============================================================================
-- The team's coach
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000801001", "role": "authenticated"}';

-- A move an hour later.
UPDATE public.golf_events SET start_time = '2027-04-15 20:00:00+00', end_time = '2027-04-15 22:00:00+00'
 WHERE id = '00000000-0000-0000-0000-000000801601';
SELECT is(
  (SELECT metadata -> 'change' -> 'fields' FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801601'),
  '["end_time", "start_time"]'::jsonb,
  'a move records the fields that differ, sorted'
);
SELECT is(
  (SELECT metadata -> 'change' -> 'from' ->> 'start_time' || ' ' || (metadata -> 'change' -> 'from' ->> 'location') FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801601'),
  '2027-04-15T19:00:00Z Lonnie Poole',
  'the mark keeps the value invitees last knew'
);
SELECT is(
  (SELECT (metadata -> 'change' ->> 'by') || ' ' || (metadata -> 'change' -> 'by_names')::text FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801601'),
  '00000000-0000-0000-0000-000000801401 ["Pat Reyes"]',
  'by is the coach''s golf_coaches id, by_names their full name'
);
SELECT ok(
  (SELECT (metadata -> 'change' ->> 'v') = '1' AND NOT (metadata -> 'change' ? 'settled_at') FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801601'),
  'a new mark is version 1 and unsettled'
);
SELECT ok(
  (SELECT updated_at > '2020-01-01' FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801601'),
  'a tracked change sets updated_at'
);

-- A notes-only edit.
UPDATE public.golf_events SET description = 'Bring rain gear' WHERE id = '00000000-0000-0000-0000-000000801604';
SELECT ok(
  (SELECT NOT (metadata ? 'change') FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801604'),
  'a notes-only edit makes no mark'
);
SELECT ok(
  (SELECT updated_at > '2020-01-01' FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801604'),
  'a notes edit bumps updated_at, by P-4''s trigger'
);

-- Many quick edits are one session with one baseline.
UPDATE public.golf_events SET end_time = '2027-04-16 21:30:00+00' WHERE id = '00000000-0000-0000-0000-000000801602';
DO $$
BEGIN
  PERFORM set_config('tests.e2_id', (SELECT metadata -> 'change' ->> 'id' FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801602'), true);
END $$;
UPDATE public.golf_events SET start_time = '2027-04-16 19:15:00+00' WHERE id = '00000000-0000-0000-0000-000000801602';
UPDATE public.golf_events SET location = 'Finley range' WHERE id = '00000000-0000-0000-0000-000000801602';
SELECT is(
  (SELECT metadata -> 'change' ->> 'id' FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801602'),
  current_setting('tests.e2_id'),
  'three quick edits keep one session id'
);
SELECT is(
  (SELECT metadata -> 'change' -> 'from' ->> 'location' || ' ' || (metadata -> 'change' -> 'from' ->> 'end_time') FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801602'),
  'Lonnie Poole 2027-04-16T21:00:00Z',
  'and keep the original baseline, not the intermediate values'
);

-- Move away and back: nothing changed, nothing marked.
UPDATE public.golf_events SET start_time = '2027-04-17 22:00:00+00', end_time = '2027-04-18 00:00:00+00' WHERE id = '00000000-0000-0000-0000-000000801603';
UPDATE public.golf_events SET start_time = '2027-04-17 19:00:00+00', end_time = '2027-04-17 21:00:00+00' WHERE id = '00000000-0000-0000-0000-000000801603';
SELECT ok(
  (SELECT NOT (metadata ? 'change') FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801603'),
  'moving an event back to where it was clears the mark'
);

-- Sessions close after 30 minutes.
UPDATE public.golf_events SET end_time = '2027-04-21 21:30:00+00' WHERE id = '00000000-0000-0000-0000-000000801607';
SELECT ok(
  (SELECT (metadata -> 'change' ->> 'id') <> '00000000-0000-0000-0000-0000008a0007'
      AND (metadata -> 'change' -> 'prior' ->> 'id') = '00000000-0000-0000-0000-0000008a0007'
      AND (metadata -> 'change' -> 'from' ->> 'end_time') = '2027-04-21T21:00:00Z'
   FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801607'),
  'a session first edited 31 minutes ago is closed: the next edit starts a new id and baseline, with the old one as prior'
);
UPDATE public.golf_events SET end_time = '2027-04-27 21:30:00+00' WHERE id = '00000000-0000-0000-0000-000000801613';
SELECT is(
  (SELECT metadata -> 'change' ->> 'id' FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801613'),
  '00000000-0000-0000-0000-0000008a0013',
  'a session first edited 29 minutes ago is still open'
);

-- Settle flow: a move, a delivery write, a new edit, then back to the settled value.
UPDATE public.golf_events SET start_time = '2027-04-25 20:00:00+00', end_time = '2027-04-25 22:00:00+00' WHERE id = '00000000-0000-0000-0000-000000801611';
DO $$
BEGIN
  PERFORM set_config('tests.e11_id', (SELECT metadata -> 'change' ->> 'id' FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801611'), true);
END $$;

RESET role;
DO $$
BEGIN
  PERFORM set_config('helm.change_mark_writer', 'on', true);
  UPDATE public.golf_events SET updated_at = '2021-01-01' WHERE id = '00000000-0000-0000-0000-000000801611';
  UPDATE public.golf_events
     SET metadata = jsonb_set(metadata, '{change}', (metadata -> 'change') || jsonb_build_object('settled_at', '2027-04-14T21:16:00.000Z'))
   WHERE id = '00000000-0000-0000-0000-000000801611';
  PERFORM set_config('helm.change_mark_writer', 'off', true);
END $$;
SELECT ok(
  (SELECT updated_at = '2021-01-01' AND (metadata -> 'change' ->> 'id') = current_setting('tests.e11_id')
      AND (metadata -> 'change' ->> 'by') = '00000000-0000-0000-0000-000000801401'
      AND (metadata -> 'change' ->> 'settled_at') IS NOT NULL
   FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801611'),
  'a write under helm.change_mark_writer leaves updated_at and every other change key alone'
);

SET LOCAL role TO authenticated;
UPDATE public.golf_events SET start_time = '2027-04-25 21:00:00+00', end_time = '2027-04-25 23:00:00+00' WHERE id = '00000000-0000-0000-0000-000000801611';
SELECT ok(
  (SELECT (metadata -> 'change' ->> 'id') <> current_setting('tests.e11_id')
      AND (metadata -> 'change' -> 'prior' ->> 'id') = current_setting('tests.e11_id')
      AND (metadata -> 'change' -> 'from' ->> 'start_time') = '2027-04-25T20:00:00Z'
   FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801611'),
  'after a settle a new edit starts a new session whose baseline is the settled value, with the old one as prior'
);
UPDATE public.golf_events SET start_time = '2027-04-25 20:00:00+00', end_time = '2027-04-25 22:00:00+00' WHERE id = '00000000-0000-0000-0000-000000801611';
SELECT ok(
  (SELECT (metadata -> 'change' ->> 'id') = current_setting('tests.e11_id') AND (metadata -> 'change' ->> 'settled_at') IS NOT NULL
   FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801611'),
  'an edit back to the settled value restores the prior mark'
);

-- A class row is never marked.
UPDATE public.golf_events SET start_time = '2027-04-19 20:00:00+00', end_time = '2027-04-19 21:00:00+00' WHERE id = '00000000-0000-0000-0000-000000801605';
SELECT ok(
  (SELECT NOT (metadata ? 'change') FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801605'),
  'a class row is never marked'
);

-- A client cannot write a mark.
INSERT INTO public.golf_events (id, team_id, title, event_type, start_time, end_time, status, metadata)
VALUES ('00000000-0000-0000-0000-000000801630', '00000000-0000-0000-0000-000000801301', 'Forged', 'practice', '2027-06-01 19:00:00+00', '2027-06-01 20:00:00+00', 'confirmed',
        '{"change": {"v": 1, "id": "x"}, "report_min": 15}');
SELECT is(
  (SELECT (metadata ? 'change')::text || ' ' || (metadata ->> 'report_min') FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801630'),
  'false 15',
  'an INSERT strips a client-sent change and keeps the other metadata'
);
UPDATE public.golf_events SET metadata = '{"change": {"v": 1, "id": "forged"}}'::jsonb WHERE id = '00000000-0000-0000-0000-000000801601';
SELECT ok(
  (SELECT (metadata -> 'change' ->> 'id') <> 'forged' AND (metadata -> 'change' -> 'from' ->> 'start_time') = '2027-04-15T19:00:00Z'
   FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801601'),
  'an UPDATE that sets metadata.change keeps the stored mark'
);
UPDATE public.golf_events SET start_time = '2027-04-22 20:00:00+00', end_time = '2027-04-22 22:00:00+00' WHERE id = '00000000-0000-0000-0000-000000801608';
SELECT ok(
  (SELECT (metadata ->> 'report_min') = '30' AND (metadata -> 'change' ->> 'v') = '1' FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801608'),
  'other metadata keys survive a marked change'
);
UPDATE public.golf_events SET start_time = '2027-04-23 20:00:00+00', end_time = '2027-04-23 22:00:00+00' WHERE id = '00000000-0000-0000-0000-000000801609';
SELECT is(
  (SELECT metadata FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801609'),
  '[1, 2]'::jsonb,
  'metadata that is not an object is left exactly as written'
);

-- Quiet keys: a sync write (nested) or P-5's RPC (helm.tournament_write) does not mark a title or type.
DO $$
BEGIN
  PERFORM set_config('helm.tournament_write', 'rounds', true);
END $$;
UPDATE public.golf_events SET title = 'Pinehurst R1', event_type = 'tournament' WHERE id = '00000000-0000-0000-0000-000000801610';
SELECT ok(
  (SELECT NOT (metadata ? 'change') FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801610'),
  'a title and type change under helm.tournament_write = rounds makes no mark'
);
UPDATE public.golf_events SET location = 'Pinehurst No. 2', title = 'Pinehurst R1 (Fri)' WHERE id = '00000000-0000-0000-0000-000000801610';
SELECT is(
  (SELECT metadata -> 'change' -> 'fields' FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801610'),
  '["location"]'::jsonb,
  'a course change in the same write is still marked, and the quiet title is not among its fields'
);
DO $$
BEGIN
  PERFORM set_config('helm.tournament_write', '', true);
END $$;
UPDATE public.golf_events SET title = 'Short game' WHERE id = '00000000-0000-0000-0000-000000801614';
SELECT is(
  (SELECT metadata -> 'change' -> 'fields' FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801614'),
  '["title"]'::jsonb,
  'a rename by the coach is marked'
);
UPDATE public.golf_events SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-000000801612';
SELECT ok(
  (SELECT (metadata -> 'change' -> 'fields') = '["cancelled"]'::jsonb AND (metadata -> 'change' -> 'from' ->> 'cancelled') = 'false'
   FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801612'),
  'a cancellation is marked, with cancelled false in the baseline'
);

-- A write nested inside another trigger (depth > 1) is quiet for title and type.
RESET role;
CREATE TEMP TABLE marks_nested_probe (id int);
CREATE FUNCTION pg_temp.marks_nested_rename() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE public.golf_events SET title = 'Synced name' WHERE id = '00000000-0000-0000-0000-000000801615';
  RETURN NEW;
END $f$;
CREATE TRIGGER marks_nested_probe_rename AFTER INSERT ON marks_nested_probe FOR EACH ROW EXECUTE FUNCTION pg_temp.marks_nested_rename();
INSERT INTO marks_nested_probe VALUES (1);
SELECT ok(
  (SELECT title = 'Synced name' AND NOT (metadata ? 'change') FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801615'),
  'a title written from inside another trigger is quiet: renamed, not marked'
);
-- E14 holds the coach's rename mark from above; a later sync rewrite of its title rebases the open session's baseline.
CREATE FUNCTION pg_temp.marks_nested_rewrite() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE public.golf_events SET title = 'Short game (synced)' WHERE id = '00000000-0000-0000-0000-000000801614';
  RETURN NEW;
END $f$;
CREATE TRIGGER marks_nested_probe_rewrite AFTER INSERT ON marks_nested_probe FOR EACH ROW EXECUTE FUNCTION pg_temp.marks_nested_rewrite();
INSERT INTO marks_nested_probe VALUES (2);
SELECT ok(
  (SELECT title = 'Short game (synced)' AND NOT (metadata ? 'change') FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801614'),
  'a quiet rewrite of a marked title moves the open baseline with it, so no stale "Renamed" is left'
);

-- A series edited in one statement is one session across its rows.
SET LOCAL role TO authenticated;
UPDATE public.golf_events SET start_time = start_time + interval '1 hour', end_time = end_time + interval '1 hour'
 WHERE id IN ('00000000-0000-0000-0000-000000801621', '00000000-0000-0000-0000-000000801622');
SELECT is(
  (SELECT count(*)::int FROM public.golf_events WHERE id IN ('00000000-0000-0000-0000-000000801621', '00000000-0000-0000-0000-000000801622') AND metadata ? 'change'),
  2,
  'a batched series update marks every row'
);
SELECT is(
  (SELECT count(DISTINCT metadata -> 'change' ->> 'id')::int FROM public.golf_events WHERE id IN ('00000000-0000-0000-0000-000000801621', '00000000-0000-0000-0000-000000801622')),
  1,
  'and the occurrences share one session id'
);

-- ============================================================================
-- RLS-SECTION-START (reads follow golf_events' policies: needs the production policies)
-- ============================================================================
UPDATE public.golf_events SET start_time = '2027-04-20 20:00:00+00', end_time = '2027-04-20 21:00:00+00' WHERE id = '00000000-0000-0000-0000-000000801606';

SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000801003", "role": "authenticated"}';
SELECT ok(
  (SELECT (metadata -> 'change') IS NOT NULL FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801601'),
  'a player of the team reads the mark on a practice'
);
SELECT is(
  (SELECT count(*)::int FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801606'),
  0,
  'a player does not read a meeting they are not invited to, so its mark stays hidden too'
);
SELECT is(
  (WITH u AS (UPDATE public.golf_events SET start_time = start_time + interval '1 hour' WHERE id = '00000000-0000-0000-0000-000000801601' RETURNING 1) SELECT count(*)::int FROM u),
  0,
  'a player cannot move an event, so cannot make a mark'
);

SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000801004", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_events WHERE id = '00000000-0000-0000-0000-000000801601'),
  0,
  'a player of another team reads nothing, marks included'
);
-- RLS-SECTION-END

SELECT * FROM finish();
ROLLBACK;
