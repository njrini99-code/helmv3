-- Contract for 20261007104000_wrap_auth_uid_in_seven_policies.sql.
-- The seven advisor-flagged policies evaluate auth.uid() once per statement
-- (inside a scalar subquery) and keep their commands and roles.

BEGIN;
\ir _helpers.sql

SELECT plan(8);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public'
     AND (tablename, policyname) IN (
       ('baseball_players', 'baseball_players_select'),
       ('baseball_settings_audit_log', 'baseball_settings_audit_log_insert'),
       ('crm_stage_transitions', 'crm_stage_transitions_admin_read'),
       ('golf_course_tees', 'golf_course_tees_update'),
       ('golf_courses', 'golf_courses_update_authenticated'),
       ('golf_rounds', 'golf_rounds_update'),
       ('golf_rounds', 'golf_rounds_update_team'))),
  7,
  'all seven policies still exist'
);

SELECT is_empty(
  $$SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND (tablename, policyname) IN (
        ('baseball_players', 'baseball_players_select'),
        ('baseball_settings_audit_log', 'baseball_settings_audit_log_insert'),
        ('crm_stage_transitions', 'crm_stage_transitions_admin_read'),
        ('golf_course_tees', 'golf_course_tees_update'),
        ('golf_courses', 'golf_courses_update_authenticated'),
        ('golf_rounds', 'golf_rounds_update'),
        ('golf_rounds', 'golf_rounds_update_team'))
      AND regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                         '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') ~ 'auth\.uid\(\)'$$,
  'none of the seven policies calls a bare auth.uid() any more'
);

SELECT is(
  (SELECT string_agg(cmd, ',' ORDER BY policyname) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'golf_rounds'
     AND policyname IN ('golf_rounds_update', 'golf_rounds_update_team')),
  'UPDATE,UPDATE',
  'the golf_rounds policies are still UPDATE policies'
);

SELECT is(
  (SELECT roles::text FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'baseball_players' AND policyname = 'baseball_players_select'),
  '{authenticated}',
  'baseball_players_select keeps its role list'
);

-- Behaviour: a player can still update their own in-progress round, and a
-- stranger still cannot.
DO $$
DECLARE
  v_user   uuid := '00000000-0000-0000-0000-00000000f211';
  v_other  uuid := '00000000-0000-0000-0000-00000000f212';
  v_player uuid := '00000000-0000-0000-0000-00000000f213';
  v_round  uuid := '00000000-0000-0000-0000-00000000f214';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_user,  'pgtap-wrap-owner@helm.test',    'authenticated'),
    (v_other, 'pgtap-wrap-stranger@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    (v_user,  'pgtap-wrap-owner@helm.test',    'player'),
    (v_other, 'pgtap-wrap-stranger@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id) VALUES (v_player, v_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_rounds (id, player_id, round_date, status)
  VALUES (v_round, v_player, CURRENT_DATE, 'in_progress') ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION pg_temp.touch_round() RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  UPDATE public.golf_rounds SET course_name = course_name WHERE id = '00000000-0000-0000-0000-00000000f214';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000f211", "role": "authenticated"}';
SELECT is(pg_temp.touch_round(), 1, 'the owner can still update their own round');

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000f212", "role": "authenticated"}';
SELECT is(pg_temp.touch_round(), 0, 'a stranger still cannot update the round');
RESET ROLE;

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crm_stage_transitions'
          AND policyname = 'crm_stage_transitions_admin_read' AND cmd = 'SELECT'),
  'crm_stage_transitions_admin_read is still a SELECT policy'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_courses'
          AND policyname = 'golf_courses_update_authenticated' AND with_check IS NOT NULL),
  'golf_courses_update_authenticated keeps its WITH CHECK'
);

SELECT * FROM finish();
ROLLBACK;
