-- pgTAP contracts for BaseballHelm practice-planner visibility gating
-- (migrations 20260624000060_baseball_practices.sql +
--  20260624000050_baseball_rls_helpers_and_policies.sql).
--
-- Security-critical invariants the Practice Planner must never regress:
--   1. RLS is ENABLED on all three practice tables; anon has no privileges.
--   2. A PLAYER may read a practice ONLY when status='published' (draft and
--      completed-but-unpublished plans stay staff-private). Writes are gated on
--      the can_manage_practice capability.
--   3. Practice blocks inherit practice visibility: players read blocks only of
--      published practices; writes require can_manage_practice.
--   4. A PLAYER may read their OWN attendance row but never another player's;
--      all attendance writes are staff-gated (can_manage_practice).
--   5. The status CHECK constraints exist so the 'published' gate cannot be
--      bypassed with an arbitrary status value.
--
-- Schema-light: asserts the contract over pg_policies / pg_constraint without
-- seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: Wave 8 practice-planner packet (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(27);

-- ============================================================================
-- 1. RLS enabled; anon locked out on all three tables.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_practices'),
  'RLS is ENABLED on baseball_practices'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_blocks'),
  'RLS is ENABLED on baseball_practice_blocks'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_attendance'),
  'RLS is ENABLED on baseball_practice_attendance'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_practices', 'SELECT'), true, 'anon cannot SELECT baseball_practices');
SELECT isnt(has_table_privilege('anon', 'public.baseball_practices', 'INSERT'), true, 'anon cannot INSERT baseball_practices');
SELECT isnt(has_table_privilege('anon', 'public.baseball_practice_blocks', 'SELECT'), true, 'anon cannot SELECT baseball_practice_blocks');
SELECT isnt(has_table_privilege('anon', 'public.baseball_practice_attendance', 'SELECT'), true, 'anon cannot SELECT baseball_practice_attendance');
SELECT isnt(has_table_privilege('anon', 'public.baseball_practice_attendance', 'INSERT'), true, 'anon cannot INSERT baseball_practice_attendance');

-- No practice policy targets anon (service_role bypasses RLS).
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('baseball_practices', 'baseball_practice_blocks', 'baseball_practice_attendance')
       AND 'anon' = ANY(roles)),
  0,
  'no practice policy targets the anon role'
);

-- ============================================================================
-- 2. status CHECK constraints exist (the published gate cannot be spoofed).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_practices'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%published%'
  ),
  'baseball_practices has a CHECK constraint constraining status (incl. published)'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_attendance'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%present%'
  ),
  'baseball_practice_attendance has a CHECK constraint on status'
);
-- Idempotent upsert key (no delete-then-reinsert in the attendance write path).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_attendance'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ILIKE '%practice_id%'
      AND pg_get_constraintdef(con.oid) ILIKE '%player_id%'
  ),
  'baseball_practice_attendance has a UNIQUE(practice_id, player_id) for safe upsert'
);

-- ============================================================================
-- 3. baseball_practices — player SELECT branch is published-gated; writes capped.
-- ============================================================================

SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_practices' AND cmd = 'SELECT'),
  '>=', 1,
  'baseball_practices has at least one SELECT policy'
);

-- The player-readable branch must be bound to status='published'.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practices'
        AND p.polname = 'baseball_practices_select'
  ), '') ~ 'status[^)]*=[^)]*''published''',
  'baseball_practices_select gates the player branch on status = published'
);
-- ...and that branch must also require team membership (not any authenticated).
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practices'
        AND p.polname = 'baseball_practices_select'
  ), '') ~ '(is_baseball_team_member|is_baseball_team_staff)',
  'baseball_practices_select ties readers to team membership/staff'
);

-- INSERT/UPDATE/DELETE are gated on can_manage_practice.
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_practices', 'baseball_practices_insert', 'can_manage_practice'),
  'baseball_practices INSERT requires can_manage_practice'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practices'
        AND p.polname = 'baseball_practices_update'
  ), '') ~ 'can_manage_practice',
  'baseball_practices UPDATE requires can_manage_practice'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practices'
        AND p.polname = 'baseball_practices_delete'
  ), '') ~ 'can_manage_practice',
  'baseball_practices DELETE requires can_manage_practice'
);

-- ============================================================================
-- 4. baseball_practice_blocks — inherit published visibility; writes capped.
-- ============================================================================

SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_blocks'
        AND p.polname = 'baseball_practice_blocks_select'
  ), '') ~ 'status[^)]*=[^)]*''published''',
  'baseball_practice_blocks_select inherits the published gate via the parent practice'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_blocks'
        AND p.polname = 'baseball_practice_blocks_select'
  ), '') ~ 'baseball_practices',
  'baseball_practice_blocks_select references the parent baseball_practices row'
);
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_practice_blocks', 'baseball_practice_blocks_insert', 'can_manage_practice'),
  'baseball_practice_blocks INSERT requires can_manage_practice'
);

-- ============================================================================
-- 5. baseball_practice_attendance — player reads own only; writes staff-gated.
-- ============================================================================

-- Player branch reads only their OWN attendance row.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_attendance'
        AND p.polname = 'baseball_practice_attendance_select'
  ), '') ~ 'get_my_baseball_player_id',
  'baseball_practice_attendance_select ties the player branch to their own player id'
);
-- The same SELECT policy's staff branch is capability-gated.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_attendance'
        AND p.polname = 'baseball_practice_attendance_select'
  ), '') ~ 'can_manage_practice',
  'baseball_practice_attendance_select staff branch requires can_manage_practice'
);
-- A player can NOT self-insert/update attendance (no get_my_baseball_player_id
-- in the write WITH CHECK paths — writes are staff-only).
SELECT ok(
  NOT tests.policy_with_check_contains('public', 'baseball_practice_attendance', 'baseball_practice_attendance_insert', 'get_my_baseball_player_id'),
  'no attendance INSERT policy lets a player self-mark attendance'
);
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_practice_attendance', 'baseball_practice_attendance_insert', 'can_manage_practice'),
  'baseball_practice_attendance INSERT requires can_manage_practice'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_attendance'
        AND p.polname = 'baseball_practice_attendance_update'
  ), '') ~ 'can_manage_practice',
  'baseball_practice_attendance UPDATE requires can_manage_practice'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_attendance'
        AND p.polname = 'baseball_practice_attendance_delete'
  ), '') ~ 'can_manage_practice',
  'baseball_practice_attendance DELETE requires can_manage_practice'
);

-- Every practice table has at least one INSERT policy (writes are not wide-open
-- and not entirely denied — staff have a path).
SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('baseball_practices', 'baseball_practice_blocks', 'baseball_practice_attendance')
       AND cmd = 'INSERT'),
  '>=', 3,
  'all three practice tables expose a staff INSERT policy'
);

SELECT * FROM finish();
ROLLBACK;
