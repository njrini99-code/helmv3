-- pgTAP contracts for the Helm Lifting Lab visibility gating that supersedes
-- BaseballHelm's V11 Premium Lifting packet (originally migration
-- 20260624000063_baseball_v11_premium_lifting.sql).
--
-- Security-critical invariants (unchanged in spirit from the original V11
-- packet, now asserted against the live helm_lifting_* successor tables —
-- see the 2026-07 program-builder→helm unification note below):
--   * RLS is ENABLED and anon is locked out on every helm_lifting_* table.
--   * An athlete reads only their OWN session/bodyweight/availability/max
--     rows (helm_lifting_is_my_athlete); staff reads gate on
--     helm_lifting_can_view_org — the single org-membership check that
--     replaces the V11-era can_view_readiness / can_manage_baseball_lift_group
--     capability functions.
--   * Program/group/exercise WRITES are gated on helm_lifting_can_edit_org
--     (the DB-layer counterpart of the app-layer can_manage_lifting
--     capability enforced in withBaseballAction).
--   * Materialized sessions expose NO broad team-member read path (a
--     teammate can never read another athlete's loads) and cannot be
--     self-inserted by an athlete — only staff (can_edit_org) materialize
--     (publish) a session.
--
-- Schema-light: asserts over pg_policy / pg_class / pg_constraint without
-- seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: Helm Lifting Lab identity + data migrations (20260625000000
-- _helm_lifting_identity.sql, 20260625000010_helm_lifting_data_library_
-- programs.sql, 20260625000020_helm_lifting_data_sessions_readiness.sql).
--
-- 2026-07 program-builder→helm unification: lifting-v11.ts (publishLiftDay,
-- the program builder, strength groups, PR detection) and every read model
-- were rewired to write/read helm_lifting_* directly and exclusively — the
-- 16 legacy V11 tables this suite used to cover (baseball_lift_programs/
-- _weeks/_days/_sections/_prescriptions/_program_assignments/_sessions/
-- _session_exercises, baseball_lift_exercises, baseball_strength_groups/
-- _group_members/_group_audit, baseball_strength_maxes/_prs,
-- baseball_bodyweight_entries, baseball_availability_statuses) are 0 rows in
-- prod and are being moved to a graveyard schema now that nothing in src/
-- references them. baseball_strength_group_audit's helm successor
-- (helm_lifting_group_audit) has its own dedicated suite —
-- see baseball_strength_group_audit.sql (retargeted alongside this file).
-- See docs/audits/DB_TABLE_AUDIT_2026-07-04.md.

BEGIN;
\ir _helpers.sql

SELECT plan(30);

-- ============================================================================
-- 1. RLS enabled + anon locked out on every helm_lifting_* Lift Lab table.
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.rls_on(tbl text) RETURNS boolean AS $$
  SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = tbl;
$$ LANGUAGE sql STABLE;

SELECT ok(pg_temp.rls_on('helm_lifting_groups'),               'RLS on helm_lifting_groups');
SELECT ok(pg_temp.rls_on('helm_lifting_group_members'),        'RLS on helm_lifting_group_members');
SELECT ok(pg_temp.rls_on('helm_lifting_exercises'),             'RLS on helm_lifting_exercises');
SELECT ok(pg_temp.rls_on('helm_lifting_programs'),              'RLS on helm_lifting_programs');
SELECT ok(pg_temp.rls_on('helm_lifting_weeks'),                 'RLS on helm_lifting_weeks');
SELECT ok(pg_temp.rls_on('helm_lifting_days'),                  'RLS on helm_lifting_days');
SELECT ok(pg_temp.rls_on('helm_lifting_sections'),              'RLS on helm_lifting_sections');
SELECT ok(pg_temp.rls_on('helm_lifting_prescriptions'),         'RLS on helm_lifting_prescriptions');
SELECT ok(pg_temp.rls_on('helm_lifting_program_assignments'),   'RLS on helm_lifting_program_assignments');
SELECT ok(pg_temp.rls_on('helm_lifting_sessions'),               'RLS on helm_lifting_sessions');
SELECT ok(pg_temp.rls_on('helm_lifting_session_exercises'),     'RLS on helm_lifting_session_exercises');
SELECT ok(pg_temp.rls_on('helm_lifting_bodyweight_entries'),    'RLS on helm_lifting_bodyweight_entries');
SELECT ok(pg_temp.rls_on('helm_lifting_availability_statuses'), 'RLS on helm_lifting_availability_statuses');
SELECT ok(pg_temp.rls_on('helm_lifting_maxes'),                 'RLS on helm_lifting_maxes');
SELECT ok(pg_temp.rls_on('helm_lifting_prs'),                   'RLS on helm_lifting_prs');

-- No Lift Lab policy targets anon; anon has no SELECT on the sensitive session table.
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'helm_lifting_groups','helm_lifting_group_members',
         'helm_lifting_exercises',
         'helm_lifting_programs','helm_lifting_weeks','helm_lifting_days',
         'helm_lifting_sections','helm_lifting_prescriptions',
         'helm_lifting_program_assignments','helm_lifting_sessions',
         'helm_lifting_session_exercises',
         'helm_lifting_bodyweight_entries',
         'helm_lifting_availability_statuses','helm_lifting_maxes',
         'helm_lifting_prs')
       AND 'anon' = ANY(roles)),
  0, 'no helm_lifting_* Lift Lab policy targets the anon role'
);
SELECT isnt(has_table_privilege('anon','public.helm_lifting_sessions','SELECT'), true, 'anon cannot SELECT helm_lifting_sessions');

-- ============================================================================
-- 2. Sessions — athlete reads OWN; teammates cannot read loads.
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.polqual(tbl text, pol text) RETURNS text AS $$
  SELECT COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = tbl AND p.polname = pol;
$$ LANGUAGE sql STABLE;

SELECT ok(pg_temp.polqual('helm_lifting_sessions','hlsess_select') ~ 'helm_lifting_is_my_athlete',
  'sessions SELECT binds athlete branch to own identity (helm_lifting_is_my_athlete)');
SELECT ok(pg_temp.polqual('helm_lifting_sessions','hlsess_select') ~ 'helm_lifting_can_view_org',
  'sessions SELECT staff path is org-gated (helm_lifting_can_view_org)');
SELECT ok(pg_temp.polqual('helm_lifting_sessions','hlsess_select') !~ '(is_baseball_team_member|get_my_baseball_player_id)',
  'sessions SELECT has NO leftover V11 team-member/player-identity read path');
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='public'
     AND tablename='helm_lifting_sessions' AND cmd='SELECT'),
  1, 'helm_lifting_sessions has exactly one SELECT policy');

-- ============================================================================
-- 4. Bodyweight / availability — staff path is org-gated
--    (helm_lifting_can_view_org — the successor to the V11-era dedicated
--    can_view_readiness capability, now folded into the single org-viewer
--    check); the owning athlete may always read their own row.
-- ============================================================================
SELECT ok(pg_temp.polqual('helm_lifting_bodyweight_entries','hlbw_select') ~ 'helm_lifting_can_view_org',
  'bodyweight SELECT staff path is org-gated (helm_lifting_can_view_org)');
SELECT ok(pg_temp.polqual('helm_lifting_availability_statuses','hlas_select') ~ 'helm_lifting_can_view_org',
  'availability SELECT staff path is org-gated (helm_lifting_can_view_org)');
SELECT ok(pg_temp.polqual('helm_lifting_availability_statuses','hlas_select') ~ 'helm_lifting_is_my_athlete',
  'availability is readable by the owning athlete');

-- ============================================================================
-- 5. Program/group/exercise WRITES gated on helm_lifting_can_edit_org (the
--    DB-layer counterpart of the app-layer can_manage_lifting capability).
-- ============================================================================
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='helm_lifting_programs'
            AND p.polcmd='a'
            AND pg_get_expr(p.polwithcheck,p.polrelid) ~ 'helm_lifting_can_edit_org'),
  'helm_lifting_programs INSERT gated on helm_lifting_can_edit_org');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='helm_lifting_groups'
            AND p.polcmd='a'
            AND pg_get_expr(p.polwithcheck,p.polrelid) ~ 'helm_lifting_can_edit_org'),
  'helm_lifting_groups INSERT gated on helm_lifting_can_edit_org');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='helm_lifting_exercises'
            AND p.polcmd='a'
            AND pg_get_expr(p.polwithcheck,p.polrelid) ~ 'helm_lifting_can_edit_org'),
  'helm_lifting_exercises INSERT gated on helm_lifting_can_edit_org');

-- An athlete may read their own resolved-org's exercise library (so an
-- assigned exercise name resolves on their surface) via helm_lifting_is_my_athlete.
SELECT ok(pg_temp.polqual('helm_lifting_exercises','hle_select') ~ 'helm_lifting_is_my_athlete',
  'helm_lifting_exercises SELECT lets the resolved athlete read their org''s exercises');

-- ============================================================================
-- 6. Sessions are staff-materialized: an athlete cannot self-insert a session.
-- ============================================================================
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
              JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relname='helm_lifting_sessions'
                AND p.polcmd='a'
                AND pg_get_expr(p.polwithcheck,p.polrelid) ~ 'helm_lifting_is_my_athlete'),
  'no INSERT policy lets an athlete self-create a helm_lifting_sessions row');

-- Unique (program_assignment_id, athlete_id) supports idempotent re-publish
-- (publishLiftDay upserts on this exact conflict target).
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='helm_lifting_sessions'
            AND con.contype='u'
            AND pg_get_constraintdef(con.oid) ILIKE '%program_assignment_id%athlete_id%'),
  'helm_lifting_sessions have UNIQUE (program_assignment_id, athlete_id) for safe re-publish');

SELECT * FROM finish();
ROLLBACK;
