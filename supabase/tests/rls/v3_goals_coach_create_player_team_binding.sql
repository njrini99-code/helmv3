-- v3 W18 regression: goals_coach_create must pin player_id to team_id.
--
-- Original policy in 20260525150000_v3_golf_goals_table.sql only required
-- is_team_coach(team_id). A coach staffing Team A could insert a goal whose
-- player_id was a player on Team B (horizontal privilege escalation).
--
-- Fix in 20260526180000_fix_v3_goals_suggestions_rls.sql adds an EXISTS
-- subquery over golf_team_members.

BEGIN;
\ir _helpers.sql

SELECT plan(4);

-- Test 1: the policy still exists as an INSERT policy.
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'golf_goals'
      AND p.polname = 'goals_coach_create'
      AND p.polcmd = 'a'  -- INSERT
  ),
  'goals_coach_create policy exists as INSERT policy'
);

-- Test 2: WITH CHECK still references is_team_coach (team-staff requirement).
SELECT ok(
  tests.policy_with_check_contains('public', 'golf_goals', 'goals_coach_create', 'is_team_coach'),
  'WITH CHECK still references is_team_coach (no regression on team-staff requirement)'
);

-- Test 3: WITH CHECK now references golf_team_members (the new binding).
SELECT ok(
  tests.policy_with_check_contains('public', 'golf_goals', 'goals_coach_create', 'golf_team_members'),
  'WITH CHECK references golf_team_members (proves player_id is bound to team_id)'
);

-- Test 4: WITH CHECK requires the active member status.
SELECT ok(
  tests.policy_with_check_contains('public', 'golf_goals', 'goals_coach_create', 'active'),
  'WITH CHECK requires status = active (cannot attach to inactive/transfer/medical players)'
);

SELECT * FROM finish();
ROLLBACK;
