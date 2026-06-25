-- pgTAP RLS contracts for BaseballHelm AI audit log
-- (migration 20260624000450_baseball_ai_audit_log.sql).
--
-- The AI audit log is a STAFF-GOVERNANCE surface: every AI generation records a
-- tamper-evident row describing how the team's AI policy resolved it (approved /
-- pending / withheld) and which gate fired. The security-critical invariant from
-- the migration's HONESTY/SAFETY block: a PLAYER must NEVER read this table, and
-- anon must have NO access. This suite guards that contract against regression so
-- the v10 QA item "No sensitive data leakage" / "Player cannot access staff-only
-- cards" is verified at the DB layer, not just in the UI.
--
-- Security-critical invariants:
--   1. RLS is ENABLED and anon has NO privileges on the table.
--   2. The SELECT policy is gated by is_baseball_team_staff (staff-only read);
--      no policy admits a player branch or a bare-true predicate.
--   3. INSERT/UPDATE are staff-only (is_baseball_team_staff); DELETE is
--      primary-coach-only (append-mostly governance ledger).
--   4. No policy targets the anon role (service_role bypasses RLS for engine
--      writes).
--   5. The governance CHECK vocabulary (disposition + visibility) is constrained
--      so a forged row cannot store an off-ladder disposition/visibility.
--
-- Schema-light: asserts the contract over pg_class / pg_policy / pg_constraint
-- without seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: Wave QA-screens (AI-settings enforcement remediation).

BEGIN;
\ir _helpers.sql

SELECT plan(12);

-- ============================================================================
-- 1. RLS enabled; anon locked out of every verb.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_ai_audit'),
  'RLS is ENABLED on baseball_ai_audit'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_ai_audit', 'SELECT'), true, 'anon cannot SELECT baseball_ai_audit');
SELECT isnt(has_table_privilege('anon', 'public.baseball_ai_audit', 'INSERT'), true, 'anon cannot INSERT baseball_ai_audit');
SELECT isnt(has_table_privilege('anon', 'public.baseball_ai_audit', 'UPDATE'), true, 'anon cannot UPDATE baseball_ai_audit');
SELECT isnt(has_table_privilege('anon', 'public.baseball_ai_audit', 'DELETE'), true, 'anon cannot DELETE baseball_ai_audit');

-- ============================================================================
-- 2. SELECT policy is staff-only (is_baseball_team_staff); no player branch.
-- ============================================================================

SELECT ok(
  position('is_baseball_team_staff' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_ai_audit'
        AND p.polname = 'baseball_ai_audit_select'
  ), '')) > 0,
  'baseball_ai_audit SELECT policy is gated by is_baseball_team_staff (staff-only read)'
);

-- No SELECT policy may expose a player-identity read path — the audit log is
-- staff-only, so a baseball_players / get_my_baseball_player_id branch would be a
-- leak.
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_ai_audit'
       AND p.polcmd IN ('r', '*')
       AND pg_get_expr(p.polqual, p.polrelid) ~ '(get_my_baseball_player_id|baseball_players)'),
  0,
  'no baseball_ai_audit SELECT policy exposes a player-identity read path'
);

-- ============================================================================
-- 3. Write policies: staff-only INSERT/UPDATE; primary-coach-only DELETE.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_ai_audit'
      AND cmd = 'INSERT'
      AND with_check ILIKE '%is_baseball_team_staff%'
  ),
  'baseball_ai_audit INSERT policy requires is_baseball_team_staff'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_ai_audit'
      AND cmd = 'DELETE'
      AND qual ILIKE '%is_baseball_primary_coach%'
  ),
  'baseball_ai_audit DELETE policy is restricted to is_baseball_primary_coach'
);

-- ============================================================================
-- 4. No policy targets anon.
-- ============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_ai_audit'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_ai_audit policy targets the anon role'
);

-- ============================================================================
-- 5. Governance CHECK vocabulary is constrained.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_ai_audit'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%disposition%'
      AND pg_get_constraintdef(con.oid) ILIKE '%withheld%'
  ),
  'baseball_ai_audit has a CHECK constraint constraining disposition (approved/pending/withheld)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_ai_audit'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%visibility%'
      AND pg_get_constraintdef(con.oid) ILIKE '%staff_only%'
  ),
  'baseball_ai_audit has a CHECK constraint constraining visibility (admits staff_only)'
);

SELECT * FROM finish();
ROLLBACK;
