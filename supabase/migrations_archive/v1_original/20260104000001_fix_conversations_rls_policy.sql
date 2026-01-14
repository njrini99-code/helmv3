-- ============================================================================
-- Fix Conversations RLS Policy (Re-apply)
-- Ensure authenticated users can create conversations
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Drop any existing INSERT policies
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Allow authenticated users to create conversations" ON conversations;

-- Create simple INSERT policy that allows any authenticated user to create
CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

COMMENT ON POLICY "Authenticated users can create conversations" ON conversations IS
'Allows any authenticated user to create a new conversation.';

-- Also ensure SELECT policy exists
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
CREATE POLICY "Users can view their conversations"
  ON conversations FOR SELECT
  USING (
    id IN (
      SELECT conversation_id
      FROM conversation_participants
      WHERE user_id = auth.uid()
    )
  );

-- Verify policies
DO $$
BEGIN
  RAISE NOTICE 'Conversations table RLS policies updated successfully';
END $$;
