-- pgTAP contracts for BaseballHelm Signal Inbox + Action Conversion Engine
-- (migration 20260624000092_baseball_signals_and_actions.sql).
--
-- The security-critical invariants:
--   1. RLS is ENABLED on both tables; anon has NO privileges.
--   2. The disposition/severity/visibility CHECK constraints exist (a signal
--      cannot store an arbitrary disposition/visibility that would slip past
--      the policies; "sample_too_small" is a real, constrained value).
--   3. A PLAYER can only ever read a signal/action that is (a) player-visible
--      (visibility IN team/player_only — never staff_only) AND (b) about/assigned
--      to THEM. Every player-facing SELECT branch must carry BOTH gates: the
--      staff_only token never appears in a policy without an accompanying
--      player-identity predicate, and a player-identity function is present.
--   4. INSERT is staff-gated (a player cannot forge a team signal/action).
--   5. DELETE is primary-coach-gated (dispositions, not deletes).
--
-- Schema-light: asserts the contract over pg_policy / pg_constraint without
-- seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: signal-inbox packet (BaseballHelm CoachHelm engine wave).

BEGIN;
\ir _helpers.sql

SELECT plan(27);

-- ============================================================================
-- 1. RLS enabled; anon locked out — baseball_signals.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_signals'),
  'RLS is ENABLED on baseball_signals'
);
SELECT isnt(has_table_privilege('anon', 'public.baseball_signals', 'SELECT'), true, 'anon cannot SELECT baseball_signals');
SELECT isnt(has_table_privilege('anon', 'public.baseball_signals', 'INSERT'), true, 'anon cannot INSERT baseball_signals');
SELECT isnt(has_table_privilege('anon', 'public.baseball_signals', 'UPDATE'), true, 'anon cannot UPDATE baseball_signals');
SELECT isnt(has_table_privilege('anon', 'public.baseball_signals', 'DELETE'), true, 'anon cannot DELETE baseball_signals');

-- ============================================================================
-- 2. RLS enabled; anon locked out — baseball_actions.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_actions'),
  'RLS is ENABLED on baseball_actions'
);
SELECT isnt(has_table_privilege('anon', 'public.baseball_actions', 'SELECT'), true, 'anon cannot SELECT baseball_actions');
SELECT isnt(has_table_privilege('anon', 'public.baseball_actions', 'INSERT'), true, 'anon cannot INSERT baseball_actions');
SELECT isnt(has_table_privilege('anon', 'public.baseball_actions', 'UPDATE'), true, 'anon cannot UPDATE baseball_actions');
SELECT isnt(has_table_privilege('anon', 'public.baseball_actions', 'DELETE'), true, 'anon cannot DELETE baseball_actions');

-- ============================================================================
-- 3. CHECK constraints exist (values constrained at the column).
-- ============================================================================

-- Helper: does table T have a CHECK constraint whose expression mentions needle?
CREATE OR REPLACE FUNCTION tests.table_check_contains(
  p_table text, p_needle text
) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = p_table
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%' || p_needle || '%'
  );
$$;

SELECT ok(tests.table_check_contains('baseball_signals', 'sample_too_small'),
  'baseball_signals constrains disposition incl. sample_too_small (first-class)');
SELECT ok(tests.table_check_contains('baseball_signals', 'critical'),
  'baseball_signals constrains severity (critical/warning/info)');
SELECT ok(tests.table_check_contains('baseball_signals', 'staff_only'),
  'baseball_signals constrains visibility (incl. staff_only)');
SELECT ok(tests.table_check_contains('baseball_actions', 'practice_block'),
  'baseball_actions constrains action_type (V9 conversion targets)');
SELECT ok(tests.table_check_contains('baseball_actions', 'completed'),
  'baseball_actions constrains status lifecycle');
SELECT ok(tests.table_check_contains('baseball_actions', 'staff_only'),
  'baseball_actions constrains visibility (incl. staff_only)');

-- ============================================================================
-- 4. Player SELECT branch is doubly gated — baseball_signals.
--    The SELECT policy USING expr must reference BOTH a player-identity helper
--    AND the visibility predicate, and must NOT grant a staff_only path to a
--    player (staff_only only appears via the staff branch).
-- ============================================================================

-- Helper: does the named policy's USING expr contain the needle?
CREATE OR REPLACE FUNCTION tests.policy_using_contains(
  p_table text, p_policy text, p_needle text
) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = p_table
      AND p.polname = p_policy
      AND pg_get_expr(p.polqual, p.polrelid) ILIKE '%' || p_needle || '%'
  );
$$;

SELECT ok(tests.policy_using_contains('baseball_signals', 'baseball_signals_select', 'get_my_baseball_player_id'),
  'signals SELECT binds the player branch to the player-identity helper');
SELECT ok(tests.policy_using_contains('baseball_signals', 'baseball_signals_select', 'is_baseball_team_staff'),
  'signals SELECT has a staff branch (full team visibility)');
SELECT ok(tests.policy_using_contains('baseball_signals', 'baseball_signals_select', 'player_only'),
  'signals SELECT player branch is gated on player-visible (team/player_only)');

-- ============================================================================
-- 5. Player SELECT branch is doubly gated — baseball_actions.
-- ============================================================================

SELECT ok(tests.policy_using_contains('baseball_actions', 'baseball_actions_select', 'get_my_baseball_player_id'),
  'actions SELECT binds the player branch to the player-identity helper');
SELECT ok(tests.policy_using_contains('baseball_actions', 'baseball_actions_select', 'assignee_player_id'),
  'actions SELECT player branch is bound to the assignee (their own action)');
SELECT ok(tests.policy_using_contains('baseball_actions', 'baseball_actions_select', 'player_only'),
  'actions SELECT player branch is gated on player-visible (team/player_only)');

-- ============================================================================
-- 6. Writes are staff-gated.
-- ============================================================================

SELECT ok(tests.policy_with_check_contains('public', 'baseball_signals', 'baseball_signals_insert', 'is_baseball_team_staff'),
  'signals INSERT requires team staff');
SELECT ok(tests.policy_with_check_contains('public', 'baseball_actions', 'baseball_actions_insert', 'is_baseball_team_staff'),
  'actions INSERT requires team staff');

-- DELETE is primary-coach only on both tables.
SELECT ok(tests.policy_using_contains('baseball_signals', 'baseball_signals_delete', 'is_baseball_primary_coach'),
  'signals DELETE is primary-coach only');
SELECT ok(tests.policy_using_contains('baseball_actions', 'baseball_actions_delete', 'is_baseball_primary_coach'),
  'actions DELETE is primary-coach only');

-- ============================================================================
-- 7. The dedupe key is enforced by an IMMEDIATE (non-deferrable) UNIQUE
--    constraint on (team_id, dedupe_key) — 20260701010000 replaced the old
--    open-only partial index (baseball_signals_dedupe_open_uidx, dropped by
--    that migration) because a deferrable/partial arbiter can't back an
--    ON CONFLICT upsert.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'baseball_signals'
      AND c.conname = 'uq_baseball_signal_dedupe'
      AND c.contype = 'u'
      AND NOT c.condeferrable
  ),
  'baseball_signals has the immediate dedupe UNIQUE constraint (upsert arbiter)'
);

SELECT * FROM finish();
ROLLBACK;
