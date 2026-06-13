-- S-CRIT-1 regression: golf_team_coach_staff INSERT policy must require
-- the caller to own the target team_id, not just the coach_id being added.
--
-- The bug at supabase/migrations/20260427210000_canonical_rls_snapshot.sql:2805-2809
-- only validated `coach_id` belongs to the caller. Any authenticated coach could
-- INSERT `(team_id = <any team>, coach_id = mine)` and gain full coach access.
--
-- The fix migration (20260517000000_fix_critical_rls_policies.sql) adds a
-- WITH CHECK EXISTS clause that references `is_primary` plus team ownership.

BEGIN;
\ir _helpers.sql

SELECT plan(3);

-- Test 1: the policy exists and is a WITH CHECK policy.
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'golf_team_coach_staff'
      AND p.polname = 'golf_team_coach_staff_insert'
      AND p.polcmd = 'a'  -- INSERT (the 'a' code in pg_policy.polcmd)
  ),
  'golf_team_coach_staff_insert policy exists as INSERT policy'
);

-- Test 2: the policy requires HEAD-coach ownership of the target team in the
-- WITH CHECK expression. (Team-toggle build: repointed from is_golf_team_primary_coach
-- to is_golf_team_head_coach so a program head — who is is_primary on only one of
-- their teams — can still self-bootstrap onto the other team they head. Assistants,
-- role <> 'head_coach', remain blocked.)
SELECT ok(
  tests.policy_with_check_contains('public', 'golf_team_coach_staff', 'golf_team_coach_staff_insert', 'is_golf_team_head_coach'),
  'INSERT WITH CHECK requires head coach ownership of team_id'
);

-- Test 3: the policy still verifies coach_id ownership too (no regression on
-- the existing requirement that the inserted coach_id belongs to the caller).
SELECT ok(
  tests.policy_with_check_contains('public', 'golf_team_coach_staff', 'golf_team_coach_staff_insert', 'auth.uid()'),
  'INSERT WITH CHECK still references auth.uid() for caller identity'
);

SELECT * FROM finish();
ROLLBACK;
