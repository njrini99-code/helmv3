-- pgTAP contract for 20261117121000_golf_coach_read_actions.sql (CoachHelm reads stage 4, held).
--
-- Feedback and focus links on a read are coach-only: the team's coach reads and writes them as themselves; a coach of
-- another team cannot read or write them; a player cannot; a coach cannot write as another coach; nobody updates or
-- deletes; anon holds nothing.
--
-- Plan: 2 RLS on + 2 coach read + 2 coach insert + 1 impersonation + 2 other coach + 2 player + 1 no update + 2 anon = 14.

BEGIN;
\ir _helpers.sql

SELECT plan(14);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000918001', 'coach@readact.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000918002', 'other@readact.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000918003', 'player@readact.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000918201', 'Read Act Org', 'college'),
    ('00000000-0000-0000-0000-000000918202', 'Other Read Act Org', 'college')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000918301', 'Read Act Team', 'GRACT1', '00000000-0000-0000-0000-000000918201'),
    ('00000000-0000-0000-0000-000000918302', 'Other Read Act Team', 'GRACT2', '00000000-0000-0000-0000-000000918202')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000918401', '00000000-0000-0000-0000-000000918001', '00000000-0000-0000-0000-000000918201'),
    ('00000000-0000-0000-0000-000000918402', '00000000-0000-0000-0000-000000918002', '00000000-0000-0000-0000-000000918202')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000918301', '00000000-0000-0000-0000-000000918401'),
    ('00000000-0000-0000-0000-000000918302', '00000000-0000-0000-0000-000000918402')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000918503', '00000000-0000-0000-0000-000000918003', 'Act', 'Player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000918301', '00000000-0000-0000-0000-000000918503', 'active')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coach_read_feedback (team_id, player_id, coach_id, card_key, verdict, reason, lost_per_round, certainty, area) VALUES
    ('00000000-0000-0000-0000-000000918301', '00000000-0000-0000-0000-000000918503', '00000000-0000-0000-0000-000000918401', 'priority:strokes_gained_approach', 'not_useful', 'knew it', 1.4, 'likely', 'strokes_gained_approach');
  INSERT INTO public.golf_coach_read_focus (team_id, player_id, coach_id, card_key, part, set_on, value_on_day, rounds_on_day) VALUES
    ('00000000-0000-0000-0000-000000918301', '00000000-0000-0000-0000-000000918503', '00000000-0000-0000-0000-000000918401', 'priority:strokes_gained_approach', 'strokes_gained_approach', '2026-10-01', 1.4, 10);
END $$;

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_coach_read_feedback'::regclass), 'RLS is on for feedback');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_coach_read_focus'::regclass), 'RLS is on for focus links');

SET LOCAL role TO authenticated;

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000918001", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_coach_read_feedback), 1, 'the team coach reads the feedback');
SELECT is((SELECT count(*)::int FROM public.golf_coach_read_focus), 1, 'the team coach reads the focus links');
SELECT lives_ok($$INSERT INTO public.golf_coach_read_feedback (team_id, player_id, coach_id, card_key, verdict, reason, lost_per_round, certainty, area)
  VALUES ('00000000-0000-0000-0000-000000918301', '00000000-0000-0000-0000-000000918503', '00000000-0000-0000-0000-000000918401', 'k', 'wrong', 'not this', 1, 'clear', 'strokes_gained_putting')$$, 'the team coach writes feedback as themselves');
SELECT lives_ok($$INSERT INTO public.golf_coach_read_focus (team_id, player_id, coach_id, card_key, part, set_on, value_on_day, rounds_on_day)
  VALUES ('00000000-0000-0000-0000-000000918301', '00000000-0000-0000-0000-000000918503', '00000000-0000-0000-0000-000000918401', 'k', 'strokes_gained_putting', '2026-11-01', 0.8, 9)$$, 'the team coach writes a focus link as themselves');
SELECT throws_ok($$INSERT INTO public.golf_coach_read_feedback (team_id, player_id, coach_id, card_key, verdict, reason, lost_per_round, certainty, area)
  VALUES ('00000000-0000-0000-0000-000000918301', '00000000-0000-0000-0000-000000918503', '00000000-0000-0000-0000-000000918402', 'k', 'wrong', 'x', 1, 'clear', 'a')$$, '42501', NULL, 'a coach cannot write as another coach');

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000918002", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_coach_read_feedback), 0, 'a coach of another team reads no feedback');
SELECT throws_ok($$INSERT INTO public.golf_coach_read_focus (team_id, player_id, coach_id, card_key, part, set_on, value_on_day, rounds_on_day)
  VALUES ('00000000-0000-0000-0000-000000918301', '00000000-0000-0000-0000-000000918503', '00000000-0000-0000-0000-000000918402', 'k', 'p', '2026-11-01', 1, 1)$$, '42501', NULL, 'nor writes a focus link for that team');

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000918003", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_coach_read_feedback), 0, 'the player reads no feedback on their read');
SELECT is((SELECT count(*)::int FROM public.golf_coach_read_focus), 0, 'nor the focus links');

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000918001", "role": "authenticated"}';
SELECT throws_ok($$UPDATE public.golf_coach_read_feedback SET reason = 'changed'$$, '42501', NULL, 'feedback is append-only');

RESET role;
SELECT ok(NOT has_table_privilege('anon', 'public.golf_coach_read_feedback', 'SELECT'), 'anon cannot read feedback');
SELECT ok(NOT has_table_privilege('anon', 'public.golf_coach_read_focus', 'SELECT'), 'anon cannot read focus links');

SELECT * FROM finish();
ROLLBACK;
