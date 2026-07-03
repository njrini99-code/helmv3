-- pgTAP contracts for BaseballHelm V11 Premium Lifting visibility gating
-- (migration 20260624000063_baseball_v11_premium_lifting.sql).
--
-- Security-critical invariants (as originally scoped by the V11 packet — the
-- set-results/soreness-maps invariants are now the helm_lifting_* successor's
-- responsibility; see the 2026-07-04 note further down):
--   * RLS is ENABLED and anon is locked out on every remaining V11 table.
--   * Player-owned health-adjacent rows (sessions / bodyweight / maxes / PRs)
--     bind the player branch to the player's OWN identity; staff reads of
--     readiness-class rows require can_view_readiness (the corrected V11 gate,
--     NOT can_view_medical).
--   * Program/group/exercise/assignment WRITES are gated on can_manage_lifting.
--   * Materialized sessions expose NO broad team-member read path (a teammate
--     can never read another player's loads).
--
-- Schema-light: asserts over pg_policy / pg_class without seeding integration
-- data (matches the deferral note in _helpers.sql).
--
-- Source: V11 premium-lifting packet (BaseballHelm).
--
-- 2026-07-04 graveyard update: baseball_lift_exercise_substitutions,
-- baseball_lift_set_results, baseball_soreness_maps, baseball_lift_import_runs,
-- and baseball_lift_import_rows moved out of public into the graveyard schema
-- (20260704060000_graveyard_dead_tables_phase1.sql /
-- 20260704070000_graveyard_dead_liftlab_tables_phase2.sql — zero readers /
-- never wired; helm_lifting_* is the live canonical successor for the
-- lifting-data tables, not yet covered by a dedicated RLS suite). All
-- assertions referencing these five tables were removed below. The remaining
-- 15 V11 tables (programs/weeks/days/sections/prescriptions/assignments/
-- sessions/session_exercises/strength-groups/bodyweight/availability/maxes/prs)
-- are still live in public and unchanged. See
-- docs/audits/DB_TABLE_AUDIT_2026-07-04.md.

BEGIN;
\ir _helpers.sql

SELECT plan(30);

-- ============================================================================
-- 1. RLS enabled + anon locked out on every new V11 table.
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.rls_on(tbl text) RETURNS boolean AS $$
  SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = tbl;
$$ LANGUAGE sql STABLE;

SELECT ok(pg_temp.rls_on('baseball_strength_groups'),            'RLS on baseball_strength_groups');
SELECT ok(pg_temp.rls_on('baseball_strength_group_members'),     'RLS on baseball_strength_group_members');
SELECT ok(pg_temp.rls_on('baseball_lift_exercises'),             'RLS on baseball_lift_exercises');
SELECT ok(pg_temp.rls_on('baseball_lift_programs'),              'RLS on baseball_lift_programs');
SELECT ok(pg_temp.rls_on('baseball_lift_weeks'),                 'RLS on baseball_lift_weeks');
SELECT ok(pg_temp.rls_on('baseball_lift_days'),                  'RLS on baseball_lift_days');
SELECT ok(pg_temp.rls_on('baseball_lift_sections'),             'RLS on baseball_lift_sections');
SELECT ok(pg_temp.rls_on('baseball_lift_prescriptions'),        'RLS on baseball_lift_prescriptions');
SELECT ok(pg_temp.rls_on('baseball_lift_program_assignments'),  'RLS on baseball_lift_program_assignments');
SELECT ok(pg_temp.rls_on('baseball_lift_sessions'),             'RLS on baseball_lift_sessions');
SELECT ok(pg_temp.rls_on('baseball_lift_session_exercises'),    'RLS on baseball_lift_session_exercises');
SELECT ok(pg_temp.rls_on('baseball_bodyweight_entries'),        'RLS on baseball_bodyweight_entries');
SELECT ok(pg_temp.rls_on('baseball_availability_statuses'),     'RLS on baseball_availability_statuses');
SELECT ok(pg_temp.rls_on('baseball_strength_maxes'),            'RLS on baseball_strength_maxes');
SELECT ok(pg_temp.rls_on('baseball_strength_prs'),              'RLS on baseball_strength_prs');

-- No V11 policy targets anon; anon has no SELECT on the sensitive session table.
-- (baseball_lift_exercise_substitutions / baseball_lift_set_results /
-- baseball_soreness_maps / baseball_lift_import_runs / baseball_lift_import_rows
-- graveyarded 2026-07-04 — removed from this list; see header.)
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'baseball_strength_groups','baseball_strength_group_members',
         'baseball_lift_exercises',
         'baseball_lift_programs','baseball_lift_weeks','baseball_lift_days',
         'baseball_lift_sections','baseball_lift_prescriptions',
         'baseball_lift_program_assignments','baseball_lift_sessions',
         'baseball_lift_session_exercises',
         'baseball_bodyweight_entries',
         'baseball_availability_statuses','baseball_strength_maxes',
         'baseball_strength_prs')
       AND 'anon' = ANY(roles)),
  0, 'no V11 lifting policy targets the anon role'
);
SELECT isnt(has_table_privilege('anon','public.baseball_lift_sessions','SELECT'), true, 'anon cannot SELECT baseball_lift_sessions');

-- ============================================================================
-- 2. Sessions — player reads OWN; teammates cannot read loads.
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.polqual(tbl text, pol text) RETURNS text AS $$
  SELECT COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = tbl AND p.polname = pol;
$$ LANGUAGE sql STABLE;

SELECT ok(pg_temp.polqual('baseball_lift_sessions','blsess_select') ~ 'get_my_baseball_player_id',
  'sessions SELECT binds player branch to own identity');
SELECT ok(pg_temp.polqual('baseball_lift_sessions','blsess_select') ~ 'can_manage_baseball_lift_group',
  'sessions SELECT non-owner path is staff-only (can_manage_baseball_lift_group)');
SELECT ok(pg_temp.polqual('baseball_lift_sessions','blsess_select') !~ 'is_baseball_team_member',
  'sessions SELECT has NO broad team-member read path');
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='public'
     AND tablename='baseball_lift_sessions' AND cmd='SELECT'),
  1, 'baseball_lift_sessions has exactly one SELECT policy');

-- (Section 3 formerly tested baseball_lift_set_results — graveyarded
-- 2026-07-04. Removed; see header.)

-- ============================================================================
-- 4. Bodyweight / availability — staff need can_view_readiness (V11 corrected
--    gate, NOT can_view_medical). (baseball_soreness_maps graveyarded
--    2026-07-04 — its two assertions removed; see header.)
-- ============================================================================
SELECT ok(pg_temp.polqual('baseball_bodyweight_entries','bbw_select') ~ 'can_view_readiness',
  'bodyweight SELECT staff path requires can_view_readiness');
SELECT ok(pg_temp.polqual('baseball_availability_statuses','bas_select') ~ 'can_view_readiness',
  'availability SELECT staff path requires can_view_readiness');
SELECT ok(pg_temp.polqual('baseball_availability_statuses','bas_select') ~ 'get_my_baseball_player_id',
  'availability is readable by the owning player');

-- ============================================================================
-- 5. Program/group/exercise WRITES gated on can_manage_lifting.
-- ============================================================================
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='baseball_lift_programs'
            AND p.polcmd='a'
            AND pg_get_expr(p.polwithcheck,p.polrelid) ~ 'can_manage_lifting'),
  'lift_programs INSERT gated on can_manage_lifting');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='baseball_strength_groups'
            AND p.polcmd='a'
            AND pg_get_expr(p.polwithcheck,p.polrelid) ~ 'can_manage_lifting'),
  'strength_groups INSERT gated on can_manage_lifting');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='baseball_lift_exercises'
            AND p.polcmd='a'
            AND pg_get_expr(p.polwithcheck,p.polrelid) ~ 'can_manage_lifting'),
  'lift_exercises INSERT gated on can_manage_lifting');

-- A player may read a team exercise (so an assigned exercise name resolves).
SELECT ok(pg_temp.polqual('baseball_lift_exercises','ble_select') ~ 'is_baseball_team_member',
  'lift_exercises SELECT lets a team player read their team''s exercises');

-- ============================================================================
-- 6. Sessions are staff-materialized: players cannot self-insert a session.
-- ============================================================================
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
              JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relname='baseball_lift_sessions'
                AND p.polcmd='a'
                AND pg_get_expr(p.polwithcheck,p.polrelid) ~ 'get_my_baseball_player_id'),
  'no INSERT policy lets a player self-create a lift session');

-- Unique (program_assignment_id, player_id) supports idempotent re-publish.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='baseball_lift_sessions'
            AND con.contype='u'
            AND pg_get_constraintdef(con.oid) ILIKE '%program_assignment_id%player_id%'),
  'sessions have UNIQUE (program_assignment_id, player_id) for safe re-publish');

SELECT * FROM finish();
ROLLBACK;
