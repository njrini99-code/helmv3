-- ============================================================================
-- Temporarily Disable RLS on conversation_participants
-- ============================================================================
--
-- ISSUE: Even simple policies cause infinite recursion detection
--        Postgres RLS is too restrictive for this table's use case
--
-- SOLUTION: Disable RLS and handle permissions at application level
--           The conversations table still has RLS protecting creation
--           Application code already validates team relationships
--
-- ============================================================================

-- Drop all policies on conversation_participants
DROP POLICY IF EXISTS "Users can be added to valid conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can view their conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can read their own participant records" ON conversation_participants;

-- Disable RLS on conversation_participants
ALTER TABLE conversation_participants DISABLE ROW LEVEL SECURITY;

-- Keep RLS enabled on conversations table
-- (This still protects against unauthorized conversation creation)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE conversation_participants IS
'RLS disabled - permissions handled at application level. Conversations table still has RLS protection.';
