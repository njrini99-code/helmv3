-- pgTAP contracts for BaseballHelm Performance / Lifting visibility gating
-- (migration 20260624000061_baseball_lifting_performance.sql).
--
-- Security-critical invariants:
--   * A PLAYER may read only their OWN lift results and readiness check-ins; a
--     teammate's loads / readiness must never be reachable by another player.
--   * Staff reads of readiness require the can_view_medical health gate (there
--     is no can_view_readiness capability in the staff model).
--   * Exercise-library / assignment WRITES are gated on can_manage_lifting.
--   * RLS is enabled on all four tables and anon has no privileges.
--
-- Schema-light: asserts the contract over pg_policy / pg_class / pg_constraint
-- without seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: Wave 9 performance-lifting packet (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(34);

-- ============================================================================
-- 1. RLS enabled + anon locked out on all four tables.
-- ============================================================================
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_exercises'),
  'RLS is ENABLED on baseball_exercises'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_lift_assignments'),
  'RLS is ENABLED on baseball_lift_assignments'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_lift_results'),
  'RLS is ENABLED on baseball_lift_results'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_readiness_checkins'),
  'RLS is ENABLED on baseball_readiness_checkins'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_exercises', 'SELECT'), true, 'anon cannot SELECT baseball_exercises');
SELECT isnt(has_table_privilege('anon', 'public.baseball_lift_assignments', 'SELECT'), true, 'anon cannot SELECT baseball_lift_assignments');
SELECT isnt(has_table_privilege('anon', 'public.baseball_lift_results', 'SELECT'), true, 'anon cannot SELECT baseball_lift_results');
SELECT isnt(has_table_privilege('anon', 'public.baseball_lift_results', 'INSERT'), true, 'anon cannot INSERT baseball_lift_results');
SELECT isnt(has_table_privilege('anon', 'public.baseball_readiness_checkins', 'SELECT'), true, 'anon cannot SELECT baseball_readiness_checkins');
SELECT isnt(has_table_privilege('anon', 'public.baseball_readiness_checkins', 'INSERT'), true, 'anon cannot INSERT baseball_readiness_checkins');

-- No policy on any lifting table targets the anon role.
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('baseball_exercises','baseball_lift_assignments','baseball_lift_results','baseball_readiness_checkins')
       AND 'anon' = ANY(roles)),
  0,
  'no lifting policy targets the anon role'
);

-- ============================================================================
-- 2. baseball_lift_results — player reads OWN; teammates cannot read loads.
-- ============================================================================
-- The SELECT policy ties access to the player's OWN identity (or a managing
-- coach). The owning-player branch must reference get_my_baseball_player_id.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_lift_results'
        AND p.polname = 'baseball_lift_results_select'
  ), '') ~ 'get_my_baseball_player_id',
  'lift_results SELECT binds the player branch to the player''s own identity'
);
-- ...and the only non-owner read path is the strength-coach scope helper, so a
-- non-managing teammate can never satisfy it (it requires can_manage_lifting).
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_lift_results'
        AND p.polname = 'baseball_lift_results_select'
  ), '') ~ 'can_manage_baseball_lift_group',
  'lift_results SELECT non-owner path is gated on can_manage_baseball_lift_group (staff-only)'
);
-- The SELECT policy must NOT contain any broad team-membership read path that
-- would expose a teammate's loads.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_lift_results'
        AND p.polname = 'baseball_lift_results_select'
  ), '') !~ 'is_baseball_team_member',
  'lift_results SELECT does NOT grant a broad team-member read path'
);
-- INSERT: a player self-inserts only their OWN result; the WITH CHECK references
-- the player-identity helper.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_lift_results'
      AND p.polcmd = 'a'
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'get_my_baseball_player_id'
  ),
  'lift_results INSERT self-write is bound to the player''s own identity'
);
-- Exactly one SELECT policy exists (no second permissive policy widening reads).
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_lift_results' AND cmd = 'SELECT'),
  1,
  'baseball_lift_results has exactly one SELECT policy'
);

-- ============================================================================
-- 3. baseball_readiness_checkins — player owns; staff need can_view_medical.
-- ============================================================================
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_readiness_checkins'
        AND p.polname = 'baseball_readiness_checkins_select'
  ), '') ~ 'get_my_baseball_player_id',
  'readiness SELECT binds the player branch to the player''s own identity'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_readiness_checkins'
        AND p.polname = 'baseball_readiness_checkins_select'
  ), '') ~ 'can_view_medical',
  'readiness SELECT staff path requires the can_view_medical health gate'
);
-- The staff path is doubly gated: capability AND can_view_baseball_player.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_readiness_checkins'
        AND p.polname = 'baseball_readiness_checkins_select'
  ), '') ~ 'can_view_baseball_player',
  'readiness SELECT staff path is additionally scoped to viewable players'
);
-- No broad can_manage_lifting / team-member read path leaks readiness to peers.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_readiness_checkins'
        AND p.polname = 'baseball_readiness_checkins_select'
  ), '') !~ 'is_baseball_team_member',
  'readiness SELECT does NOT grant a broad team-member read path'
);
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_readiness_checkins' AND cmd = 'SELECT'),
  1,
  'baseball_readiness_checkins has exactly one SELECT policy'
);
-- INSERT/UPDATE/DELETE are player-self-only (no staff write path on readiness).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_readiness_checkins'
      AND p.polcmd = 'a'
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'get_my_baseball_player_id'
  ),
  'readiness INSERT is bound to the player''s own identity'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_readiness_checkins'
      AND p.polcmd = 'a'
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ '(has_baseball_staff_capability|can_manage)'
  ),
  'no staff/coach write path exists on readiness check-ins'
);
-- Unique (player_id, check_date) supports idempotent upsert (no delete+insert).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_readiness_checkins'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ILIKE '%player_id%check_date%'
  ),
  'readiness has a UNIQUE (player_id, check_date) for safe upsert'
);

-- ============================================================================
-- 4. baseball_lift_assignments — player reads OWN; staff manage scoped groups.
-- ============================================================================
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_lift_assignments'
        AND p.polname = 'baseball_lift_assignments_select'
  ), '') ~ 'get_my_baseball_player_id',
  'lift_assignments SELECT ties the player branch to the player''s own id'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_lift_assignments'
      AND p.polcmd = 'a'
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'can_manage_baseball_lift_group'
  ),
  'lift_assignments INSERT is gated on can_manage_baseball_lift_group'
);
-- A player cannot self-insert an assignment (no player-identity WITH CHECK path
-- on INSERT).
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_lift_assignments'
      AND p.polcmd = 'a'
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'get_my_baseball_player_id'
  ),
  'no INSERT policy lets a player self-assign a lift'
);

-- ============================================================================
-- 5. baseball_exercises — writes gated on can_manage_lifting.
-- ============================================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_exercises'
      AND p.polcmd = 'a'
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'has_baseball_staff_capability'
      AND pg_get_expr(p.polwithcheck, p.polrelid) ~ 'can_manage_lifting'
  ),
  'baseball_exercises INSERT is gated on can_manage_lifting'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_exercises'
      AND p.polcmd = 'w'  -- UPDATE
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'can_manage_lifting'
  ),
  'baseball_exercises UPDATE is gated on can_manage_lifting'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_exercises'
      AND p.polcmd = 'd'  -- DELETE
      AND pg_get_expr(p.polqual, p.polrelid) ~ 'can_manage_lifting'
  ),
  'baseball_exercises DELETE is gated on can_manage_lifting'
);
-- A player can read a team exercise (so an assigned lift name resolves) but only
-- via team membership, not a write path.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_exercises'
        AND p.polname = 'baseball_exercises_select'
  ), '') ~ 'is_baseball_team_member',
  'baseball_exercises SELECT lets a team player read their team''s exercises'
);

-- ============================================================================
-- 6. Each lifting table has a full policy set (no implicit-deny gaps for staff).
-- ============================================================================
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_exercises'),
  '>=', 4, 'baseball_exercises has SELECT/INSERT/UPDATE/DELETE policies'
);
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_lift_assignments'),
  '>=', 4, 'baseball_lift_assignments has SELECT/INSERT/UPDATE/DELETE policies'
);
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_lift_results'),
  '>=', 4, 'baseball_lift_results has SELECT/INSERT/UPDATE/DELETE policies'
);
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_readiness_checkins'),
  '>=', 4, 'baseball_readiness_checkins has SELECT/INSERT/UPDATE/DELETE policies'
);

SELECT * FROM finish();
ROLLBACK;
