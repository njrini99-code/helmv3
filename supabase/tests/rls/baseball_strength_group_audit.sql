-- pgTAP RLS contracts for the Helm Lifting Lab strength-group membership
-- audit ledger (migration 20260704120000_helm_lifting_group_audit.sql),
-- the helm successor to the legacy BaseballHelm baseball_strength_group_audit
-- table (V11 spec L198: "Dynamic group membership changes create audit
-- events").
--
-- helm_lifting_group_audit is an append-only ledger of strength-group
-- membership/lifecycle deltas, written by src/lib/baseball/lifting/
-- group-audit-writer.ts (appendGroupAudit). It is a STAFF-ONLY forensic
-- surface — there is no athlete-facing audit view — and only a Lift-Lab
-- edit-capable coach may append. This backs the v10 QA items "No sensitive
-- data leakage" / "Player cannot access staff-only cards" at the DB layer.
--
-- Security-critical invariants:
--   1. RLS is ENABLED and anon has NO privileges (table recreation auto-
--      grants ALL to anon+authenticated per Supabase defaults — the
--      migration explicitly REVOKEs anon back out).
--   2. SELECT is coach-edit-only (helm_lifting_can_edit_org) — no
--      athlete-self read path (unlike sessions/bodyweight/maxes elsewhere in
--      the Lift Lab, this ledger is never athlete-visible).
--   3. INSERT requires the SAME helm_lifting_can_edit_org gate; a forged
--      organization_id is rejected because the predicate resolves org
--      membership server-side, not from client input.
--   4. group_id carries a real FK to helm_lifting_groups(id) — defense in
--      depth against a forged group id (replaces the legacy table's inline
--      same-team EXISTS check with referential integrity instead).
--   5. APPEND-ONLY: there is NO UPDATE and NO DELETE policy (immutable
--      history) — unchanged invariant from the legacy table.
--   6. No policy targets anon.
--
-- HISTORY: the legacy baseball_strength_group_audit table (migration
-- 20260624000440) additionally enforced a CHECK-constrained event_type/
-- source vocabulary and a same-team baseball_strength_groups EXISTS check on
-- INSERT. helm_lifting_group_audit's `action`/`note` columns are
-- intentionally unconstrained free text (see group-audit-writer.ts —
-- GroupAuditEntry.action is a free-text label, not an enum) and its INSERT
-- policy relies on FK + org-edit gating rather than an inline group lookup;
-- those two legacy-only assertions are not carried forward.
--
-- Schema-light: asserts the contract over pg_class / pg_policy / pg_constraint
-- without seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: program-builder→helm unification, 2026-07.

BEGIN;
\ir _helpers.sql

SELECT plan(9);

-- ============================================================================
-- 1. RLS enabled; anon locked out.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'helm_lifting_group_audit'),
  'RLS is ENABLED on helm_lifting_group_audit'
);

SELECT isnt(has_table_privilege('anon', 'public.helm_lifting_group_audit', 'SELECT'), true, 'anon cannot SELECT helm_lifting_group_audit');
SELECT isnt(has_table_privilege('anon', 'public.helm_lifting_group_audit', 'INSERT'), true, 'anon cannot INSERT helm_lifting_group_audit');

-- ============================================================================
-- 2. SELECT is coach-edit-only; no athlete-self read path.
-- ============================================================================

SELECT ok(
  position('helm_lifting_can_edit_org' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'helm_lifting_group_audit'
        AND p.polname = 'hlga_select'
  ), '')) > 0,
  'helm_lifting_group_audit SELECT policy (hlga_select) is coach-edit-only (helm_lifting_can_edit_org)'
);

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'helm_lifting_group_audit'
       AND p.polcmd IN ('r', '*')
       AND pg_get_expr(p.polqual, p.polrelid) ~ '(helm_lifting_is_my_athlete|get_my_baseball_player_id)'),
  0,
  'no helm_lifting_group_audit SELECT policy exposes an athlete-self read path'
);

-- ============================================================================
-- 3. INSERT requires helm_lifting_can_edit_org; group_id FKs to
--    helm_lifting_groups (defense-in-depth against a forged group id).
-- ============================================================================

SELECT ok(
  position('helm_lifting_can_edit_org' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'helm_lifting_group_audit'
        AND p.polname = 'hlga_insert'
  ), '')) > 0,
  'helm_lifting_group_audit INSERT policy (hlga_insert) requires helm_lifting_can_edit_org'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'helm_lifting_group_audit'
      AND con.contype = 'f'
      AND pg_get_constraintdef(con.oid) ILIKE '%group_id%'
      AND pg_get_constraintdef(con.oid) ILIKE '%helm_lifting_groups%'
  ),
  'helm_lifting_group_audit.group_id has a FOREIGN KEY to helm_lifting_groups (forged group id is rejected)'
);

-- ============================================================================
-- 4. Append-only: NO UPDATE and NO DELETE policy.
-- ============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'helm_lifting_group_audit'
       AND cmd IN ('UPDATE', 'DELETE', 'ALL')),
  0,
  'helm_lifting_group_audit exposes NO UPDATE/DELETE policy (immutable ledger)'
);

-- ============================================================================
-- 5. No policy targets anon.
-- ============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'helm_lifting_group_audit'
       AND 'anon' = ANY(roles)),
  0,
  'no helm_lifting_group_audit policy targets the anon role'
);

SELECT * FROM finish();
ROLLBACK;
