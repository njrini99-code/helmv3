-- pgTAP contracts for BaseballHelm staff audit log
-- (migration 20260624000081_baseball_staff_roles_scope_audit.sql).
--
-- Security-critical invariants for baseball_staff_audit_events:
--   1. RLS is ENABLED and anon has NO privileges on the table.
--   2. There is a SELECT policy gated by the team-authority helper
--      (baseball_can_invite_staff) — so only a team's head coach /
--      can_invite_staff staffer can read its audit log. The spec
--      ("Data Visibility Rules": Audit logs -> admin/head coach only) requires
--      players + non-authorized staff to be unable to read it.
--   3. There is NO authenticated INSERT/UPDATE/DELETE policy — audit rows are
--      written ONLY by SECURITY DEFINER triggers / RPCs, making the log
--      effectively append-only and tamper-resistant from any client.
--   4. The `action` CHECK constraint exists (a forged row cannot store an
--      arbitrary action value even via a definer path bug).
--
-- Schema-light: asserts the contract over pg_class / pg_policy / pg_constraint
-- without seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: Wave 11 staff-roles packet (BaseballHelm V11).

BEGIN;
\ir _helpers.sql

SELECT plan(11);

-- ============================================================================
-- 1. RLS enabled; anon locked out of every verb.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_staff_audit_events'),
  'RLS is ENABLED on baseball_staff_audit_events'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_staff_audit_events', 'SELECT'), true, 'anon cannot SELECT baseball_staff_audit_events');
SELECT isnt(has_table_privilege('anon', 'public.baseball_staff_audit_events', 'INSERT'), true, 'anon cannot INSERT baseball_staff_audit_events');
SELECT isnt(has_table_privilege('anon', 'public.baseball_staff_audit_events', 'UPDATE'), true, 'anon cannot UPDATE baseball_staff_audit_events');
SELECT isnt(has_table_privilege('anon', 'public.baseball_staff_audit_events', 'DELETE'), true, 'anon cannot DELETE baseball_staff_audit_events');

-- ============================================================================
-- 2. A SELECT policy exists and is gated by the team-authority helper.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_staff_audit_events'
      AND policyname = 'baseball_staff_audit_events_select'
      AND cmd = 'SELECT'
  ),
  'baseball_staff_audit_events has a named SELECT policy'
);

SELECT ok(
  position('baseball_can_invite_staff' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_staff_audit_events'
        AND p.polname = 'baseball_staff_audit_events_select'
  ), '')) > 0,
  'SELECT policy is gated by baseball_can_invite_staff (head coach / can_invite_staff only)'
);

-- ============================================================================
-- 3. NO authenticated write policy (append-only; definer-triggers only).
-- ============================================================================

SELECT is(
  (SELECT count(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_staff_audit_events'
       AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  0,
  'baseball_staff_audit_events exposes NO client INSERT/UPDATE/DELETE policy'
);

-- ============================================================================
-- 4. action CHECK constraint exists and constrains the action vocabulary.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_staff_audit_events'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%action%'
  ),
  'baseball_staff_audit_events has a CHECK constraint on action'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_staff_audit_events'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%invite_accepted%'
      AND pg_get_constraintdef(con.oid) ILIKE '%role_changed%'
  ),
  'action CHECK admits invite_accepted + role_changed'
);

-- ============================================================================
-- 5. The change-logging trigger is attached to baseball_team_coach_staff.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_team_coach_staff'
      AND t.tgname = 'baseball_log_staff_change_trg'
      AND NOT t.tgisinternal
  ),
  'baseball_log_staff_change_trg trigger is attached to baseball_team_coach_staff'
);

SELECT * FROM finish();
ROLLBACK;
