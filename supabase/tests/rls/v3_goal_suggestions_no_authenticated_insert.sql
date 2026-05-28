-- v3 W19 regression: golf_goal_suggestions must not grant authenticated
-- INSERT or DELETE. Engine writes via service_role only.
--
-- Original policy in 20260525160000_v3_golf_goal_suggestions_table.sql
-- was FOR ALL TO authenticated, contradicting its own header comment
-- ("Engine writes via service_role; no authenticated INSERT policy") and
-- letting any player fabricate suggestion rows for themselves.
--
-- Fix in 20260526180000_fix_v3_goals_suggestions_rls.sql splits it into
-- a FOR SELECT and a FOR UPDATE policy only.

BEGIN;
\ir _helpers.sql

SELECT plan(5);

-- Test 1: the broken FOR ALL policy is gone.
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'golf_goal_suggestions'
      AND p.polname = 'goal_suggestions_player_own'
  ),
  'goal_suggestions_player_own (FOR ALL) policy is dropped'
);

-- Test 2: a FOR SELECT policy exists.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'golf_goal_suggestions'
      AND p.polname = 'goal_suggestions_player_select'
      AND p.polcmd = 'r'  -- SELECT
  ),
  'goal_suggestions_player_select exists as SELECT policy'
);

-- Test 3: a FOR UPDATE policy exists.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'golf_goal_suggestions'
      AND p.polname = 'goal_suggestions_player_update'
      AND p.polcmd = 'w'  -- UPDATE
  ),
  'goal_suggestions_player_update exists as UPDATE policy'
);

-- Test 4: no INSERT policy exists for authenticated.
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'golf_goal_suggestions'
      AND (p.polcmd = 'a' OR p.polcmd = '*')  -- INSERT or ALL
  ),
  'no INSERT (or ALL) policy on golf_goal_suggestions — engine uses service_role'
);

-- Test 5: no DELETE policy exists for authenticated.
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'golf_goal_suggestions'
      AND (p.polcmd = 'd' OR p.polcmd = '*')  -- DELETE or ALL
  ),
  'no DELETE (or ALL) policy on golf_goal_suggestions — engine TTL-expires rows server-side'
);

SELECT * FROM finish();
ROLLBACK;
