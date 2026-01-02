-- ============================================================================
-- FIX RLS POLICY FOR golf_events
-- Run this in Supabase Dashboard SQL Editor AFTER running diagnose-rls-policies.sql
-- ============================================================================

-- Step 1: Drop ALL existing INSERT policies (prevents conflicts)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'public.golf_events'::regclass
      AND polcmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON golf_events', pol.polname);
    RAISE NOTICE 'Dropped policy: %', pol.polname;
  END LOOP;
END $$;

-- Step 2: Create a single permissive INSERT policy for authenticated users
-- This allows ANY authenticated user (player or coach) to insert events
-- Application code handles authorization logic
CREATE POLICY "Enable insert for authenticated users"
ON golf_events
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Verify the policy was created
SELECT
  polname AS policy_name,
  polcmd AS for_command,
  pg_get_expr(polwithcheck, polrelid) AS with_check_expression
FROM pg_policy
WHERE polrelid = 'public.golf_events'::regclass
  AND polcmd = 'INSERT';
