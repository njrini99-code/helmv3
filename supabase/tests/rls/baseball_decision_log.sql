-- pgTAP RLS contracts for BaseballHelm Decision Ledger
-- (migration 20260624000310_baseball_decision_log.sql).
--
-- baseball_decision_log is the append-only record of decisions MADE in the Staff
-- Decision Room (discussed / resolved / converted_* / raised / reopened / note).
-- The Decision Room is COACH-ONLY, so a player must never read the ledger — this
-- backs the v10 QA items "No sensitive data leakage" / "Player cannot access
-- staff-only cards" at the DB layer.
--
-- Security-critical invariants:
--   1. RLS is ENABLED and anon has NO privileges.
--   2. SELECT + INSERT are gated by is_baseball_team_staff (staff-only); there is
--      NO player-identity read path.
--   3. APPEND-ONLY: there is NO UPDATE policy (a decision is immutable history),
--      and DELETE is restricted to is_baseball_primary_coach (retention prune).
--   4. No policy targets anon.
--   5. The decision_kind CHECK constrains the vocabulary so a forged row cannot
--      store an off-ladder kind.
--
-- Schema-light: asserts the contract over pg_class / pg_policy / pg_constraint
-- without seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: V10 Packet 10 "Decision Ledger" + V5 System 5 "Staff Meeting Prep".

BEGIN;
\ir _helpers.sql

SELECT plan(11);

-- ============================================================================
-- 1. RLS enabled; anon locked out.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_decision_log'),
  'RLS is ENABLED on baseball_decision_log'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_decision_log', 'SELECT'), true, 'anon cannot SELECT baseball_decision_log');
SELECT isnt(has_table_privilege('anon', 'public.baseball_decision_log', 'INSERT'), true, 'anon cannot INSERT baseball_decision_log');
SELECT isnt(has_table_privilege('anon', 'public.baseball_decision_log', 'DELETE'), true, 'anon cannot DELETE baseball_decision_log');

-- ============================================================================
-- 2. SELECT + INSERT are staff-only; no player-identity read path.
-- ============================================================================

SELECT ok(
  position('is_baseball_team_staff' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_decision_log'
        AND p.polname = 'baseball_decision_log_select'
  ), '')) > 0,
  'baseball_decision_log SELECT policy is staff-only (is_baseball_team_staff)'
);

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_decision_log'
       AND p.polcmd IN ('r', '*')
       AND pg_get_expr(p.polqual, p.polrelid) ~ '(get_my_baseball_player_id|baseball_players)'),
  0,
  'no baseball_decision_log SELECT policy exposes a player-identity read path'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_decision_log'
      AND cmd = 'INSERT' AND with_check ILIKE '%is_baseball_team_staff%'
  ),
  'baseball_decision_log INSERT policy requires is_baseball_team_staff'
);

-- ============================================================================
-- 3. Append-only: NO UPDATE policy; DELETE primary-coach-only.
-- ============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_decision_log'
       AND cmd IN ('UPDATE', 'ALL')),
  0,
  'baseball_decision_log exposes NO UPDATE policy (append-only ledger)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'baseball_decision_log'
      AND cmd = 'DELETE' AND qual ILIKE '%is_baseball_primary_coach%'
  ),
  'baseball_decision_log DELETE policy is restricted to is_baseball_primary_coach'
);

-- ============================================================================
-- 4. No policy targets anon.
-- ============================================================================

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_decision_log'
       AND 'anon' = ANY(roles)),
  0,
  'no baseball_decision_log policy targets the anon role'
);

-- ============================================================================
-- 5. decision_kind CHECK constrains the vocabulary.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_decision_log'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%decision_kind%'
      AND pg_get_constraintdef(con.oid) ILIKE '%resolved%'
  ),
  'baseball_decision_log has a CHECK constraint constraining decision_kind'
);

SELECT * FROM finish();
ROLLBACK;
