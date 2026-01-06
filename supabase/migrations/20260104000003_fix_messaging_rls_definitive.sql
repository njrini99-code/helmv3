-- ============================================================================
-- DEFINITIVE FIX: Messaging RLS Policies
-- ============================================================================
-- This migration completely resets and fixes RLS for messaging tables
-- ============================================================================

-- ============================================================================
-- CONVERSATIONS TABLE
-- ============================================================================

-- Drop ALL existing policies using a dynamic approach
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'conversations' AND schemaname = 'public')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON conversations';
    END LOOP;
END $$;

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- CREATE: Any authenticated user can create conversations (no restrictions)
CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- READ: Users can view conversations they're part of
CREATE POLICY "Users can view their conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT conversation_id
      FROM conversation_participants
      WHERE user_id = auth.uid()
    )
  );

-- UPDATE: Users can update conversations they're part of
CREATE POLICY "Users can update their conversations"
  ON conversations FOR UPDATE
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

-- ============================================================================
-- CONVERSATION_PARTICIPANTS TABLE
-- ============================================================================

-- Drop ALL existing policies using a dynamic approach
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'conversation_participants' AND schemaname = 'public')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON conversation_participants';
    END LOOP;
END $$;

-- Enable RLS
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

-- CREATE: Allow adding participants to any conversation
-- (The creator needs to add participants including themselves)
CREATE POLICY "Users can create participations"
  ON conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- READ: Users can see participations in their conversations
CREATE POLICY "Users can view participations"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id
      FROM conversation_participants
      WHERE user_id = auth.uid()
    )
  );

-- UPDATE: Users can update their own participation
CREATE POLICY "Users can update their participation"
  ON conversation_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: Users can leave conversations
CREATE POLICY "Users can leave conversations"
  ON conversation_participants FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================

-- Drop ALL existing policies using a dynamic approach
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'messages' AND schemaname = 'public')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON messages';
    END LOOP;
END $$;

-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- CREATE: Users can send messages to conversations they're part of
CREATE POLICY "Users can create messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    conversation_id IN (
      SELECT conversation_id
      FROM conversation_participants
      WHERE user_id = auth.uid()
    )
  );

-- READ: Users can view messages in their conversations
CREATE POLICY "Users can view messages in their conversations"
  ON messages FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id
      FROM conversation_participants
      WHERE user_id = auth.uid()
    )
  );

-- UPDATE: Users can update their own messages
CREATE POLICY "Users can update their messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- DELETE: Users can delete their own messages
CREATE POLICY "Users can delete their messages"
  ON messages FOR DELETE
  TO authenticated
  USING (sender_id = auth.uid());

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Users can create conversations" ON conversations IS
  'Allows any authenticated user to create a new conversation';

COMMENT ON POLICY "Users can view their conversations" ON conversations IS
  'Users can only see conversations they are participants in';

COMMENT ON POLICY "Users can create participations" ON conversation_participants IS
  'Allows adding any user to any conversation (creator adds themselves and others)';

COMMENT ON POLICY "Users can create messages" ON messages IS
  'Users can send messages to conversations they are part of';
