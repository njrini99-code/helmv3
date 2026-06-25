-- pgTAP contracts for the BaseballHelm Settings OS tables
-- (migration 20260624000090_baseball_settings_os.sql).
--
-- Security-critical invariants the Settings OS must never regress:
--   1. RLS is ENABLED on all four new tables; anon has no privileges and no
--      policy targets the anon role.
--   2. WRITE policies are capability-gated:
--        - program settings write   -> can_manage_settings
--        - import sources (all CRUD) -> can_manage_imports
--        - integration configs write -> can_manage_settings
--        - audit log insert          -> can_manage_settings AND actor=auth.uid()
--   3. READ split is correct:
--        - program settings readable by team staff OR team member (toggles
--          shape player UX), so a member CAN read.
--        - import sources / integration configs / audit log are staff-only
--          (no team-member read policy).
--   4. The audit log is APPEND-ONLY: a SELECT and INSERT policy exist, but NO
--        UPDATE or DELETE policy (staff can never rewrite history; service_role
--        prunes per retention by bypassing RLS).
--   5. program_type CHECK exists on baseball_teams (the controlling setting
--      cannot be set to an arbitrary mode), and the settings CHECK constraints
--      (performance depth / scout visibility / default visibility) exist so the
--      enumerated controls cannot be spoofed.
--   6. Defaults that matter for safety: players_require_invite defaults true,
--      ai_require_staff_approval defaults true, ai_require_source_refs defaults
--      true, default_visibility defaults staff_only.
--
-- Schema-light: asserts the contract over pg_policies / pg_constraint /
-- pg_attrdef without seeding integration data (matches the deferral note in the
-- other baseball RLS suites).
--
-- Source: Wave 4 settings-os packet (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(43);

-- ============================================================================
-- 1. RLS enabled on all four new tables.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_program_settings'),
  'RLS is ENABLED on baseball_program_settings'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_import_sources'),
  'RLS is ENABLED on baseball_import_sources'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_integration_configs'),
  'RLS is ENABLED on baseball_integration_configs'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_settings_audit_log'),
  'RLS is ENABLED on baseball_settings_audit_log'
);

-- ============================================================================
-- 2. anon locked out — no table privileges, no policy targets anon.
-- ============================================================================

SELECT isnt(has_table_privilege('anon', 'public.baseball_program_settings', 'SELECT'), true, 'anon cannot SELECT baseball_program_settings');
SELECT isnt(has_table_privilege('anon', 'public.baseball_program_settings', 'INSERT'), true, 'anon cannot INSERT baseball_program_settings');
SELECT isnt(has_table_privilege('anon', 'public.baseball_import_sources', 'SELECT'), true, 'anon cannot SELECT baseball_import_sources');
SELECT isnt(has_table_privilege('anon', 'public.baseball_integration_configs', 'SELECT'), true, 'anon cannot SELECT baseball_integration_configs');
SELECT isnt(has_table_privilege('anon', 'public.baseball_settings_audit_log', 'SELECT'), true, 'anon cannot SELECT baseball_settings_audit_log');
SELECT isnt(has_table_privilege('anon', 'public.baseball_settings_audit_log', 'INSERT'), true, 'anon cannot INSERT baseball_settings_audit_log');

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'baseball_program_settings', 'baseball_import_sources',
         'baseball_integration_configs', 'baseball_settings_audit_log')
       AND 'anon' = ANY(roles)),
  0,
  'no settings-os policy targets the anon role'
);

-- ============================================================================
-- 3. Write policies are capability-gated (assert the policy qual mentions the
--    expected capability helper / capability name).
-- ============================================================================

-- program_settings UPDATE references can_manage_settings.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_program_settings'
      AND cmd = 'UPDATE'
      AND qual LIKE '%can_manage_settings%'
  ),
  'baseball_program_settings UPDATE is gated on can_manage_settings'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_program_settings'
      AND cmd = 'INSERT'
      AND with_check LIKE '%can_manage_settings%'
  ),
  'baseball_program_settings INSERT is gated on can_manage_settings'
);

-- import_sources writes reference can_manage_imports (all of INSERT/UPDATE/DELETE).
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='baseball_import_sources' AND cmd='INSERT' AND with_check LIKE '%can_manage_imports%'),
  'baseball_import_sources INSERT is gated on can_manage_imports'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='baseball_import_sources' AND cmd='UPDATE' AND qual LIKE '%can_manage_imports%'),
  'baseball_import_sources UPDATE is gated on can_manage_imports'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='baseball_import_sources' AND cmd='DELETE' AND qual LIKE '%can_manage_imports%'),
  'baseball_import_sources DELETE is gated on can_manage_imports'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='baseball_import_sources' AND cmd='SELECT' AND qual LIKE '%can_manage_imports%'),
  'baseball_import_sources SELECT is gated on can_manage_imports (staff-only)'
);

-- integration_configs writes reference can_manage_settings.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='baseball_integration_configs' AND cmd='INSERT' AND with_check LIKE '%can_manage_settings%'),
  'baseball_integration_configs INSERT is gated on can_manage_settings'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='baseball_integration_configs' AND cmd='UPDATE' AND qual LIKE '%can_manage_settings%'),
  'baseball_integration_configs UPDATE is gated on can_manage_settings'
);

-- audit_log insert references can_manage_settings AND actor_user_id = auth.uid().
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='baseball_settings_audit_log'
      AND cmd='INSERT'
      AND with_check LIKE '%can_manage_settings%'
      AND with_check LIKE '%auth.uid()%'
  ),
  'baseball_settings_audit_log INSERT is gated on can_manage_settings AND actor=auth.uid()'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='baseball_settings_audit_log'
      AND cmd='SELECT'
      AND qual LIKE '%can_manage_settings%'
  ),
  'baseball_settings_audit_log SELECT is gated on can_manage_settings'
);

-- ============================================================================
-- 4. program settings readable by team staff OR team member.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='baseball_program_settings'
      AND cmd='SELECT'
      AND qual LIKE '%is_baseball_team_staff%'
      AND qual LIKE '%is_baseball_team_member%'
  ),
  'baseball_program_settings SELECT admits both team staff and team members'
);

-- import_sources / integration_configs / audit_log have NO team-member read.
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname='public' AND tablename='baseball_import_sources'
       AND cmd='SELECT' AND qual LIKE '%is_baseball_team_member%'),
  0,
  'baseball_import_sources is NOT readable by plain team members'
);
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname='public' AND tablename='baseball_settings_audit_log'
       AND cmd='SELECT' AND qual LIKE '%is_baseball_team_member%'),
  0,
  'baseball_settings_audit_log is NOT readable by plain team members'
);

-- ============================================================================
-- 5. audit log is APPEND-ONLY (SELECT + INSERT only; no UPDATE/DELETE policy).
-- ============================================================================

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='baseball_settings_audit_log' AND cmd='SELECT'),
  'audit log has a SELECT policy'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='baseball_settings_audit_log' AND cmd='INSERT'),
  'audit log has an INSERT policy'
);
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='baseball_settings_audit_log' AND cmd='UPDATE'),
  0,
  'audit log has NO UPDATE policy (append-only)'
);
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='baseball_settings_audit_log' AND cmd='DELETE'),
  0,
  'audit log has NO DELETE policy (append-only)'
);

-- ============================================================================
-- 6. CHECK constraints exist (enumerated controls cannot be spoofed).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_teams'
      AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%program_type%'
  ),
  'baseball_teams has a CHECK constraint on program_type'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_program_settings'
      AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%performance_module_depth%'
  ),
  'baseball_program_settings has a CHECK on performance_module_depth'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_program_settings'
      AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%scout_packet_visibility%'
  ),
  'baseball_program_settings has a CHECK on scout_packet_visibility'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_program_settings'
      AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%default_visibility%'
  ),
  'baseball_program_settings has a CHECK on default_visibility'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_import_sources'
      AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%trust_level%'
  ),
  'baseball_import_sources has a CHECK on trust_level'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_integration_configs'
      AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%integration_level%'
  ),
  'baseball_integration_configs has a CHECK on integration_level (1-4)'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_settings_audit_log'
      AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%event_type%'
  ),
  'baseball_settings_audit_log has a CHECK on event_type'
);

-- ============================================================================
-- 7. Safety defaults (the secure-by-default posture).
-- ============================================================================

SELECT is(
  (SELECT ad.adbin::text IS NOT NULL FROM pg_attribute a
     JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='baseball_program_settings'
       AND a.attname='players_require_invite'),
  true,
  'players_require_invite has a column default'
);
SELECT ok(
  (SELECT pg_get_expr(ad.adbin, ad.adrelid) LIKE '%true%'
     FROM pg_attribute a
     JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='baseball_program_settings'
       AND a.attname='players_require_invite'),
  'players_require_invite DEFAULT is true'
);
SELECT ok(
  (SELECT pg_get_expr(ad.adbin, ad.adrelid) LIKE '%true%'
     FROM pg_attribute a
     JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='baseball_program_settings'
       AND a.attname='ai_require_staff_approval'),
  'ai_require_staff_approval DEFAULT is true'
);
SELECT ok(
  (SELECT pg_get_expr(ad.adbin, ad.adrelid) LIKE '%true%'
     FROM pg_attribute a
     JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='baseball_program_settings'
       AND a.attname='ai_require_source_refs'),
  'ai_require_source_refs DEFAULT is true'
);
SELECT ok(
  (SELECT pg_get_expr(ad.adbin, ad.adrelid) LIKE '%staff_only%'
     FROM pg_attribute a
     JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='baseball_program_settings'
       AND a.attname='default_visibility'),
  'default_visibility DEFAULT is staff_only'
);

-- ============================================================================
-- 8. UNIQUE constraints (1:1 settings doc; one source per name; one provider).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_program_settings'
      AND con.contype='u'
  ),
  'baseball_program_settings has a UNIQUE constraint (1:1 with team)'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_import_sources'
      AND con.contype='u' AND pg_get_constraintdef(con.oid) LIKE '%source_name%'
  ),
  'baseball_import_sources UNIQUE (team_id, source_name)'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='baseball_integration_configs'
      AND con.contype='u' AND pg_get_constraintdef(con.oid) LIKE '%provider_key%'
  ),
  'baseball_integration_configs UNIQUE (team_id, provider_key)'
);

SELECT * FROM finish();
ROLLBACK;
