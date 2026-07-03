-- pgTAP contracts for BaseballHelm Performance / Lifting visibility gating
-- (migration 20260624000061_baseball_lifting_performance.sql).
--
-- Security-critical invariants (as of the original Wave 9 packet — the
-- lift-results/readiness/assignments invariants below are now covered by the
-- helm_lifting_* successor once a dedicated RLS suite exists for it; see the
-- 2026-07-04 note further down):
--   * A PLAYER may read only their OWN lift results and readiness check-ins; a
--     teammate's loads / readiness must never be reachable by another player.
--   * Staff reads of readiness require the can_view_readiness performance gate.
--   * Exercise-library / assignment WRITES are gated on can_manage_lifting.
--   * RLS is enabled on baseball_exercises and anon has no privileges.
--
-- Schema-light: asserts the contract over pg_policy / pg_class / pg_constraint
-- without seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: Wave 9 performance-lifting packet (BaseballHelm).
--
-- 2026-07-04 graveyard update: baseball_lift_assignments, baseball_lift_results,
-- and baseball_readiness_checkins moved out of public into the graveyard schema
-- (20260704070000_graveyard_dead_liftlab_tables_phase2.sql — orphaned demo-seed
-- rows, zero readers post signals-bridge rewire; helm_lifting_* is the live
-- canonical successor, not yet covered by a dedicated RLS suite). All
-- assertions and fixtures for those three tables were removed below; only
-- baseball_exercises (still public, still write-gated) remains under test.
-- See docs/audits/DB_TABLE_AUDIT_2026-07-04.md.

BEGIN;
\ir _helpers.sql

SELECT plan(8);

-- ============================================================================
-- 1. RLS enabled + anon locked out on baseball_exercises.
--    (baseball_lift_assignments / baseball_lift_results /
--    baseball_readiness_checkins graveyarded 2026-07-04 — see header.)
-- ============================================================================
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_exercises'),
  'RLS is ENABLED on baseball_exercises'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_exercises', 'SELECT'), true, 'anon cannot SELECT baseball_exercises');

-- No policy on the lifting table targets the anon role.
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('baseball_exercises')
       AND 'anon' = ANY(roles)),
  0,
  'no lifting policy targets the anon role'
);

-- (Sections 2-4 formerly tested baseball_lift_results, baseball_readiness_checkins,
-- and baseball_lift_assignments — all graveyarded 2026-07-04. Removed; see header.)

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
-- 6. Each remaining lifting table has a full policy set (no implicit-deny
--    gaps for staff). (baseball_lift_assignments / baseball_lift_results /
--    baseball_readiness_checkins graveyarded 2026-07-04 — see header.)
-- ============================================================================
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_exercises'),
  '>=', 4, 'baseball_exercises has SELECT/INSERT/UPDATE/DELETE policies'
);

SELECT * FROM finish();
ROLLBACK;
