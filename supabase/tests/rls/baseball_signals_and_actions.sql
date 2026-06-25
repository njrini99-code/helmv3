-- pgTAP contracts for BaseballHelm Signal Inbox + Action Conversion engine
-- (migration 20260624000092_baseball_signals_and_actions.sql).
--
-- These two tables are the NEW tables introduced by the Advanced CoachHelm
-- engine (V10/V6). Spec V10 "Engineering Acceptance": role permissions are
-- enforced server-side AND player-facing data is explicitly filtered; V10
-- "Data Model Extensions" lists baseball_signals + baseball_staff_actions. The
-- engine unit suite (engine-v10.test.ts) exercises pure ranking/threshold
-- logic but NEVER exercises the RLS contract — this suite closes that gap.
--
-- Security-critical invariants that must never regress:
--   1. RLS is ENABLED on baseball_signals + baseball_actions; anon has no
--      privileges and no policy targets the anon role.
--   2. The player SELECT branch is gated on BOTH visibility IN
--      ('team','player_only') AND the player-identity match — so a 'staff_only'
--      signal/action is INVISIBLE to a player (V10: "No staff-only / private /
--      health-adjacent data shown to players").
--   3. Writes (INSERT) are staff-only; a player has no insert path.
--      Signal UPDATE is staff-only; Action UPDATE allows a player to advance
--      ONLY their own player-visible assigned action.
--   4. DELETE is restricted to the primary coach (append-mostly; dispose, not
--      delete).
--   5. CHECK constraints on visibility / severity / disposition exist so the
--      staff_only gate and the "sample_too_small" first-class status cannot be
--      spoofed with an arbitrary value.
--
-- Schema-light: asserts the contract over pg_policies / pg_class / pg_constraint
-- without seeding integration data (matches the deferral note in _helpers.sql).
--
-- Source: signal-inbox packet, Advanced CoachHelm engine (V10/V6).

BEGIN;
\ir _helpers.sql

SELECT plan(31);

-- ============================================================================
-- 1. RLS enabled; anon locked out on both engine tables.
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_signals'),
  'RLS is ENABLED on baseball_signals'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_actions'),
  'RLS is ENABLED on baseball_actions'
);

SELECT isnt(has_table_privilege('anon', 'public.baseball_signals', 'SELECT'), true, 'anon cannot SELECT baseball_signals');
SELECT isnt(has_table_privilege('anon', 'public.baseball_signals', 'INSERT'), true, 'anon cannot INSERT baseball_signals');
SELECT isnt(has_table_privilege('anon', 'public.baseball_signals', 'UPDATE'), true, 'anon cannot UPDATE baseball_signals');
SELECT isnt(has_table_privilege('anon', 'public.baseball_signals', 'DELETE'), true, 'anon cannot DELETE baseball_signals');
SELECT isnt(has_table_privilege('anon', 'public.baseball_actions', 'SELECT'), true, 'anon cannot SELECT baseball_actions');
SELECT isnt(has_table_privilege('anon', 'public.baseball_actions', 'INSERT'), true, 'anon cannot INSERT baseball_actions');

-- No policy on either table targets anon (service_role bypasses RLS).
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('baseball_signals', 'baseball_actions')
       AND 'anon' = ANY(roles)),
  0,
  'no signals/actions policy targets the anon role'
);

-- ============================================================================
-- 2. CHECK constraints exist (the staff_only gate + sample_too_small status
--    cannot be spoofed with arbitrary values).
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_signals'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%staff_only%'
  ),
  'baseball_signals has a CHECK constraint constraining visibility (incl. staff_only)'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_signals'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%sample_too_small%'
  ),
  'baseball_signals has a CHECK constraint exposing sample_too_small as a first-class disposition'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_signals'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%critical%'
  ),
  'baseball_signals has a CHECK constraint constraining severity'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_actions'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%staff_only%'
  ),
  'baseball_actions has a CHECK constraint constraining visibility (incl. staff_only)'
);

-- ============================================================================
-- 3. baseball_signals — player SELECT branch is BOTH visibility- and
--    identity-gated; writes are staff-only; delete is primary-coach-only.
-- ============================================================================

SELECT cmp_ok(
  (SELECT COUNT(*)::int FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'baseball_signals' AND cmd = 'SELECT'),
  '>=', 1,
  'baseball_signals has at least one SELECT policy'
);

-- The player-readable branch must require BOTH (a) team/player_only visibility
-- AND (b) the caller's own player id — so staff_only rows are invisible.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_signals'
        AND p.polname = 'baseball_signals_select'
  ), '') ~ 'visibility',
  'baseball_signals_select gates the player branch on visibility'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_signals'
        AND p.polname = 'baseball_signals_select'
  ), '') ~ 'get_my_baseball_player_id',
  'baseball_signals_select ties the player branch to their own player id'
);
-- The player branch must NOT be able to read staff_only (the staff_only literal
-- never appears in the player gate; the gate is the team/player_only allowlist).
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_signals'
        AND p.polname = 'baseball_signals_select'
  ), '') !~ 'staff_only',
  'baseball_signals_select never enumerates staff_only in the player branch'
);
-- Staff branch present.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_signals'
        AND p.polname = 'baseball_signals_select'
  ), '') ~ 'is_baseball_team_staff',
  'baseball_signals_select gives staff a team-scoped read branch'
);

-- INSERT requires staff; a player has no self-insert path.
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_signals', 'baseball_signals_insert', 'is_baseball_team_staff'),
  'baseball_signals INSERT requires team staff'
);
SELECT ok(
  NOT tests.policy_with_check_contains('public', 'baseball_signals', 'baseball_signals_insert', 'get_my_baseball_player_id'),
  'no baseball_signals INSERT policy lets a player self-create a signal'
);
-- UPDATE is staff-only (triage); no player update branch.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_signals'
        AND p.polname = 'baseball_signals_update'
  ), '') ~ 'is_baseball_team_staff',
  'baseball_signals UPDATE requires team staff'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_signals'
        AND p.polname = 'baseball_signals_update'
  ), '') !~ 'get_my_baseball_player_id',
  'baseball_signals UPDATE has no player branch (staff-only triage)'
);
-- DELETE restricted to the primary coach.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_signals'
        AND p.polname = 'baseball_signals_delete'
  ), '') ~ 'is_baseball_primary_coach',
  'baseball_signals DELETE is restricted to the primary coach'
);

-- ============================================================================
-- 4. baseball_actions — player may read/advance ONLY their own player-visible
--    assigned action; staff_only assigned actions stay invisible.
-- ============================================================================

-- Player SELECT branch gated on visibility AND assignee identity.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_actions'
        AND p.polname = 'baseball_actions_select'
  ), '') ~ 'visibility',
  'baseball_actions_select gates the player branch on visibility'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_actions'
        AND p.polname = 'baseball_actions_select'
  ), '') ~ 'get_my_baseball_player_id',
  'baseball_actions_select ties the player branch to their own (assignee) player id'
);
-- A player can NEVER read a staff_only action even if assigned (no staff_only
-- literal in the player gate; the gate is the team/player_only allowlist).
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_actions'
        AND p.polname = 'baseball_actions_select'
  ), '') !~ 'staff_only',
  'baseball_actions_select never enumerates staff_only in the player branch'
);

-- INSERT (conversion) is staff-only; a player cannot self-create an action.
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_actions', 'baseball_actions_insert', 'is_baseball_team_staff'),
  'baseball_actions INSERT requires team staff (conversion is a staff action)'
);
SELECT ok(
  NOT tests.policy_with_check_contains('public', 'baseball_actions', 'baseball_actions_insert', 'get_my_baseball_player_id'),
  'no baseball_actions INSERT policy lets a player self-create an action'
);

-- The player UPDATE branch (advance own assigned action) is BOTH visibility-
-- and assignee-gated in the WITH CHECK (cannot escalate to staff_only/another
-- player).
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_actions', 'baseball_actions_update', 'visibility')
    AND tests.policy_with_check_contains('public', 'baseball_actions', 'baseball_actions_update', 'get_my_baseball_player_id'),
  'baseball_actions UPDATE WITH CHECK keeps a player bound to their own player-visible action'
);
SELECT ok(
  tests.policy_with_check_contains('public', 'baseball_actions', 'baseball_actions_update', 'is_baseball_team_staff'),
  'baseball_actions UPDATE still gives staff full management'
);
-- DELETE restricted to the primary coach.
SELECT ok(
  COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_actions'
        AND p.polname = 'baseball_actions_delete'
  ), '') ~ 'is_baseball_primary_coach',
  'baseball_actions DELETE is restricted to the primary coach'
);

SELECT * FROM finish();
ROLLBACK;
