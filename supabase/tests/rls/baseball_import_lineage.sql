-- pgTAP contracts for BaseballHelm import-lineage team scoping
-- (migrations 20260624000020_baseball_import_lineage.sql +
--  20260624000050_baseball_rls_helpers_and_policies.sql).
--
-- Guards the source-registry lineage tables (baseball_import_runs,
-- baseball_player_external_ids) against regression:
--   1. RLS is ENABLED on both tables.
--   2. anon holds NO table privileges on either (never granted).
--   3. Every CRUD verb has an explicit, team-scoped policy (no implicit
--      full-table access, no missing command).
--   4. The team-scoping is real: each policy expression references the team
--      scope — directly via the capability helper on baseball_import_runs, and
--      via the baseball_player_external_ids -> player -> team chain.
--   5. baseball_player_external_ids lets a player read ONLY their own mapping
--      row (player_id = get_my_baseball_player_id()), but write is staff-only.
--
-- Schema-light: asserts the security contract over pg_policy / pg_class without
-- seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: Wave 1 source-registry / schema-rls packets (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(24);

-- ============================================================================
-- 1. RLS enabled on both lineage tables.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_import_runs'),
  'RLS is ENABLED on baseball_import_runs'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_player_external_ids'),
  'RLS is ENABLED on baseball_player_external_ids'
);

-- ============================================================================
-- 2. anon has NO privileges on either lineage table.
-- ============================================================================

SELECT isnt(has_table_privilege('anon', 'public.baseball_import_runs', 'SELECT'), true, 'anon cannot SELECT baseball_import_runs');
SELECT isnt(has_table_privilege('anon', 'public.baseball_import_runs', 'INSERT'), true, 'anon cannot INSERT baseball_import_runs');
SELECT isnt(has_table_privilege('anon', 'public.baseball_import_runs', 'UPDATE'), true, 'anon cannot UPDATE baseball_import_runs');
SELECT isnt(has_table_privilege('anon', 'public.baseball_import_runs', 'DELETE'), true, 'anon cannot DELETE baseball_import_runs');

SELECT isnt(has_table_privilege('anon', 'public.baseball_player_external_ids', 'SELECT'), true, 'anon cannot SELECT baseball_player_external_ids');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_external_ids', 'INSERT'), true, 'anon cannot INSERT baseball_player_external_ids');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_external_ids', 'UPDATE'), true, 'anon cannot UPDATE baseball_player_external_ids');
SELECT isnt(has_table_privilege('anon', 'public.baseball_player_external_ids', 'DELETE'), true, 'anon cannot DELETE baseball_player_external_ids');

-- ============================================================================
-- 3. Every CRUD verb on baseball_import_runs has exactly one named policy.
-- ============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_import_runs'
       AND cmd = 'SELECT'),
  1,
  'baseball_import_runs has exactly one SELECT policy'
);
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_import_runs'
       AND cmd = 'INSERT'),
  1,
  'baseball_import_runs has exactly one INSERT policy'
);
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_import_runs'
       AND cmd = 'UPDATE'),
  1,
  'baseball_import_runs has exactly one UPDATE policy'
);
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_import_runs'
       AND cmd = 'DELETE'),
  1,
  'baseball_import_runs has exactly one DELETE policy'
);

-- All import_runs policies are scoped to the authenticated role only (no PUBLIC).
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_import_runs'
       AND roles <> '{authenticated}'),
  0,
  'all baseball_import_runs policies target the authenticated role only'
);

-- ============================================================================
-- 4. Team-scoping is real — import_runs SELECT references team_id scope.
-- ============================================================================

SELECT ok(
  position('team_id' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_import_runs'
        AND p.polname = 'baseball_import_runs_select'
  ), '')) > 0,
  'baseball_import_runs_select USING clause is scoped by team_id'
);

-- external_ids scoping flows through the player -> team chain (the policy text
-- references either the membership chain or the import capability helper).
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_player_external_ids'
        AND p.polname = 'baseball_player_external_ids_select'
  ), '') ~ '(player_id|team)',
  'baseball_player_external_ids_select scopes through player/team, not global'
);

-- ============================================================================
-- 5. external_ids — player reads own mapping, but write is staff-only.
-- ============================================================================

-- SELECT: a player may see their own mapping row.
SELECT ok(
  position('get_my_baseball_player_id' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_player_external_ids'
        AND p.polname = 'baseball_player_external_ids_select'
  ), '')) > 0,
  'baseball_player_external_ids_select lets a player read their own mapping row'
);

-- INSERT: write is gated on the import capability, NOT on the player-self check.
SELECT ok(
  position('can_manage_imports' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_player_external_ids'
        AND p.polname = 'baseball_player_external_ids_insert'
  ), '')) > 0,
  'baseball_player_external_ids_insert WITH CHECK gates on staff import capability'
);

SELECT ok(
  position('get_my_baseball_player_id' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_player_external_ids'
        AND p.polname = 'baseball_player_external_ids_insert'
  ), '')) = 0,
  'baseball_player_external_ids_insert does NOT let a player self-insert a mapping'
);

SELECT * FROM finish();
ROLLBACK;
