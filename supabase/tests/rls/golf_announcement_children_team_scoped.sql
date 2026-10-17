-- pgTAP contract for the coach policies on golf_announcement_recipients and
-- golf_announcement_tasks (20261017101000_golf_announcement_children_team_scoped.sql).
--
-- The live coach policies compare the announcement's team with itself, so the
-- only real gate is "has any golf_coaches row" plus whatever golf_announcements
-- rows the caller can SELECT (the policy's subquery runs under the caller's
-- RLS). A plain coach of another team cannot see the post, so is refused even
-- today (GROUP 2 pins that). The hole is a caller who CAN see the post without
-- coaching its team: a player on the team who also coaches another team (or an
-- admin with a coach row). Today that caller can address an all-team post to
-- one player (hiding it from the rest), strip a post's recipients (turning it
-- team-wide) and attach tasks. GROUP 3 fails on the live policies and passes
-- after the migration. GROUP 4 pairs every refusal with the post's own coach
-- succeeding (a policy that refuses everyone passes every refusal check).
--
-- Plan arithmetic: 1 structural + 3 other-team coach + 4 dual-role + 1 player
-- own row + 5 own coach = 14.

BEGIN;
\ir _helpers.sql

SELECT plan(14);

-- ============================================================================
-- Seed. Ids use the 0000...0172xxx range.
--   users:   coach A 01 (team A), coach B 02 (team B), player 03 (team A),
--            dual 04 (player on team A AND coach of team B)
--   posts:   601 addressed to players 03 and 04; 602 all-team (no recipients)
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000172001', 'coacha@annkids.test',  'authenticated'),
    ('00000000-0000-0000-0000-000000172002', 'coachb@annkids.test',  'authenticated'),
    ('00000000-0000-0000-0000-000000172003', 'player@annkids.test',  'authenticated'),
    ('00000000-0000-0000-0000-000000172004', 'dual@annkids.test',    'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000000172201', 'Ann Kids Org A', 'college'),
    ('00000000-0000-0000-0000-000000172202', 'Ann Kids Org B', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000000172301', 'Ann Kids Team A', 'GANNKIDA', '00000000-0000-0000-0000-000000172201'),
    ('00000000-0000-0000-0000-000000172302', 'Ann Kids Team B', 'GANNKIDB', '00000000-0000-0000-0000-000000172202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000000172401', '00000000-0000-0000-0000-000000172001', '00000000-0000-0000-0000-000000172201'),
    ('00000000-0000-0000-0000-000000172402', '00000000-0000-0000-0000-000000172002', '00000000-0000-0000-0000-000000172202'),
    ('00000000-0000-0000-0000-000000172404', '00000000-0000-0000-0000-000000172004', '00000000-0000-0000-0000-000000172202')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    ('00000000-0000-0000-0000-000000172301', '00000000-0000-0000-0000-000000172401'),
    ('00000000-0000-0000-0000-000000172302', '00000000-0000-0000-0000-000000172402'),
    ('00000000-0000-0000-0000-000000172302', '00000000-0000-0000-0000-000000172404')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000172503', '00000000-0000-0000-0000-000000172003', 'Ann', 'Player'),
    ('00000000-0000-0000-0000-000000172504', '00000000-0000-0000-0000-000000172004', 'Dual', 'Role')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000172301', '00000000-0000-0000-0000-000000172503', 'active'),
    ('00000000-0000-0000-0000-000000172301', '00000000-0000-0000-0000-000000172504', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_announcements (id, team_id, title, body, created_by) VALUES
    ('00000000-0000-0000-0000-000000172601', '00000000-0000-0000-0000-000000172301', 'Team A post (addressed)', 'Body',
     '00000000-0000-0000-0000-000000172401'),
    ('00000000-0000-0000-0000-000000172602', '00000000-0000-0000-0000-000000172301', 'Team A post (all team)', 'Body',
     '00000000-0000-0000-0000-000000172401')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_tasks (id, team_id, title) VALUES
    ('00000000-0000-0000-0000-000000172701', '00000000-0000-0000-0000-000000172301', 'Team A task')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_announcement_recipients (announcement_id, player_id) VALUES
    ('00000000-0000-0000-0000-000000172601', '00000000-0000-0000-0000-000000172503'),
    ('00000000-0000-0000-0000-000000172601', '00000000-0000-0000-0000-000000172504')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_announcement_tasks (announcement_id, task_id, sort_order) VALUES
    ('00000000-0000-0000-0000-000000172601', '00000000-0000-0000-0000-000000172701', 0)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- GROUP 1 — structural: no child policy keeps the self-comparing predicate.
-- ============================================================================
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('golf_announcement_recipients', 'golf_announcement_tasks')
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%golf_coaches%'),
  0,
  'no child policy keeps the self-comparing golf_coaches predicate'
);

-- ============================================================================
-- GROUP 2 — a plain coach of ANOTHER team: refused.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000172002", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_announcement_recipients
    WHERE announcement_id = '00000000-0000-0000-0000-000000172601'),
  0,
  'a coach of another team cannot read the post''s recipients'
);
SELECT throws_ok(
  $$INSERT INTO public.golf_announcement_recipients (announcement_id, player_id)
    VALUES ('00000000-0000-0000-0000-000000172602', '00000000-0000-0000-0000-000000172503')$$,
  '42501', NULL,
  'a coach of another team cannot add a recipient'
);
SELECT throws_ok(
  $$INSERT INTO public.golf_announcement_tasks (announcement_id, task_id, sort_order)
    VALUES ('00000000-0000-0000-0000-000000172602', '00000000-0000-0000-0000-000000172701', 0)$$,
  '42501', NULL,
  'a coach of another team cannot attach a task'
);
RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- GROUP 3 — a player on the team who coaches ANOTHER team: refused. These
-- fail on the live policies.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000172004", "role": "authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.golf_announcement_recipients (announcement_id, player_id)
    VALUES ('00000000-0000-0000-0000-000000172602', '00000000-0000-0000-0000-000000172503')$$,
  '42501', NULL,
  'a player who coaches another team cannot narrow an all-team post to one player'
);
SELECT throws_ok(
  $$INSERT INTO public.golf_announcement_tasks (announcement_id, task_id, sort_order)
    VALUES ('00000000-0000-0000-0000-000000172602', '00000000-0000-0000-0000-000000172701', 0)$$,
  '42501', NULL,
  'a player who coaches another team cannot attach a task'
);
-- DELETE under RLS is silent; check afterwards that nothing went.
DELETE FROM public.golf_announcement_recipients
 WHERE announcement_id = '00000000-0000-0000-0000-000000172601';
DELETE FROM public.golf_announcement_tasks
 WHERE announcement_id = '00000000-0000-0000-0000-000000172601';
RESET role;
RESET request.jwt.claims;

SELECT is(
  (SELECT count(*)::int FROM public.golf_announcement_recipients
    WHERE announcement_id = '00000000-0000-0000-0000-000000172601'),
  2,
  'a player who coaches another team cannot strip the post''s recipients'
);
SELECT is(
  (SELECT count(*)::int FROM public.golf_announcement_tasks
    WHERE announcement_id = '00000000-0000-0000-0000-000000172601'),
  1,
  'a player who coaches another team cannot detach the post''s tasks'
);

-- ============================================================================
-- A player of the team still reads their own recipient row (and only it).
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000172003", "role": "authenticated"}';
SELECT is(
  (SELECT string_agg(player_id::text, ',') FROM public.golf_announcement_recipients
    WHERE announcement_id = '00000000-0000-0000-0000-000000172601'),
  '00000000-0000-0000-0000-000000172503',
  'the addressed player still reads their own recipient row'
);
RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- GROUP 4 — the post's own coach (A): every action works.
-- ============================================================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000172001", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_announcement_recipients
    WHERE announcement_id = '00000000-0000-0000-0000-000000172601'),
  2,
  'the team''s coach reads the post''s recipients'
);
SELECT lives_ok(
  $$DELETE FROM public.golf_announcement_recipients
     WHERE announcement_id = '00000000-0000-0000-0000-000000172601'$$,
  'the team''s coach can remove recipients'
);
-- Re-adding the same pair would hit the table's key if the delete had not landed.
SELECT lives_ok(
  $$INSERT INTO public.golf_announcement_recipients (announcement_id, player_id)
    VALUES ('00000000-0000-0000-0000-000000172601', '00000000-0000-0000-0000-000000172503')$$,
  'the team''s coach can add a recipient'
);
SELECT lives_ok(
  $$DELETE FROM public.golf_announcement_tasks
     WHERE announcement_id = '00000000-0000-0000-0000-000000172601'$$,
  'the team''s coach can detach a task'
);
SELECT lives_ok(
  $$INSERT INTO public.golf_announcement_tasks (announcement_id, task_id, sort_order)
    VALUES ('00000000-0000-0000-0000-000000172601', '00000000-0000-0000-0000-000000172701', 0)$$,
  'the team''s coach can attach a task'
);
RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
