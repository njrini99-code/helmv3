-- pgTAP contract for 20261117010000_golf_events_policy_team_sets.sql.
--
-- golf_events_select_team and golf_event_attendance_select_team ask for the
-- caller's coached and played teams once per query (a set) instead of calling
-- is_golf_team_coach / is_golf_team_player on every row. Who sees what must not
-- change: the meeting and class-row suites cover those rules; this file pins
-- the new form and the membership edges the set has to match exactly
-- (an inactive member, a coach of another team, an outsider).
--
-- Plan arithmetic: 5 structural + 2 coach A + 1 coach B + 2 active player
-- + 2 inactive player + 1 outsider = 13.

BEGIN;
\ir _helpers.sql

SELECT plan(13);

-- ============================================================================
-- Seed. Ids use the 0000...0191xxx range.
--   users:   coach 01 (team A), coach 02 (team B), player 03 (active on A),
--            player 04 (inactive on A), outsider 05
--   events (team A): P1 practice; attendance rows for 03 and 04 on P1
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000191001', 'coacha@teamsets.test',   'authenticated'),
    ('00000000-0000-0000-0000-000000191002', 'coachb@teamsets.test',   'authenticated'),
    ('00000000-0000-0000-0000-000000191003', 'active@teamsets.test',   'authenticated'),
    ('00000000-0000-0000-0000-000000191004', 'inactive@teamsets.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000191005', 'outsider@teamsets.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000191201', 'Team Sets Org A', 'college'),
    ('00000000-0000-0000-0000-000000191202', 'Team Sets Org B', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000191301', 'Team Sets A', 'GTSETSA1', '00000000-0000-0000-0000-000000191201'),
    ('00000000-0000-0000-0000-000000191302', 'Team Sets B', 'GTSETSB1', '00000000-0000-0000-0000-000000191202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000191401', '00000000-0000-0000-0000-000000191001', '00000000-0000-0000-0000-000000191201'),
    ('00000000-0000-0000-0000-000000191402', '00000000-0000-0000-0000-000000191002', '00000000-0000-0000-0000-000000191202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000191301', '00000000-0000-0000-0000-000000191401'),
    ('00000000-0000-0000-0000-000000191302', '00000000-0000-0000-0000-000000191402')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000191503', '00000000-0000-0000-0000-000000191003', 'Act', 'Ive'),
    ('00000000-0000-0000-0000-000000191504', '00000000-0000-0000-0000-000000191004', 'In', 'Active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000191301', '00000000-0000-0000-0000-000000191503', 'active'),
    ('00000000-0000-0000-0000-000000191301', '00000000-0000-0000-0000-000000191504', 'inactive')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_events (id, team_id, title, event_type, start_time, end_time, status) VALUES
    ('00000000-0000-0000-0000-000000191601', '00000000-0000-0000-0000-000000191301', 'P1', 'practice', now() + interval '1 day', now() + interval '1 day 2 hours', 'confirmed')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_event_attendance (event_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000191601', '00000000-0000-0000-0000-000000191503', 'pending'),
    ('00000000-0000-0000-0000-000000191601', '00000000-0000-0000-0000-000000191504', 'pending')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- Structural
-- ============================================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'golf_current_coach_team_ids'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']
  ),
  'golf_current_coach_team_ids is SECURITY DEFINER with search_path = ""'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.golf_current_coach_team_ids()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.golf_current_coach_team_ids()', 'EXECUTE'),
  'golf_current_coach_team_ids is executable by authenticated and NOT by anon'
);
SELECT ok(
  (SELECT qual FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_events' AND policyname = 'golf_events_select_team')
    !~ 'is_golf_team_(coach|player)\(',
  'golf_events_select_team no longer calls the per-row team checks'
);
SELECT ok(
  (SELECT qual FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_event_attendance' AND policyname = 'golf_event_attendance_select_team')
    !~ 'is_golf_team_(coach|player)\(',
  'golf_event_attendance_select_team no longer calls the per-row team checks'
);
SELECT is(
  (SELECT string_agg(roles::text, ',' ORDER BY tablename) FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN ('golf_events_select_team', 'golf_event_attendance_select_team')),
  '{authenticated},{authenticated}',
  'both policies still apply to authenticated only'
);

-- ============================================================================
-- Coach of team A
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000191001", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_events WHERE team_id = '00000000-0000-0000-0000-000000191301'),
  1,
  'the team''s coach reads its event'
);
SELECT is(
  (SELECT count(*)::int FROM public.golf_event_attendance WHERE event_id = '00000000-0000-0000-0000-000000191601'),
  2,
  'the team''s coach reads every reply on it'
);

-- ============================================================================
-- Coach of team B
-- ============================================================================
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000191002", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_events WHERE team_id = '00000000-0000-0000-0000-000000191301'),
  0,
  'a coach of another team reads none of team A''s events'
);

-- ============================================================================
-- Active player on team A
-- ============================================================================
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000191003", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_events WHERE team_id = '00000000-0000-0000-0000-000000191301'),
  1,
  'an active player reads the team''s practice'
);
SELECT is(
  (SELECT string_agg(player_id::text, ',') FROM public.golf_event_attendance
    WHERE event_id = '00000000-0000-0000-0000-000000191601'),
  '00000000-0000-0000-0000-000000191503',
  'an active player reads only their own reply'
);

-- ============================================================================
-- Inactive player on team A
-- ============================================================================
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000191004", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_events WHERE team_id = '00000000-0000-0000-0000-000000191301'),
  0,
  'an inactive member reads none of the team''s events'
);
SELECT is(
  (SELECT count(*)::int FROM public.golf_event_attendance WHERE event_id = '00000000-0000-0000-0000-000000191601'),
  0,
  'an inactive member reads no replies, their own included'
);

-- ============================================================================
-- Outsider
-- ============================================================================
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000191005", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_events WHERE team_id = '00000000-0000-0000-0000-000000191301'),
  0,
  'an outsider reads none of team A''s events'
);

SELECT * FROM finish();
ROLLBACK;
