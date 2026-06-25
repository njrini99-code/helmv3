-- pgTAP contracts for the BaseballHelm stat-visual saved-view table
-- (migration 20260624000083_baseball_stat_visual_views.sql).
--
-- Security-critical invariants for the V10 stat-visual saved-view persistence:
--   1. RLS is ENABLED (and FORCED) on baseball_stat_visual_views; anon has no
--      table privileges and NO policy targets the anon role.
--   2. Every policy (SELECT/INSERT/UPDATE/DELETE) is OWNER-scoped: it pins the
--      row to owner_user_id = auth.uid() so one user's saved chart state can
--      never be seen or mutated by another user (or a player).
--   3. A full CRUD policy set exists for authenticated (saved views are
--      editable per-user) — but only via owner-scoped quals.
--   4. The (owner_user_id, visual_key, player_id) UNIQUE constraint exists so
--      the save path can UPSERT instead of delete-then-insert (no destructive
--      writes in a save path — CLAUDE.md hard rule).
--
-- Schema-light: asserts the contract over pg_policies / pg_class / pg_constraint
-- without seeding rows (matches the deferral note in the sibling baseball RLS
-- suites — integration seeding lands when fixtures exist).
--
-- Source: stat-visuals packet (BaseballHelm — stats-integrations).

BEGIN;
\ir _helpers.sql

SELECT plan(14);

-- ============================================================================
-- 1. RLS enabled + forced.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_stat_visual_views'),
  'RLS is ENABLED on baseball_stat_visual_views'
);
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_stat_visual_views'),
  'RLS is FORCED on baseball_stat_visual_views (owner subject to RLS too)'
);

-- ============================================================================
-- 2. anon locked out — no privileges, no policy targets anon.
-- ============================================================================

SELECT isnt(has_table_privilege('anon', 'public.baseball_stat_visual_views', 'SELECT'), true,
  'anon cannot SELECT baseball_stat_visual_views');
SELECT isnt(has_table_privilege('anon', 'public.baseball_stat_visual_views', 'INSERT'), true,
  'anon cannot INSERT baseball_stat_visual_views');
SELECT isnt(has_table_privilege('anon', 'public.baseball_stat_visual_views', 'UPDATE'), true,
  'anon cannot UPDATE baseball_stat_visual_views');
SELECT isnt(has_table_privilege('anon', 'public.baseball_stat_visual_views', 'DELETE'), true,
  'anon cannot DELETE baseball_stat_visual_views');

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'baseball_stat_visual_views'
       AND 'anon' = ANY(roles)),
  0,
  'no stat-visual-views policy targets the anon role'
);

-- ============================================================================
-- 3. A full CRUD policy set exists, each OWNER-scoped to auth.uid().
-- ============================================================================

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='baseball_stat_visual_views' AND cmd='SELECT'
    AND qual LIKE '%owner_user_id%' AND qual LIKE '%auth.uid()%'),
  'SELECT policy is owner-scoped (owner_user_id = auth.uid())'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='baseball_stat_visual_views' AND cmd='INSERT'
    AND with_check LIKE '%owner_user_id%' AND with_check LIKE '%auth.uid()%'),
  'INSERT policy is owner-scoped (WITH CHECK owner_user_id = auth.uid())'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='baseball_stat_visual_views' AND cmd='UPDATE'
    AND qual LIKE '%owner_user_id%' AND with_check LIKE '%owner_user_id%'),
  'UPDATE policy is owner-scoped (USING + WITH CHECK)'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='baseball_stat_visual_views' AND cmd='DELETE'
    AND qual LIKE '%owner_user_id%' AND qual LIKE '%auth.uid()%'),
  'DELETE policy is owner-scoped (owner_user_id = auth.uid())'
);

-- All policies target only the authenticated role.
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname='public' AND tablename='baseball_stat_visual_views'
       AND NOT (roles = ARRAY['authenticated']::name[])),
  0,
  'every stat-visual-views policy targets exactly the authenticated role'
);

-- ============================================================================
-- 4. UPSERT-target UNIQUE constraint exists (no destructive save path).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
     JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_stat_visual_views'
      AND con.contype = 'u'
      AND con.conname = 'baseball_stat_visual_views_unique'
  ),
  'UNIQUE (owner_user_id, visual_key, player_id) exists for upsert save path'
);

-- ============================================================================
-- 5. team_id FK with cascade (a deleted team cleans up its saved views).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
     JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_stat_visual_views'
      AND con.contype = 'f'
      AND con.confdeltype = 'c'  -- ON DELETE CASCADE
      AND con.conkey @> ARRAY[
        (SELECT attnum FROM pg_attribute
           WHERE attrelid = 'public.baseball_stat_visual_views'::regclass
             AND attname = 'team_id')
      ]
  ),
  'team_id FK cascades on team delete'
);

SELECT * FROM finish();
ROLLBACK;
