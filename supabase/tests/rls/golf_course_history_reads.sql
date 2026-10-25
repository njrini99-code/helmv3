-- Contract test for the reads the P-7 course page and review history depend on (plan 8.8). No migration: it pins
-- today's policies so a change to them is seen here first.
--   1. A player reads their own completed rounds and holes.
--   2. A coach of the team reads rounds whose team_id is their team.
--   3. A coach of another team reads none.
--   4. A teammate player can read another player's round: why the loaders always filter player_id.
--   5. golf_round_reviews.coach_notes is readable by the round's player and by the team's coach.
-- Seeding follows golf_holes_shots_policy_consolidation.sql.

BEGIN;

SELECT plan(7);

DO $$
DECLARE
  v_org_1  uuid := '00000000-0000-0000-0000-00000000c701';
  v_org_2  uuid := '00000000-0000-0000-0000-00000000c702';
  u_head   uuid := '00000000-0000-0000-0000-00000000c711';
  u_other  uuid := '00000000-0000-0000-0000-00000000c712';
  u_player uuid := '00000000-0000-0000-0000-00000000c713';
  u_mate   uuid := '00000000-0000-0000-0000-00000000c714';
  c_head   uuid := '00000000-0000-0000-0000-00000000c721';
  c_other  uuid := '00000000-0000-0000-0000-00000000c722';
  p_player uuid := '00000000-0000-0000-0000-00000000c731';
  p_mate   uuid := '00000000-0000-0000-0000-00000000c732';
  t_x      uuid := '00000000-0000-0000-0000-00000000c741';
  t_z      uuid := '00000000-0000-0000-0000-00000000c742';
  r_round  uuid := '00000000-0000-0000-0000-00000000c751';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (u_head,   'pgtap-p7-head@helm.test',   'authenticated'),
    (u_other,  'pgtap-p7-other@helm.test',  'authenticated'),
    (u_player, 'pgtap-p7-player@helm.test', 'authenticated'),
    (u_mate,   'pgtap-p7-mate@helm.test',   'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    (u_head,   'pgtap-p7-head@helm.test',   'coach'),
    (u_other,  'pgtap-p7-other@helm.test',  'coach'),
    (u_player, 'pgtap-p7-player@helm.test', 'player'),
    (u_mate,   'pgtap-p7-mate@helm.test',   'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    (v_org_1, 'pgtap-p7-org-1', 'college'),
    (v_org_2, 'pgtap-p7-org-2', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    (c_head,  u_head,  v_org_1),
    (c_other, u_other, v_org_2)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id) VALUES
    (p_player, u_player),
    (p_mate,   u_mate)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id, gender) VALUES
    (t_x, 'pgtap-p7-team-X', 'PGP7X1', v_org_1, 'mens'),
    (t_z, 'pgtap-p7-team-Z', 'PGP7Z1', v_org_2, 'mens')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (t_x, c_head,  'head_coach', true),
    (t_z, c_other, 'head_coach', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (t_x, p_player, 'active'),
    (t_x, p_mate,   'active')
  ON CONFLICT DO NOTHING;

  -- Seeded in progress (the totals trigger needs holes first), then marked completed.
  INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, status, course_name) VALUES
    (r_round, p_player, t_x, CURRENT_DATE, 'in_progress', 'pgtap-p7 Finley')
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_player::text, 'role', 'authenticated')::text, true);
  INSERT INTO public.golf_holes (round_id, hole_number, par, score) VALUES (r_round, 1, 4, 5) ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Completing a round goes through the protected atomic path (guard_golf_round_lifecycle), as round submit does.
  PERFORM set_config('helm.golf_lifecycle_write', 'atomic', true);
  UPDATE public.golf_rounds SET status = 'completed' WHERE id = r_round;
  PERFORM set_config('helm.golf_lifecycle_write', '', true);
  INSERT INTO public.golf_round_reviews (round_id, player_id, coach_notes) VALUES (r_round, p_player, 'pgtap-p7 note')
  ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION pg_temp.as_user(p_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
END $$;

-- 1. The player.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000c713');
SELECT is((SELECT count(*)::int FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000c751' AND status = 'completed'), 1, 'a player reads their own completed round');
SELECT is((SELECT count(*)::int FROM public.golf_holes WHERE round_id = '00000000-0000-0000-0000-00000000c751'), 1, 'a player reads their own holes');
SELECT is((SELECT coach_notes FROM public.golf_round_reviews WHERE round_id = '00000000-0000-0000-0000-00000000c751'), 'pgtap-p7 note', 'a player reads the coach note on their round');
RESET ROLE;

-- 2 and 5. The team's coach.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000c711');
SELECT is((SELECT count(*)::int FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000c751'), 1, 'the team''s coach reads a round posted for the team');
SELECT is((SELECT coach_notes FROM public.golf_round_reviews WHERE round_id = '00000000-0000-0000-0000-00000000c751'), 'pgtap-p7 note', 'the team''s coach reads the coach note');
RESET ROLE;

-- 3. A coach of another team.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000c712');
SELECT is((SELECT count(*)::int FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000c751'), 0, 'a coach of another team reads none');
RESET ROLE;

-- 4. A teammate: documents why every loader filters player_id.
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000c714');
SELECT is((SELECT count(*)::int FROM public.golf_rounds WHERE id = '00000000-0000-0000-0000-00000000c751'), 1, 'a teammate can read another player''s round, so the loaders filter player_id');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
