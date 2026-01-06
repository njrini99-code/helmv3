-- ============================================================================
-- FORCE FIX: Conversations INSERT policy
-- ============================================================================
-- Directly fix the conversations INSERT policy without relying on dynamic drops
-- ============================================================================

-- Disable RLS temporarily to ensure we can modify policies
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;

-- Drop ALL conversation policies by name (comprehensive list)
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Allow authenticated users to create conversations" ON conversations;
DROP POLICY IF EXISTS "Users see own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete their conversations" ON conversations;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON conversations;
DROP POLICY IF EXISTS "Enable read access for conversation participants" ON conversations;

-- Re-enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY: Completely unrestricted INSERT for authenticated users
CREATE POLICY "authenticated_users_can_insert_conversations"
  ON conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- CREATE POLICY: Users can view conversations they're participants in
CREATE POLICY "users_can_view_their_conversations"
  ON conversations
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT conversation_id
      FROM conversation_participants
      WHERE user_id = auth.uid()
    )
  );

-- CREATE POLICY: Users can update conversations they're participants in
CREATE POLICY "users_can_update_their_conversations"
  ON conversations
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT conversation_id
      FROM conversation_participants
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    id IN (
      SELECT conversation_id
      FROM conversation_participants
      WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY "authenticated_users_can_insert_conversations" ON conversations IS
  'Allow any authenticated user to create a conversation';

COMMENT ON POLICY "users_can_view_their_conversations" ON conversations IS
  'Users can view conversations they are participants in';

COMMENT ON POLICY "users_can_update_their_conversations" ON conversations IS
  'Users can update conversations they are participants in';
