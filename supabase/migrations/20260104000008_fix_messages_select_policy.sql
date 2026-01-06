-- ============================================================================
-- FIX: Messages SELECT policy using SECURITY DEFINER helper
-- ============================================================================
-- Replace the recursive messages SELECT policy with one that uses
-- the user_is_in_conversation helper function
-- ============================================================================

-- Drop existing messages SELECT policy
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users see messages in their conversations" ON messages;

-- Create non-recursive SELECT policy using helper function
CREATE POLICY "users_can_view_messages_in_their_conversations"
  ON messages
  FOR SELECT
  TO authenticated
  USING (
    public.user_is_in_conversation(conversation_id, auth.uid())
  );

COMMENT ON POLICY "users_can_view_messages_in_their_conversations" ON messages IS
  'Users can view messages in conversations they are part of (using security definer helper to avoid recursion)';
