-- ============================================================================
-- Fix Golf Conversation Creation
-- Allow creating 1-on-1 conversations for golf teammates
-- ============================================================================

-- First, ensure RLS is enabled on conversations table
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Ensure conversations table has the correct INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;

CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

COMMENT ON POLICY "Authenticated users can create conversations" ON conversations IS
'Allows any authenticated user to create a new conversation.';

-- Drop the restrictive policy on conversation_participants
DROP POLICY IF EXISTS "Users can be added to valid conversations" ON conversation_participants;

-- Create updated policy that allows initial conversation setup
CREATE POLICY "Users can be added to valid conversations"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Case 1: Adding yourself to a new conversation (no participants yet)
      (
        user_id = auth.uid()
        AND NOT EXISTS (
          SELECT 1 FROM conversation_participants cp
          WHERE cp.conversation_id = conversation_participants.conversation_id
        )
      )
      OR
      -- Case 2: Adding the second participant when creating 1-on-1 conversation
      -- (only 1 participant exists, and they are the creator)
      -- For golf users: Check if they're on the same team
      (
        EXISTS (
          SELECT 1 FROM conversation_participants cp
          WHERE cp.conversation_id = conversation_participants.conversation_id
          AND cp.user_id = auth.uid()
          AND NOT EXISTS (
            SELECT 1 FROM conversation_participants cp2
            WHERE cp2.conversation_id = conversation_participants.conversation_id
            AND cp2.user_id != auth.uid()
          )
        )
        AND (
          -- Golf teammates can message each other
          EXISTS (
            SELECT 1
            FROM golf_players gp1
            JOIN golf_players gp2 ON gp1.team_id = gp2.team_id
            WHERE gp1.user_id = auth.uid()
            AND gp2.user_id = conversation_participants.user_id
            AND gp1.team_id IS NOT NULL
          )
          OR
          -- Golf coach can message their players
          EXISTS (
            SELECT 1
            FROM golf_coaches gc
            JOIN golf_players gp ON gc.team_id = gp.team_id
            WHERE gc.user_id = auth.uid()
            AND gp.user_id = conversation_participants.user_id
          )
          OR
          -- Golf player can message their coach
          EXISTS (
            SELECT 1
            FROM golf_players gp
            JOIN golf_coaches gc ON gp.team_id = gc.team_id
            WHERE gp.user_id = auth.uid()
            AND gc.user_id = conversation_participants.user_id
          )
        )
      )
      OR
      -- Case 3: Being added by someone who can message you (existing conversations)
      (
        EXISTS (
          SELECT 1 FROM conversation_participants cp
          WHERE cp.conversation_id = conversation_participants.conversation_id
          AND (
            -- Golf teammates
            EXISTS (
              SELECT 1
              FROM golf_players gp1
              JOIN golf_players gp2 ON gp1.team_id = gp2.team_id
              WHERE gp1.user_id = cp.user_id
              AND gp2.user_id = conversation_participants.user_id
              AND gp1.team_id IS NOT NULL
            )
            OR
            -- Golf coach adding their player
            EXISTS (
              SELECT 1
              FROM golf_coaches gc
              JOIN golf_players gp ON gc.team_id = gp.team_id
              WHERE gc.user_id = cp.user_id
              AND gp.user_id = conversation_participants.user_id
            )
          )
        )
      )
    )
  );

-- Add comment explaining the policy
COMMENT ON POLICY "Users can be added to valid conversations" ON conversation_participants IS
'Allows users to create 1-on-1 conversations with people they can message.
Case 1: Creator adds themselves to empty conversation.
Case 2: Creator adds second person if they can message them.
Case 3: Existing participants can add others who can be messaged.';
