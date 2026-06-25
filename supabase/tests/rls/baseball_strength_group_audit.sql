-- pgTAP RLS contracts for BaseballHelm strength-group membership audit
-- (migration 20260624000440_baseball_strength_group_audit.sql).
--
-- baseball_strength_group_audit is an append-only ledger of strength-group
-- membership/lifecycle deltas (V11 spec L198). It is a STAFF-ONLY forensic
-- surface — there is no player-facing audit view — and only a lifting-capable
-- staffer may append. This backs the v10 QA items "No sensitive data leakage" /
-- "Player cannot access staff-only cards" at the DB layer.
--
-- Security-critical invariants:
--   1. RLS is ENABLED and anon has NO privileges.
--   2. SELECT is staff-only (is_baseball_team_staff); no player-identity path.
--   3. INSERT requires the can_manage_lifting capability
--      (has_baseball_staff_capability) AND a same-team group existence check
--      (defense-in-depth against a forged team_id).
--   4. APPEND-ONLY: there is NO UPDATE and NO DELETE policy (immutable history).
--   5. No policy targets anon; the event_type/source CHECK vocabularies hold.
--
-- Schema-light: asserts the contract over pg_class / pg_policy / pg_constraint
-- without seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: V11 Strength Groups membership audit ledger.

BEGIN;
\ir _helpers.sql

SELECT plan(11);

-- ============================================================================
-- 1. RLS enabled; anon locked out.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_strength_group_audit'),
  'RLS is ENABLED on baseball_strength_group_audit'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_strength_group_audit', 'SELECT'), true, 'anon cannot SELECT baseball_strength_group_audit');
SELECT isnt(has_table_privilege('anon', 'public.baseball_strength_group_audit', 'INSERT'), true, 'anon cannot INSERT baseball_strength_group_audit');

-- ============================================================================
-- 2. SELECT is staff-only; no player-identity read path.
-- ============================================================================

SELECT ok(
  position('is_baseball_team_staff' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_strength_group_audit'
        AND p.polname = 'bsga_select'
  ), '')) > 0,
  'baseball_strength_group_audit SELECT policy (bsga_select) is staff-only (is_baseball_team_staff)'
);

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_strength_group_audit'
       AND p.polcmd IN ('r', '*')
       AND pg_get_expr(p.polqual, p.polrelid) ~ '(get_my_baseball_player_id|baseball_players)'),
  0,
  'no baseball_strength_group_audit SELECT policy exposes a player-identity read path'
);

-- ============================================================================
-- 3. INSERT requires can_manage_lifting + same-team group existence check.
-- ============================================================================

SELECT ok(
  position('can_manage_lifting' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_strength_group_audit'
        AND p.polname = 'bsga_insert'
  ), '')) > 0,
  'baseball_strength_group_audit INSERT policy (bsga_insert) requires the can_manage_lifting capability'
);

SELECT ok(
  position('baseball_strength_groups' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_strength_group_audit'
        AND p.polname = 'bsga_insert'
  ), '')) > 0,
  'baseball_strength_group_audit INSERT policy enforces a same-team group existence check'
);

-- ============================================================================
-- 4. Append-only: NO UPDATE and NO DELETE policy.
-- ============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_strength_group_audit'
       AND cmd IN ('UPDATE', 'DELETE', 'ALL')),
  0,
  'baseball_strength_group_audit exposes NO UPDATE/DELETE policy (immutable ledger)'
);

-- ============================================================================
-- 5. No policy targets anon; event_type/source CHECK vocabularies hold.
-- ============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_strength_group_audit'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_strength_group_audit policy targets the anon role'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_strength_group_audit'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%event_type%'
      AND pg_get_constraintdef(con.oid) ILIKE '%member_added%'
  ),
  'baseball_strength_group_audit has a CHECK constraint constraining event_type'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_strength_group_audit'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%source%'
      AND pg_get_constraintdef(con.oid) ILIKE '%manual%'
  ),
  'baseball_strength_group_audit has a CHECK constraint constraining source'
);

SELECT * FROM finish();
ROLLBACK;
