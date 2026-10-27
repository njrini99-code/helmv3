-- pgTAP contract for 20261027100000_golf_tournament_update_round_write.sql
-- (held), on top of 4.33's 20261024100200 and P-5's 20261025040000 and
-- 20261025040100.
--
-- The desk update writes round events at trigger depth 1, so P-5's guard
-- refuses a title or course change unless the call marks itself with
-- helm.tournament_write = 'rounds'. These cases send a rename and a round
-- course change through golf_tournament_update and check that both pass, that
-- the titles agree with 040100's "Name · Rn" form, that the mark is cleared
-- when the call returns, and that a direct title edit is still refused.
--
-- Plan arithmetic: 2 create + 3 rename + 2 course + 1 mark cleared
-- + 1 guard still on = 9.

BEGIN;
\ir _helpers.sql

SELECT plan(9);

-- ============================================================================
-- Seed. Ids use the 0000...0271xxx range.
--   coach 01 on team A; course C1.
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000271001', 'coach@tourwrite.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000271201', 'Tour Write Org', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000271301', 'Tour Write Team', 'GTWRITEA', '00000000-0000-0000-0000-000000271201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000271401', '00000000-0000-0000-0000-000000271001', '00000000-0000-0000-0000-000000271201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000271301', '00000000-0000-0000-0000-000000271401')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_courses (id, name, normalized_name, created_by_user_id) VALUES
    ('00000000-0000-0000-0000-000000271601', 'Tour Write Links', 'tour write links', '00000000-0000-0000-0000-000000271001')
  ON CONFLICT DO NOTHING;
END $$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000271001", "role": "authenticated"}';

-- ============================================================================
-- Create (2)
-- ============================================================================
SELECT lives_ok(
  $$ SELECT set_config('tw.id', public.golf_tournament_create(jsonb_build_object(
       'team_id', '00000000-0000-0000-0000-000000271301',
       'name', 'Spring Open',
       'start_date', '2026-11-10', 'end_date', '2026-11-11',
       'rounds', jsonb_build_array(
         jsonb_build_object('date', '2026-11-10'),
         jsonb_build_object('date', '2026-11-11'))))::text, true) $$,
  'a coach creates a two-round tournament'
);
SELECT results_eq(
  $$ SELECT e.title FROM public.golf_events e
       JOIN public.golf_tournament_rounds r ON r.round_event_id = e.id
      WHERE r.tournament_id = current_setting('tw.id')::uuid
      ORDER BY r.round_number $$,
  $$ VALUES ('Spring Open · R1'), ('Spring Open · R2') $$,
  'new round titles use the "Name · Rn" form'
);

-- ============================================================================
-- Rename through the desk update, rounds sent (3)
-- ============================================================================
SELECT lives_ok(
  $$ SELECT public.golf_tournament_update(
       current_setting('tw.id')::uuid,
       jsonb_build_object('name', 'Fall Open', 'rounds', jsonb_build_array(
         jsonb_build_object('date', '2026-11-10'),
         jsonb_build_object('date', '2026-11-11'))),
       (SELECT version FROM public.golf_tournaments WHERE id = current_setting('tw.id')::uuid)) $$,
  'a rename with the rounds sent passes the round guard'
);
SELECT results_eq(
  $$ SELECT e.title FROM public.golf_events e
       JOIN public.golf_tournament_rounds r ON r.round_event_id = e.id
      WHERE r.tournament_id = current_setting('tw.id')::uuid
      ORDER BY r.round_number $$,
  $$ VALUES ('Fall Open · R1'), ('Fall Open · R2') $$,
  'the round titles follow the new name in the "Name · Rn" form'
);
SELECT is(
  (SELECT count(*)::int FROM public.golf_events e
     JOIN public.golf_tournament_rounds r ON r.round_event_id = e.id
    WHERE r.tournament_id = current_setting('tw.id')::uuid
      AND e.metadata -> 'change' -> 'fields' ? 'title'),
  0,
  'a desk rename leaves no "Renamed" change mark on the round events'
);

-- ============================================================================
-- Round course change (2)
-- ============================================================================
SELECT lives_ok(
  $$ SELECT public.golf_tournament_update(
       current_setting('tw.id')::uuid,
       jsonb_build_object('rounds', jsonb_build_array(
         jsonb_build_object('date', '2026-11-10'),
         jsonb_build_object('date', '2026-11-11', 'course_id', '00000000-0000-0000-0000-000000271601'))),
       (SELECT version FROM public.golf_tournaments WHERE id = current_setting('tw.id')::uuid)) $$,
  'a round course change passes the round guard'
);
SELECT is(
  (SELECT e.course_id FROM public.golf_events e
     JOIN public.golf_tournament_rounds r ON r.round_event_id = e.id
    WHERE r.tournament_id = current_setting('tw.id')::uuid AND r.round_number = 2),
  '00000000-0000-0000-0000-000000271601'::uuid,
  'round 2''s calendar event moves to the new course'
);

-- ============================================================================
-- The mark does not outlive the call (1)
-- ============================================================================
SELECT is(
  COALESCE(current_setting('helm.tournament_write', true), ''),
  '',
  'helm.tournament_write is cleared when the update returns'
);

-- ============================================================================
-- The guard still refuses a direct title edit (1)
-- ============================================================================
SELECT throws_ok(
  $$ UPDATE public.golf_events e SET title = 'Something else'
      FROM public.golf_tournament_rounds r
     WHERE r.round_event_id = e.id AND r.tournament_id = current_setting('tw.id')::uuid
       AND r.round_number = 1 $$,
  'P0001',
  'round_fields_locked',
  'a direct title edit of a round event is still refused'
);

SELECT * FROM finish();
ROLLBACK;
