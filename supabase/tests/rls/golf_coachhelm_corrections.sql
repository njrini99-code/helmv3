-- CoachHelm Slice 6a: golf_coachhelm_corrections
-- (20261020121000_golf_coachhelm_corrections.sql). The author reads their
-- own rows; a coach of a team the player is active on reads them (the row's
-- own team_id grants nothing); super admins read all. Inserts only as
-- yourself (coach of the player's team, or the player on their own read with
-- team_id null or one of their active teams). No UPDATE or DELETE for
-- authenticated; anon has nothing. The last six assertions are behavioural:
-- a player cannot steer a row to an unrelated team's coaches.

BEGIN;
\ir _helpers.sql

SELECT plan(17);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.golf_coachhelm_corrections'::regclass),
  'RLS is enabled on golf_coachhelm_corrections'
);

SELECT ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_coachhelm_corrections') = 2,
  'exactly two policies (one SELECT, one INSERT)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_coachhelm_corrections'
      AND policyname = 'golf_coachhelm_corrections_select'
      AND cmd = 'SELECT'
      AND qual LIKE '%author_user_id%'
      AND qual LIKE '%is_golf_team_coach%'
      AND qual LIKE '%is_super_admin%'
  ),
  'SELECT admits the author, the player''s team coaches and super admins'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_coachhelm_corrections'
      AND policyname = 'golf_coachhelm_corrections_insert_author'
      AND cmd = 'INSERT'
  ),
  'one INSERT policy'
);

SELECT ok(
  tests.policy_with_check_contains('public', 'golf_coachhelm_corrections',
    'golf_coachhelm_corrections_insert_author', 'auth.uid()'),
  'INSERT is only as yourself'
);

SELECT ok(
  tests.policy_with_check_contains('public', 'golf_coachhelm_corrections',
    'golf_coachhelm_corrections_insert_author', 'golf_coach_insights'),
  'INSERT requires the insight to belong to the player'
);

SELECT ok(
  NOT has_table_privilege(
    'anon', 'public.golf_coachhelm_corrections', 'SELECT')
  AND NOT has_table_privilege(
    'anon', 'public.golf_coachhelm_corrections', 'INSERT'),
  'anon cannot SELECT or INSERT'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated', 'public.golf_coachhelm_corrections', 'UPDATE')
  AND NOT has_table_privilege(
    'authenticated', 'public.golf_coachhelm_corrections', 'DELETE'),
  'authenticated cannot UPDATE or DELETE (append-only)'
);

SELECT ok(
  has_table_privilege(
    'authenticated', 'public.golf_coachhelm_corrections', 'INSERT')
  AND has_table_privilege(
    'authenticated', 'public.golf_coachhelm_corrections', 'SELECT'),
  'authenticated can SELECT and INSERT (rows filtered by the policies)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_corrections'::regclass
      AND conname = 'golf_coachhelm_corrections_player_kinds'
      AND contype = 'c'
  ),
  'a player may only record not_this or confirm'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_corrections'::regclass
      AND conname = 'golf_coachhelm_corrections_reason_only_on_not_this'
      AND contype = 'c'
  ),
  'a reason chip only goes with not_this'
);

-- ============================================================================
-- Behaviour: team_id cannot route a player's row to an unrelated team.
-- Seed as the session owner (RLS bypassed). The player is active on team X
-- only; coach Z staffs team Z in another organisation.
-- ============================================================================
DO $$
DECLARE
  v_org_x    uuid := '00000000-0000-0000-0000-0000000c6a01';
  v_org_z    uuid := '00000000-0000-0000-0000-0000000c6a02';
  v_userc_x  uuid := '00000000-0000-0000-0000-0000000c6a11';
  v_coach_x  uuid := '00000000-0000-0000-0000-0000000c6a12';
  v_team_x   uuid := '00000000-0000-0000-0000-0000000c6a13';
  v_userp    uuid := '00000000-0000-0000-0000-0000000c6a14';
  v_player   uuid := '00000000-0000-0000-0000-0000000c6a15';
  v_userc_z  uuid := '00000000-0000-0000-0000-0000000c6a21';
  v_coach_z  uuid := '00000000-0000-0000-0000-0000000c6a22';
  v_team_z   uuid := '00000000-0000-0000-0000-0000000c6a23';
  v_insight  uuid := '00000000-0000-0000-0000-0000000c6a31';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (v_userc_x, 'corrections-coach-x@helm.test', 'authenticated'),
    (v_userc_z, 'corrections-coach-z@helm.test', 'authenticated'),
    (v_userp,   'corrections-player@helm.test',  'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    (v_userc_x, 'corrections-coach-x@helm.test', 'coach'),
    (v_userc_z, 'corrections-coach-z@helm.test', 'coach'),
    (v_userp,   'corrections-player@helm.test',  'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    (v_org_x, 'pgtap-corrections-org-x', 'college'),
    (v_org_z, 'pgtap-corrections-org-z', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    (v_coach_x, v_userc_x, v_org_x),
    (v_coach_z, v_userc_z, v_org_z)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id) VALUES
    (v_player, v_userp)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id, gender) VALUES
    (v_team_x, 'pgtap-corrections-team-X', 'PGC6AX', v_org_x, 'mens'),
    (v_team_z, 'pgtap-corrections-team-Z', 'PGC6AZ', v_org_z, 'mens')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (v_team_x, v_coach_x, 'head_coach', true),
    (v_team_z, v_coach_z, 'head_coach', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (v_team_x, v_player, 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coach_insights
    (id, coach_id, player_id, team_id, insight_type, title, content, priority, category)
  VALUES
    (v_insight, v_coach_x, v_player, v_team_x,
       'putting', 'Corrections fixture', 'synthetic', 'high', 'putting')
  ON CONFLICT DO NOTHING;

  -- A row tagged with the unrelated team, as if written before this policy
  -- (or by the service role): coach Z must still not see it.
  INSERT INTO public.golf_coachhelm_corrections
    (insight_id, player_id, team_id, author_user_id, author_role, kind)
  VALUES
    (v_insight, v_player, v_team_z, v_userp, 'player', 'confirm');
END $$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000c6a14", "role": "authenticated"}';

SELECT throws_ok(
  $$INSERT INTO public.golf_coachhelm_corrections
      (insight_id, player_id, team_id, author_user_id, author_role, kind)
    VALUES ('00000000-0000-0000-0000-0000000c6a31',
            '00000000-0000-0000-0000-0000000c6a15',
            '00000000-0000-0000-0000-0000000c6a23',
            '00000000-0000-0000-0000-0000000c6a14', 'player', 'not_this')$$,
  '42501',
  NULL,
  'a player CANNOT tag a correction with a team they are not active on'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_coachhelm_corrections
      (insight_id, player_id, team_id, author_user_id, author_role, kind)
    VALUES ('00000000-0000-0000-0000-0000000c6a31',
            '00000000-0000-0000-0000-0000000c6a15',
            '00000000-0000-0000-0000-0000000c6a13',
            '00000000-0000-0000-0000-0000000c6a14', 'player', 'not_this')$$,
  'a player CAN tag a correction with their own active team'
);

SELECT lives_ok(
  $$INSERT INTO public.golf_coachhelm_corrections
      (insight_id, player_id, team_id, author_user_id, author_role, kind)
    VALUES ('00000000-0000-0000-0000-0000000c6a31',
            '00000000-0000-0000-0000-0000000c6a15',
            NULL,
            '00000000-0000-0000-0000-0000000c6a14', 'player', 'confirm')$$,
  'a player CAN record a correction with no team'
);

-- Coach Z staffs only the unrelated team.
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000c6a21", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_coachhelm_corrections
   WHERE player_id = '00000000-0000-0000-0000-0000000c6a15'),
  0,
  'a coach of an unrelated team sees none of the player''s corrections, even one tagged with their team'
);

-- Coach X staffs the player's active team.
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000c6a11", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_coachhelm_corrections
   WHERE player_id = '00000000-0000-0000-0000-0000000c6a15'),
  3,
  'a coach of the player''s active team sees all three of the player''s corrections'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_coachhelm_corrections
      (insight_id, player_id, team_id, author_user_id, author_role, kind)
    VALUES ('00000000-0000-0000-0000-0000000c6a31',
            '00000000-0000-0000-0000-0000000c6a15',
            '00000000-0000-0000-0000-0000000c6a23',
            '00000000-0000-0000-0000-0000000c6a11', 'coach', 'not_this')$$,
  '42501',
  NULL,
  'a coach CANNOT tag a correction with a team they do not staff'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
