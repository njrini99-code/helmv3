-- ============================================================================
-- Complete Cleanup of conversation_participants RLS
-- ============================================================================
--
-- ISSUE: Migration 076 didn't drop ALL policies, including originals from 001
--        - "Users see own participations" (SELECT)
--        - "Users can join conversations" (INSERT)
--
-- SOLUTION: Drop EVERY policy on conversation_participants and disable RLS
--
-- ============================================================================

-- Drop ALL possible policies on conversation_participants (including legacy ones)
DROP POLICY IF EXISTS "Users can be added to valid conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can view their conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can read their own participant records" ON conversation_participants;
DROP POLICY IF EXISTS "Users see own participations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can join conversations" ON conversation_participants;

-- Ensure RLS is disabled on conversation_participants
ALTER TABLE conversation_participants DISABLE ROW LEVEL SECURITY;

-- Verify conversations table still has RLS enabled (for security)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Add descriptive comment
COMMENT ON TABLE conversation_participants IS
'RLS completely disabled. All policies removed. Permissions handled at application level in @/app/actions/messages.ts. The conversations table retains RLS protection.';

-- Verify by listing remaining policies (should be empty)
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'conversation_participants';

  IF policy_count > 0 THEN
    RAISE WARNING 'conversation_participants still has % policies! Manual cleanup required.', policy_count;
  ELSE
    RAISE NOTICE 'conversation_participants policies successfully cleaned (0 remaining)';
  END IF;
END $$;
