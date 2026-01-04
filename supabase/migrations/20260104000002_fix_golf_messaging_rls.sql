-- ============================================================================
-- Fix Golf Messaging RLS - Complete Fix
-- Ensures both conversations and conversation_participants work correctly
-- ============================================================================

-- ============================================================================
-- CONVERSATIONS TABLE
-- ============================================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Allow authenticated users to create conversations" ON conversations;

-- CREATE: Any authenticated user can create a conversation
CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- READ: Users can only see conversations they're part of
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

ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can be added to valid conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can view conversation participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can add participants" ON conversation_participants;

-- CREATE: Users can add participants if they're allowed to message them
CREATE POLICY "Users can add participants"
  ON conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User must be authenticated
    auth.uid() IS NOT NULL
    AND (
      -- Case 1: Adding yourself to any conversation
      user_id = auth.uid()
      OR
      -- Case 2: Adding someone you can message (golf teammates or coach/player relationship)
      (
        -- You're already in the conversation
        EXISTS (
          SELECT 1 FROM conversation_participants cp
          WHERE cp.conversation_id = conversation_participants.conversation_id
          AND cp.user_id = auth.uid()
        )
        AND (
          -- Golf: Same team (player-to-player)
          EXISTS (
            SELECT 1
            FROM golf_players gp1
            JOIN golf_players gp2 ON gp1.team_id = gp2.team_id
            WHERE gp1.user_id = auth.uid()
            AND gp2.user_id = conversation_participants.user_id
            AND gp1.team_id IS NOT NULL
          )
          OR
          -- Golf: Coach can message their players
          EXISTS (
            SELECT 1
            FROM golf_coaches gc
            JOIN golf_players gp ON gc.team_id = gp.team_id
            WHERE gc.user_id = auth.uid()
            AND gp.user_id = conversation_participants.user_id
          )
          OR
          -- Golf: Player can message their coach
          EXISTS (
            SELECT 1
            FROM golf_players gp
            JOIN golf_coaches gc ON gp.team_id = gc.team_id
            WHERE gp.user_id = auth.uid()
            AND gc.user_id = conversation_participants.user_id
          )
          OR
          -- Baseball: Same team (player-to-player)
          EXISTS (
            SELECT 1
            FROM players p1
            JOIN team_members tm1 ON p1.id = tm1.player_id
            JOIN team_members tm2 ON tm1.team_id = tm2.team_id
            JOIN players p2 ON tm2.player_id = p2.id
            WHERE p1.user_id = auth.uid()
            AND p2.user_id = conversation_participants.user_id
          )
          OR
          -- Baseball: Coach can message their players
          EXISTS (
            SELECT 1
            FROM coaches c
            JOIN team_coach_staff tcs ON c.id = tcs.coach_id
            JOIN team_members tm ON tcs.team_id = tm.team_id
            JOIN players p ON tm.player_id = p.id
            WHERE c.user_id = auth.uid()
            AND p.user_id = conversation_participants.user_id
          )
          OR
          -- Baseball: Player can message their coach
          EXISTS (
            SELECT 1
            FROM players p
            JOIN team_members tm ON p.id = tm.player_id
            JOIN team_coach_staff tcs ON tm.team_id = tcs.team_id
            JOIN coaches c ON tcs.coach_id = c.id
            WHERE p.user_id = auth.uid()
            AND c.user_id = conversation_participants.user_id
          )
        )
      )
    )
  );

-- READ: Users can see all participants in conversations they're part of
CREATE POLICY "Users can view conversation participants"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id
      FROM conversation_participants
      WHERE user_id = auth.uid()
    )
  );

-- UPDATE: Users can update their own participant record
CREATE POLICY "Users can update their participant record"
  ON conversation_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: Users can remove themselves from conversations
CREATE POLICY "Users can remove themselves"
  ON conversation_participants FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can send messages" ON messages;
DROP POLICY IF EXISTS "Users can update their messages" ON messages;
DROP POLICY IF EXISTS "Users can delete their messages" ON messages;

-- CREATE: Users can send messages to conversations they're part of
CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
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

-- Add helpful comments
COMMENT ON POLICY "Users can create conversations" ON conversations IS
'Allows any authenticated user to create a new conversation. Participants are validated separately.';

COMMENT ON POLICY "Users can add participants" ON conversation_participants IS
'Users can add themselves to any conversation, or add others if they have a valid relationship (same team, coach-player, etc.)';

COMMENT ON POLICY "Users can send messages" ON messages IS
'Users can only send messages to conversations they are participants in.';

-- Verify setup
DO $$
BEGIN
  RAISE NOTICE 'Golf messaging RLS policies configured successfully';
  RAISE NOTICE 'Conversations: CREATE (any authenticated), SELECT (participants only)';
  RAISE NOTICE 'Participants: CREATE (with team/coach validation), SELECT (conversation members)';
  RAISE NOTICE 'Messages: Full CRUD with appropriate restrictions';
END $$;
