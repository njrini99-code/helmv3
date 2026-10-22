-- pgTAP contracts for 20261017004000_golf_player_profiles_fn.sql and
-- 20261017005000_golf_players_select_drop_teammate_branch.sql
-- (security review 2026-10-16, S4).
--
-- A player could read a teammate's whole golf_players row (email, phone, gpa,
-- high_school_name, hometown, state) through user_is_teammate_of_golf_player in
-- golf_players_select. 005000 removes that branch; 004000 adds
-- golf_player_profiles, the display-columns-only way a teammate is read. CI
-- builds the database from every migration, so both are in force here.
--
-- Behavioural, through request.jwt.claims, on seeded data:
--   team A: player P1 (active), P2 (active), P3 (inactive); coach C staffed on A
--   team B: player O (active), unrelated to everyone above
--
-- Not covered (unchanged by 005000): the pending-join-request branch and the
-- admin_read_all policy beyond its existence.
--
-- Plan arithmetic: 6 structural + 11 behavioural = 17.

BEGIN;
\ir _helpers.sql

SELECT plan(17);

-- ---------------------------------------------------------------------------
-- Structural
-- ---------------------------------------------------------------------------

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.golf_player_profiles(uuid[], uuid[], uuid[])'::regprocedure
      AND prosecdef
  ),
  'golf_player_profiles exists and is SECURITY DEFINER'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.golf_player_profiles(uuid[], uuid[], uuid[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.golf_player_profiles(uuid[], uuid[], uuid[])', 'EXECUTE'),
  'golf_player_profiles is not executable by anon, and is by authenticated'
);

SELECT ok(
  pg_get_function_result('public.golf_player_profiles(uuid[], uuid[], uuid[])'::regprocedure) !~ '(email|phone|gpa|high_school_name|hometown|state)',
  'golf_player_profiles returns no email, phone, gpa, school, hometown or state column'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_players' AND policyname = 'golf_players_select'
      AND position('user_is_teammate_of_golf_player' IN qual) = 0
  ),
  'golf_players_select no longer admits a teammate'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_players' AND policyname = 'golf_players_select'
      AND position('uid()' IN qual) > 0
      AND position('user_is_coach_of_golf_player' IN qual) > 0
      AND position('user_has_pending_join_request_to_coach_team' IN qual) > 0
  ),
  'golf_players_select still admits the player themself, their coach and a coach with their pending request'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_players' AND policyname = 'admin_read_all'
  ),
  'admin_read_all on golf_players is untouched'
);

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000017004001', 'p1@scope.test',    'authenticated'),
    ('00000000-0000-0000-0000-000017004002', 'p2@scope.test',    'authenticated'),
    ('00000000-0000-0000-0000-000017004003', 'p3@scope.test',    'authenticated'),
    ('00000000-0000-0000-0000-000017004004', 'outsider@scope.test', 'authenticated'),
    ('00000000-0000-0000-0000-000017004005', 'coach@scope.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-000017004101', 'Scope Org A', 'college'),
    ('00000000-0000-0000-0000-000017004102', 'Scope Org B', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-000017004201', 'Scope Team A', 'SCOP0001', '00000000-0000-0000-0000-000017004101'),
    ('00000000-0000-0000-0000-000017004202', 'Scope Team B', 'SCOP0002', '00000000-0000-0000-0000-000017004102')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-000017004301', '00000000-0000-0000-0000-000017004005', '00000000-0000-0000-0000-000017004101')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id)
    VALUES ('00000000-0000-0000-0000-000017004201', '00000000-0000-0000-0000-000017004301')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name, email, phone, hometown, state, high_school_name, gpa, graduation_year) VALUES
    ('00000000-0000-0000-0000-000017004401', '00000000-0000-0000-0000-000017004001', 'Pone',  'One',   'p1@scope.test',       '555-0001', 'Town1', 'VA', 'School1', 3.1, 2027),
    ('00000000-0000-0000-0000-000017004402', '00000000-0000-0000-0000-000017004002', 'Ptwo',  'Two',   'p2@scope.test',       '555-0002', 'Town2', 'NC', 'School2', 3.2, 2028),
    ('00000000-0000-0000-0000-000017004403', '00000000-0000-0000-0000-000017004003', 'Pthree', 'Three', 'p3@scope.test',      '555-0003', 'Town3', 'SC', 'School3', 3.3, 2029),
    ('00000000-0000-0000-0000-000017004404', '00000000-0000-0000-0000-000017004004', 'Out',   'Sider', 'outsider@scope.test', '555-0004', 'Town4', 'GA', 'School4', 3.4, 2027)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000017004201', '00000000-0000-0000-0000-000017004401', 'active'),
    ('00000000-0000-0000-0000-000017004201', '00000000-0000-0000-0000-000017004402', 'active'),
    ('00000000-0000-0000-0000-000017004201', '00000000-0000-0000-0000-000017004403', 'inactive'),
    ('00000000-0000-0000-0000-000017004202', '00000000-0000-0000-0000-000017004404', 'active')
  ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- As player P1 (active on team A)
-- ---------------------------------------------------------------------------

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000017004001", "role": "authenticated"}';

SELECT is(
  (SELECT email FROM public.golf_players WHERE id = '00000000-0000-0000-0000-000017004401'),
  'p1@scope.test',
  'a player still reads their own full row'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_players WHERE id = '00000000-0000-0000-0000-000017004402'),
  0,
  'a player can no longer read an active teammate''s row from the table'
);

SELECT is(
  (SELECT first_name FROM public.golf_player_profiles(p_player_ids => ARRAY['00000000-0000-0000-0000-000017004402']::uuid[])),
  'Ptwo',
  'a player reads an active teammate''s name through golf_player_profiles'
);

SELECT results_eq(
  $$SELECT id FROM public.golf_player_profiles(p_team_ids => ARRAY['00000000-0000-0000-0000-000017004201']::uuid[]) ORDER BY id$$,
  $$VALUES ('00000000-0000-0000-0000-000017004401'::uuid), ('00000000-0000-0000-0000-000017004402'::uuid)$$,
  'asking for a team returns the player and the active teammates, not the inactive roster row'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_player_profiles(p_player_ids => ARRAY['00000000-0000-0000-0000-000017004404']::uuid[])),
  0,
  'a player on another team is not returned'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_player_profiles(p_player_ids => ARRAY['00000000-0000-0000-0000-000017004403']::uuid[])),
  0,
  'an inactive roster row is not an active teammate, so it is not returned'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_player_profiles()),
  0,
  'asking for nothing returns nothing, not everyone'
);

-- ---------------------------------------------------------------------------
-- As coach C (staffed on team A)
-- ---------------------------------------------------------------------------

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000017004005", "role": "authenticated"}';

SELECT is(
  (SELECT email FROM public.golf_players WHERE id = '00000000-0000-0000-0000-000017004402'),
  'p2@scope.test',
  'the team''s coach still reads a player''s full row, email included'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_player_profiles(p_team_ids => ARRAY['00000000-0000-0000-0000-000017004201']::uuid[])
    WHERE id IN ('00000000-0000-0000-0000-000017004401', '00000000-0000-0000-0000-000017004402')),
  2,
  'the coach reads the team''s active players through golf_player_profiles too'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_player_profiles(p_player_ids => ARRAY['00000000-0000-0000-0000-000017004404']::uuid[])),
  0,
  'a coach does not read a player on a team they are not staffed on'
);

-- ---------------------------------------------------------------------------
-- As anon
-- ---------------------------------------------------------------------------

RESET role;
SET LOCAL role TO anon;

SELECT throws_ok(
  $$SELECT * FROM public.golf_player_profiles(p_player_ids => ARRAY['00000000-0000-0000-0000-000017004401']::uuid[])$$,
  '42501',
  NULL,
  'anon cannot execute golf_player_profiles'
);

RESET role;
SELECT * FROM finish();
ROLLBACK;
