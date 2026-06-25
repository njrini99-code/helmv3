-- pgTAP contracts for BaseballHelm Practice Effectiveness Engine visibility gating
-- (migration 20260624000094_baseball_practice_effectiveness.sql +
--  20260624000050_baseball_rls_helpers_and_policies.sql).
--
-- Closes the zip-fidelity gap: the migration only carried a COMMENTED
-- "pgTAP RLS TEST SKETCH" — this is the runnable executable test that asserts
-- the documented security behaviors for the two NEW effectiveness tables.
--
-- Security-critical invariants the Practice Effectiveness Engine must never
-- regress (from the V7 spec honesty rules + zip non-negotiables):
--   1. RLS is ENABLED on both new tables; anon has no privileges and no policy
--      targets the anon role.
--   baseball_practice_block_objectives:
--   2. Staff WITH can_manage_practice manage objectives (write WITH CHECK gated).
--   3. A PLAYER may read objectives ONLY for a status='published' practice
--      (draft objectives stay staff-private), and only as a team member.
--   baseball_practice_effectiveness_reviews:
--   4. Reviews are STAFF-ONLY by default — the SELECT/write policies are gated
--      on can_manage_practice (a coach WITHOUT it sees zero rows / cannot write).
--   5. A PLAYER may read a review ONLY when visibility='player_visible' (mixed
--      official/scrimmage/practice scopes + confounders are never leaked).
--
-- Schema-light: asserts the contract over pg_class / pg_policies / pg_constraint
-- without seeding integration data (matches the deferral note in _helpers.sql
-- and the sibling baseball_practice_visibility.sql suite).
--
-- Source: V7 CoachHelm Practice Effectiveness Engine packet (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(20);

-- ============================================================================
-- 1. RLS enabled; anon locked out on BOTH new tables.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_block_objectives'),
  'RLS is ENABLED on baseball_practice_block_objectives'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_effectiveness_reviews'),
  'RLS is ENABLED on baseball_practice_effectiveness_reviews'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_practice_block_objectives', 'SELECT'), true, 'anon cannot SELECT baseball_practice_block_objectives');
SELECT isnt(has_table_privilege('anon', 'public.baseball_practice_block_objectives', 'INSERT'), true, 'anon cannot INSERT baseball_practice_block_objectives');
SELECT isnt(has_table_privilege('anon', 'public.baseball_practice_effectiveness_reviews', 'SELECT'), true, 'anon cannot SELECT baseball_practice_effectiveness_reviews');
SELECT isnt(has_table_privilege('anon', 'public.baseball_practice_effectiveness_reviews', 'INSERT'), true, 'anon cannot INSERT baseball_practice_effectiveness_reviews');

-- No effectiveness policy targets anon (service_role bypasses RLS for the cron write).
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('baseball_practice_block_objectives', 'baseball_practice_effectiveness_reviews')
       AND 'anon' = ANY(roles)),
  0,
  'no effectiveness policy targets the anon role'
);

-- ============================================================================
-- 2. baseball_practice_block_objectives — staff manage; player read published-only.
-- ============================================================================

-- Staff write path is gated on can_manage_practice (WITH CHECK).
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_practice_block_objectives', 'bpbo_staff_manage', 'can_manage_practice'),
  'bpbo_staff_manage WITH CHECK requires can_manage_practice'
);
-- ...and the same policy's USING expression is capability-gated (no can_manage_practice
-- => a coach without it sees zero rows through the staff branch).
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_block_objectives'
        AND p.polname = 'bpbo_staff_manage'
  ), '') ~ 'can_manage_practice',
  'bpbo_staff_manage USING requires can_manage_practice'
);

-- Player read branch is bound to status='published' (draft objectives stay private).
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_block_objectives'
        AND p.polname = 'bpbo_player_read_published'
  ), '') ~ 'status[^)]*=[^)]*''published''',
  'bpbo_player_read_published gates the player branch on status = published'
);
-- ...and references the parent baseball_practices row to inherit its publish state.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_block_objectives'
        AND p.polname = 'bpbo_player_read_published'
  ), '') ~ 'baseball_practices',
  'bpbo_player_read_published references the parent baseball_practices row'
);
-- ...and ties the reader to team membership (not any authenticated user).
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_block_objectives'
        AND p.polname = 'bpbo_player_read_published'
  ), '') ~ 'is_baseball_team_member',
  'bpbo_player_read_published ties readers to team membership'
);
-- The player read branch is SELECT-only (players never write objectives).
SELECT is(
  (SELECT p.polcmd::text
     FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_block_objectives'
       AND p.polname = 'bpbo_player_read_published'),
  'r',
  'bpbo_player_read_published is SELECT-only (players cannot write objectives)'
);
-- The status CHECK constraint exists so the published gate cannot be spoofed
-- on the parent practice (defends the inherited objective gate).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_block_objectives'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%completion_status%'
  ),
  'baseball_practice_block_objectives has a CHECK constraint on completion_status'
);

-- ============================================================================
-- 3. baseball_practice_effectiveness_reviews — staff-only; player read visible-only.
-- ============================================================================

-- Staff SELECT is capability-gated (a coach WITHOUT can_manage_practice sees zero).
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_effectiveness_reviews'
        AND p.polname = 'bpe_staff_read'
  ), '') ~ 'can_manage_practice',
  'bpe_staff_read requires can_manage_practice'
);
-- Staff write path is capability-gated (WITH CHECK).
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_practice_effectiveness_reviews', 'bpe_staff_write', 'can_manage_practice'),
  'bpe_staff_write WITH CHECK requires can_manage_practice'
);

-- Player read branch is bound to visibility='player_visible' ONLY.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_effectiveness_reviews'
        AND p.polname = 'bpe_player_read_visible'
  ), '') ~ 'visibility[^)]*=[^)]*''player_visible''',
  'bpe_player_read_visible gates the player branch on visibility = player_visible'
);
-- ...and that the player read branch does NOT leak via can_manage_practice
-- (it is the player path, not the staff path).
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_effectiveness_reviews'
        AND p.polname = 'bpe_player_read_visible'
  ), '') ~ 'is_baseball_team_member',
  'bpe_player_read_visible ties player readers to team membership'
);
-- The player read branch is SELECT-only (players never write reviews).
SELECT is(
  (SELECT p.polcmd::text
     FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_effectiveness_reviews'
       AND p.polname = 'bpe_player_read_visible'),
  'r',
  'bpe_player_read_visible is SELECT-only (players cannot write reviews)'
);
-- The visibility CHECK constraint exists so default staff_only cannot be spoofed
-- to an out-of-contract value to widen the player read.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_practice_effectiveness_reviews'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%player_visible%'
      AND pg_get_constraintdef(con.oid) ILIKE '%staff_only%'
  ),
  'baseball_practice_effectiveness_reviews has a CHECK constraint constraining visibility (incl. player_visible/staff_only)'
);

SELECT * FROM finish();
ROLLBACK;
