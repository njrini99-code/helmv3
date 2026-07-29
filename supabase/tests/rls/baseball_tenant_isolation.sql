-- pgTAP contracts for the BaseballHelm tenant-isolation RLS fix, which ships
-- as a SEQUENCED PAIR of migrations:
--
--   supabase/migrations/20260729000100_baseball_tenant_isolation_rls_a_additive.sql
--     Creates the helper + RPCs only. Purely additive; changes nothing.
--   supabase/migrations/20260729000200_baseball_tenant_isolation_rls_b_policies.sql
--     Replaces the two USING(true) SELECT policies. This is the one that
--     closes the leak, and the one that breaks the app if the companion
--     app changes are not deployed first.
--
-- THIS SUITE ASSERTS THE POST-B STATE. Running it against a database where
-- only A has been applied will fail the policy-behaviour groups (the
-- USING(true) policies are still in place) — that is a correct failure, not a
-- broken test. Apply both before running it.
--
-- Guards against the CONFIRMED CRIT cross-tenant exposure this migration
-- closes: baseball_players_select and baseball_teams_select were both
-- `USING (true)` in the 2026-05-27 baseline, letting any authenticated user
-- read every program's roster PII and every team's join_code.
--
-- Style: mixes schema-light introspection (function invariants, policy qual
-- text — matches baseball_staff_capabilities.sql / golf_team_coach_staff.sql)
-- with BEHAVIORAL seeding + impersonation via `SET LOCAL role` +
-- `request.jwt.claims` (matches baseball_scope_player_ids_isolation.sql /
-- baseball_recalc_body_guards.sql / golf_coach_insights_cross_tenant_select.
-- sql) for the actual tenant-isolation and recruiting-discoverability
-- assertions the task requires.
--
-- NOTE: college-player-type + recruiting_activated=true is blocked at the
-- table level by CHECK constraints baseball_players_college_no_recruiting /
-- baseball_players_college_recruiting_check (20260630170000 /
-- 20260624002000) — that branch of
-- is_baseball_player_recruiting_discoverable() cannot be exercised
-- behaviorally here without violating those constraints, so it is left as a
-- schema-only defensive read documented in the migration, not a pgTAP case.

BEGIN;
\ir _helpers.sql

SELECT plan(32);

-- ============================================================================
-- GROUP 1 — function invariants (SECURITY DEFINER, pinned search_path,
-- anon-excluded grants). Mirrors the invariant blocks in every sibling suite.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_baseball_player_recruiting_discoverable'
      AND p.prosecdef = true
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ),
  'is_baseball_player_recruiting_discoverable is SECURITY DEFINER with pinned search_path'
);

SELECT isnt(
  has_function_privilege('anon', 'public.is_baseball_player_recruiting_discoverable(uuid, public.baseball_player_type, boolean)', 'EXECUTE'),
  true,
  'anon cannot execute is_baseball_player_recruiting_discoverable'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.is_baseball_player_recruiting_discoverable(uuid, public.baseball_player_type, boolean)', 'EXECUTE'),
  'authenticated CAN execute is_baseball_player_recruiting_discoverable'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'resolve_baseball_team_by_join_code'
      AND p.prosecdef = true
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ),
  'resolve_baseball_team_by_join_code is SECURITY DEFINER with pinned search_path'
);

SELECT isnt(
  has_function_privilege('anon', 'public.resolve_baseball_team_by_join_code(text)', 'EXECUTE'),
  true,
  'anon cannot execute resolve_baseball_team_by_join_code'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.resolve_baseball_team_by_join_code(text)', 'EXECUTE'),
  'authenticated CAN execute resolve_baseball_team_by_join_code'
);

-- ============================================================================
-- GROUP 2 — policy shape: baseball_players_select / baseball_teams_select
-- are SELECT policies whose USING clause references the intended helpers
-- (not a bare `true`).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_players'
      AND p.polname = 'baseball_players_select'
      AND p.polcmd = 'r'
  ),
  'baseball_players_select policy exists as a SELECT policy'
);

SELECT ok(
  position('can_view_baseball_player' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_players'
        AND p.polname = 'baseball_players_select'
  ), '')) > 0,
  'baseball_players_select USING clause references can_view_baseball_player (team-staff branch)'
);

SELECT ok(
  position('is_baseball_player_recruiting_discoverable' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_players'
        AND p.polname = 'baseball_players_select'
  ), '')) > 0,
  'baseball_players_select USING clause references is_baseball_player_recruiting_discoverable (recruiting branch)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_teams'
      AND p.polname = 'baseball_teams_select'
      AND p.polcmd = 'r'
  ),
  'baseball_teams_select policy exists as a SELECT policy'
);

SELECT ok(
  position('is_baseball_team_staff' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_teams'
        AND p.polname = 'baseball_teams_select'
  ), '')) > 0,
  'baseball_teams_select USING clause references is_baseball_team_staff'
);

-- has_any_baseball_team_membership, NOT is_baseball_team_member. The latter
-- requires status = 'active', but a join inserts 'pending' whenever the team
-- requires coach approval (the fail-closed default) — so under the
-- active-only helper a player who had just joined could not read the team
-- they joined, and their own pending-approval screen would render nothing.
SELECT ok(
  position('has_any_baseball_team_membership' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_teams'
        AND p.polname = 'baseball_teams_select'
  ), '')) > 0,
  'baseball_teams_select admits ANY membership status, not just active'
);

-- ============================================================================
-- GROUP 3 — anon defense-in-depth: no table-level SELECT grant remains.
-- ============================================================================

SELECT isnt(has_table_privilege('anon', 'public.baseball_players', 'SELECT'), true, 'anon cannot SELECT baseball_players');
SELECT isnt(has_table_privilege('anon', 'public.baseball_teams', 'SELECT'), true, 'anon cannot SELECT baseball_teams');

-- ============================================================================
-- SEED — two "home" teams (A, B) each with one coach + one player, a
-- discoverable high_school team (C) with a recruiting-activated player, a
-- discoverable juco team (D) with a recruiting-activated juco player, and a
-- recruiting-activated player with NO team assignment at all (G). Plus a
-- non-recruiting coach_type (F, high_school) to prove coach_type gating.
-- ============================================================================
DO $$
BEGIN
  -- --- Team A: Coach A (college) + Player A1 (own roster, non-recruiting) ---
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000ba101', 'coacha@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000ba201', 'playera1@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000ba101', 'coacha@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000ba201', 'playera1@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_coaches (id, user_id, coach_type, full_name)
    VALUES ('00000000-0000-0000-0000-0000000ba102', '00000000-0000-0000-0000-0000000ba101', 'college', 'Coach A')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, name, team_type, join_code)
    VALUES ('00000000-0000-0000-0000-0000000ba103', 'Team A', 'college', 'CODEAAAA')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_coach_staff
    (team_id, coach_id, role, is_primary, is_head_coach, status)
  VALUES
    ('00000000-0000-0000-0000-0000000ba103', '00000000-0000-0000-0000-0000000ba102', 'head_coach', true, true, 'active')
  ON CONFLICT (team_id, coach_id) DO UPDATE SET is_primary = true, is_head_coach = true, status = 'active';

  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated)
    VALUES ('00000000-0000-0000-0000-0000000ba202', '00000000-0000-0000-0000-0000000ba201', 'college', false)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000ba103', '00000000-0000-0000-0000-0000000ba202', 'active')
  ON CONFLICT DO NOTHING;

  -- --- Team B: Player B1 (a different program's roster; not recruiting) ---
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000bb201', 'playerb1@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000bb201', 'playerb1@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, name, team_type, join_code)
    VALUES ('00000000-0000-0000-0000-0000000bb103', 'Team B', 'college', 'CODEBBBB')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated)
    VALUES ('00000000-0000-0000-0000-0000000bb202', '00000000-0000-0000-0000-0000000bb201', 'college', false)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000bb103', '00000000-0000-0000-0000-0000000bb202', 'active')
  ON CONFLICT DO NOTHING;

  -- --- Team C: discoverable high_school org, Player C1 recruiting-activated ---
  INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-0000000bc001', 'Discoverable HS', 'high_school')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, organization_id, name, team_type, join_code)
    VALUES ('00000000-0000-0000-0000-0000000bc103', '00000000-0000-0000-0000-0000000bc001', 'Team C', 'high_school', 'CODECCCC')
  ON CONFLICT DO NOTHING;

  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000bc201', 'playerc1@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000bc201', 'playerc1@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated)
    VALUES ('00000000-0000-0000-0000-0000000bc202', '00000000-0000-0000-0000-0000000bc201', 'high_school', true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000bc103', '00000000-0000-0000-0000-0000000bc202', 'active')
  ON CONFLICT DO NOTHING;

  -- --- Team D: discoverable juco org, Player E1 recruiting-activated juco ---
  INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-0000000bd001', 'Discoverable JUCO', 'juco')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_teams (id, organization_id, name, team_type, join_code)
    VALUES ('00000000-0000-0000-0000-0000000bd103', '00000000-0000-0000-0000-0000000bd001', 'Team D', 'juco', 'CODEDDDD')
  ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000be201', 'playere1@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000be201', 'playere1@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated)
    VALUES ('00000000-0000-0000-0000-0000000be202', '00000000-0000-0000-0000-0000000be201', 'juco', true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000bd103', '00000000-0000-0000-0000-0000000be202', 'active')
  ON CONFLICT DO NOTHING;

  -- --- Coach D: juco coach_type (for JUCO-JUCO block + JUCO-can-see-HS) ---
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000bd401', 'coachd@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000bd401', 'coachd@helm.test', 'coach')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_coaches (id, user_id, coach_type, full_name)
    VALUES ('00000000-0000-0000-0000-0000000bd402', '00000000-0000-0000-0000-0000000bd401', 'juco', 'Coach D')
  ON CONFLICT DO NOTHING;

  -- --- Coach F: high_school coach_type (non-recruiting — must see nothing) ---
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000bf601', 'coachf@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000bf601', 'coachf@helm.test', 'coach')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_coaches (id, user_id, coach_type, full_name)
    VALUES ('00000000-0000-0000-0000-0000000bf602', '00000000-0000-0000-0000-0000000bf601', 'high_school', 'Coach F')
  ON CONFLICT DO NOTHING;

  -- --- Player G1: recruiting-activated, but NO team assignment at all ---
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000b7701', 'playerg1@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000b7701', 'playerg1@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated)
    VALUES ('00000000-0000-0000-0000-0000000b7702', '00000000-0000-0000-0000-0000000b7701', 'high_school', true)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- GROUP 4 — baseball_players tenant isolation (coach role).
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000ba101", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.baseball_players WHERE id = '00000000-0000-0000-0000-0000000ba202'),
  1,
  'Coach A CAN read Player A1 (own team roster)'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_players WHERE id = '00000000-0000-0000-0000-0000000bb202'),
  0,
  'Coach A CANNOT read Player B1 (a different program''s roster, not recruiting-eligible)'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- GROUP 5 — baseball_teams tenant isolation (player role) + join_code.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000ba201", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.baseball_teams WHERE id = '00000000-0000-0000-0000-0000000ba103'),
  1,
  'Player A1 CAN read Team A (their own team''s roster/profile row)'
);

SELECT is(
  (SELECT join_code FROM public.baseball_teams WHERE id = '00000000-0000-0000-0000-0000000ba103'),
  'CODEAAAA',
  'Player A1 CAN read Team A''s own join_code'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_teams WHERE id = '00000000-0000-0000-0000-0000000bb103'),
  0,
  'Player A1 CANNOT read Team B (a different program''s team row)'
);

RESET role;
RESET request.jwt.claims;

-- Coach-side mirror: same team-isolation contract, from the staff side.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000ba101", "role": "authenticated"}';

SELECT is(
  (SELECT join_code FROM public.baseball_teams WHERE id = '00000000-0000-0000-0000-0000000ba103'),
  'CODEAAAA',
  'Coach A CAN read Team A''s own join_code (staff clause)'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_teams WHERE id = '00000000-0000-0000-0000-0000000bb103'),
  0,
  'Coach A CANNOT read Team B''s row at all (join_code included) — cross-tenant join_code exposure closed'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- GROUP 6 — recruiting-discoverability backstop, behavioral, via the
-- helper function directly (mirrors how baseball_scope_player_ids_isolation.
-- sql exercises can_view_baseball_player directly rather than only through
-- a table SELECT).
--
-- player_type and recruiting_activated are passed as LITERALS matching the
-- state each seed/UPDATE above established — never read back from
-- baseball_players. Two reasons, and the first is disqualifying:
--
--   1. These calls run under `SET LOCAL role TO authenticated`, so a read-back
--      would itself be filtered by the very policy under test. The test would
--      be asking the policy what to feed the policy, and would pass or fail
--      for reasons unrelated to the predicate.
--   2. It is the accurate simulation. In production the POLICY supplies these
--      columns from the row it is judging, so supplying them directly is what
--      actually happens.
-- ============================================================================

-- College coach A can see recruiting-activated HS Player C1 (discoverable team).
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000ba101", "role": "authenticated"}';

SELECT is(
  public.is_baseball_player_recruiting_discoverable(
    '00000000-0000-0000-0000-0000000bc202'::uuid,
    'high_school'::public.baseball_player_type,
    true
  ),
  true,
  'College coach A CAN see recruiting-activated HS Player C1 (discoverable team)'
);

RESET role;
RESET request.jwt.claims;

-- Deactivate recruiting on Player C1 -> no longer discoverable.
UPDATE public.baseball_players SET recruiting_activated = false
 WHERE id = '00000000-0000-0000-0000-0000000bc202';

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000ba101", "role": "authenticated"}';

SELECT is(
  public.is_baseball_player_recruiting_discoverable(
    '00000000-0000-0000-0000-0000000bc202'::uuid,
    'high_school'::public.baseball_player_type,
    false
  ),
  false,
  'College coach A CANNOT see Player C1 once recruiting_activated is false'
);

RESET role;
RESET request.jwt.claims;

-- Reactivate, then flip profile_visibility to 'private' -> hidden regardless.
UPDATE public.baseball_players SET recruiting_activated = true
 WHERE id = '00000000-0000-0000-0000-0000000bc202';

INSERT INTO public.baseball_player_settings (player_id, profile_visibility)
  VALUES ('00000000-0000-0000-0000-0000000bc202', 'private')
ON CONFLICT (player_id) DO UPDATE SET profile_visibility = 'private';

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000ba101", "role": "authenticated"}';

SELECT is(
  public.is_baseball_player_recruiting_discoverable(
    '00000000-0000-0000-0000-0000000bc202'::uuid,
    'high_school'::public.baseball_player_type,
    true
  ),
  false,
  'College coach A CANNOT see Player C1 once profile_visibility is private'
);

RESET role;
RESET request.jwt.claims;

-- Restore visibility to public for the remaining cases.
UPDATE public.baseball_player_settings SET profile_visibility = 'public'
 WHERE player_id = '00000000-0000-0000-0000-0000000bc202';

-- JUCO coach D can see HS Player C1 (JUCO coaches may recruit HS/showcase).
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000bd401", "role": "authenticated"}';

SELECT is(
  public.is_baseball_player_recruiting_discoverable(
    '00000000-0000-0000-0000-0000000bc202'::uuid,
    'high_school'::public.baseball_player_type,
    true
  ),
  true,
  'JUCO coach D CAN see recruiting-activated HS Player C1'
);

-- JUCO coach D CANNOT see JUCO Player E1 (JUCO coaches may not recruit other JUCO players).
SELECT is(
  public.is_baseball_player_recruiting_discoverable(
    '00000000-0000-0000-0000-0000000be202'::uuid,
    'juco'::public.baseball_player_type,
    true
  ),
  false,
  'JUCO coach D CANNOT see recruiting-activated JUCO Player E1 (coach_type/player_type mismatch)'
);

RESET role;
RESET request.jwt.claims;

-- College coach A CAN see JUCO Player E1 (college coaches may recruit HS/showcase/juco).
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000ba101", "role": "authenticated"}';

SELECT is(
  public.is_baseball_player_recruiting_discoverable(
    '00000000-0000-0000-0000-0000000be202'::uuid,
    'juco'::public.baseball_player_type,
    true
  ),
  true,
  'College coach A CAN see recruiting-activated JUCO Player E1'
);

RESET role;
RESET request.jwt.claims;

-- Non-recruiting coach_type (high_school) sees nothing via this backstop.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000bf601", "role": "authenticated"}';

SELECT is(
  public.is_baseball_player_recruiting_discoverable(
    '00000000-0000-0000-0000-0000000bc202'::uuid,
    'high_school'::public.baseball_player_type,
    true
  ),
  false,
  'high_school coach_type CANNOT see any recruiting-activated player (coach_type gate)'
);

RESET role;
RESET request.jwt.claims;

-- A recruiting-activated player with no team assignment at all is never discoverable.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000ba101", "role": "authenticated"}';

SELECT is(
  public.is_baseball_player_recruiting_discoverable(
    '00000000-0000-0000-0000-0000000b7702'::uuid,
    'high_school'::public.baseball_player_type,
    true
  ),
  false,
  'College coach A CANNOT see recruiting-activated Player G1, who has no team assignment'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- GROUP 7 — resolve_baseball_team_by_join_code RPC: resolves an exact,
-- already-possessed code without exposing join_code itself, and does NOT
-- require the caller to already be a member (proving it fixes the join
-- flow the tightened SELECT policy would otherwise break).
-- ============================================================================

-- Called by a total stranger to Team A (Player B1) — must still resolve,
-- because the RPC is gated on possessing the correct code, not membership.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000bb201", "role": "authenticated"}';

SELECT is(
  (SELECT id FROM public.resolve_baseball_team_by_join_code('CODEAAAA')),
  '00000000-0000-0000-0000-0000000ba103'::uuid,
  'resolve_baseball_team_by_join_code resolves Team A for a non-member who supplies the correct code'
);

SELECT is(
  (SELECT count(*)::int FROM public.resolve_baseball_team_by_join_code('NOT-A-REAL-CODE')),
  0,
  'resolve_baseball_team_by_join_code returns zero rows for a non-matching code (no enumeration)'
);

RESET role;
RESET request.jwt.claims;

-- The RPC's result shape never includes join_code (id/name/team_type/
-- organization_id only) — proven behaviorally: selecting a non-existent
-- output column must raise undefined_column (42703), not silently succeed.
SELECT throws_ok(
  $$ SELECT join_code FROM public.resolve_baseball_team_by_join_code('CODEAAAA') $$,
  '42703',
  NULL,
  'resolve_baseball_team_by_join_code does not echo join_code back in its result columns'
);

SELECT * FROM finish();
ROLLBACK;
