-- pgTAP contracts for the BaseballHelm staff-capability gating
-- (migrations 20260624000030_baseball_staff_capabilities.sql +
--  20260624000050_baseball_rls_helpers_and_policies.sql).
--
-- Guards the capability model against regression:
--   1. has_baseball_staff_capability(uuid,text) is a SECURITY DEFINER helper
--      with a pinned search_path, executable by authenticated + service_role
--      but NEVER anon.
--   2. baseball_can_invite_staff(uuid) likewise (definer, pinned, no anon).
--   3. The capability columns exist on baseball_team_coach_staff and default
--      to false (least-privilege).
--   4. The import-lineage + stat-upload policies actually GATE on the
--      can_manage_imports capability (not a blanket team-coach check).
--   5. baseball_staff_invitations is RLS-enabled, write-gated on the
--      invite capability, and never granted to anon.
--
-- Schema-light: asserts the security contract over pg_proc / pg_policy /
-- information_schema without seeding integration data (matches the deferral
-- note in _helpers.sql).
--
-- Source: Wave 1 schema-rls packet (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(22);

-- ============================================================================
-- 1. has_baseball_staff_capability(uuid,text) — definer, pinned, gated grants.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'has_baseball_staff_capability'
      AND p.prosecdef = true
      AND p.proconfig @> ARRAY['search_path=pg_catalog, public']
  ),
  'has_baseball_staff_capability is SECURITY DEFINER with pinned search_path'
);

SELECT isnt(
  has_function_privilege('anon', 'public.has_baseball_staff_capability(uuid, text)', 'EXECUTE'),
  true,
  'anon cannot execute has_baseball_staff_capability'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.has_baseball_staff_capability(uuid, text)', 'EXECUTE'),
  'authenticated CAN execute has_baseball_staff_capability'
);

SELECT ok(
  has_function_privilege('service_role', 'public.has_baseball_staff_capability(uuid, text)', 'EXECUTE'),
  'service_role CAN execute has_baseball_staff_capability'
);

-- ============================================================================
-- 2. baseball_can_invite_staff(uuid) — definer, pinned, no anon.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'baseball_can_invite_staff'
      AND p.prosecdef = true
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ),
  'baseball_can_invite_staff is SECURITY DEFINER with pinned search_path'
);

SELECT isnt(
  has_function_privilege('anon', 'public.baseball_can_invite_staff(uuid)', 'EXECUTE'),
  true,
  'anon cannot execute baseball_can_invite_staff'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.baseball_can_invite_staff(uuid)', 'EXECUTE'),
  'authenticated CAN execute baseball_can_invite_staff'
);

-- ============================================================================
-- 3. Capability columns exist on baseball_team_coach_staff and default false.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'baseball_team_coach_staff'
      AND column_name = 'can_manage_imports'
  ),
  'baseball_team_coach_staff.can_manage_imports column exists'
);

SELECT is(
  (SELECT column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'baseball_team_coach_staff'
       AND column_name = 'can_manage_imports'),
  'false',
  'can_manage_imports defaults to false (least privilege)'
);

SELECT is(
  (SELECT column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'baseball_team_coach_staff'
       AND column_name = 'can_invite_staff'),
  'false',
  'can_invite_staff defaults to false (least privilege)'
);

SELECT is(
  (SELECT is_nullable FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'baseball_team_coach_staff'
       AND column_name = 'can_manage_imports'),
  'NO',
  'can_manage_imports is NOT NULL'
);

-- ============================================================================
-- 4. Import-lineage + stat-upload policies GATE on can_manage_imports.
--    The capability-aware policy set is (re)defined in migration 0050.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_import_runs'
      AND policyname = 'baseball_import_runs_select'
  ),
  'baseball_import_runs_select policy exists'
);

SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_import_runs'
        AND p.polname = 'baseball_import_runs_select'
  ), '')) > 0,
  'baseball_import_runs_select USING clause gates on can_manage_imports capability'
);

SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_import_runs'
        AND p.polname = 'baseball_import_runs_insert'
  ), '')) > 0,
  'baseball_import_runs_insert WITH CHECK gates on can_manage_imports capability'
);

SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_stat_uploads'
        AND p.polname = 'baseball_stat_uploads_insert'
  ), '')) > 0,
  'baseball_stat_uploads_insert WITH CHECK gates on can_manage_imports capability'
);

-- A non-import capability (e.g. can_manage_practice) must NOT be enough to write
-- import runs — the policy text references only the import capability.
SELECT ok(
  position('can_manage_practice' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_import_runs'
        AND p.polname = 'baseball_import_runs_insert'
  ), '')) = 0,
  'baseball_import_runs_insert does NOT accept the practice capability (gate is import-specific)'
);

-- ============================================================================
-- 5. baseball_staff_invitations — RLS on, write-gated, no anon grants.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_staff_invitations'),
  'RLS is ENABLED on baseball_staff_invitations'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_staff_invitations', 'SELECT'), true, 'anon cannot SELECT baseball_staff_invitations');
SELECT isnt(has_table_privilege('anon', 'public.baseball_staff_invitations', 'INSERT'), true, 'anon cannot INSERT baseball_staff_invitations');
SELECT isnt(has_table_privilege('anon', 'public.baseball_staff_invitations', 'UPDATE'), true, 'anon cannot UPDATE baseball_staff_invitations');
SELECT isnt(has_table_privilege('anon', 'public.baseball_staff_invitations', 'DELETE'), true, 'anon cannot DELETE baseball_staff_invitations');

-- The (0050) insert policy must require primary-coach OR the invite capability.
SELECT ok(
  position('can_invite_staff' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_staff_invitations'
        AND p.polname = 'baseball_staff_invitations_insert'
  ), '')) > 0,
  'baseball_staff_invitations_insert WITH CHECK gates on the invite capability'
);

SELECT * FROM finish();
ROLLBACK;
