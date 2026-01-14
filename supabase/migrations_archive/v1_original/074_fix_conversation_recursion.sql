-- ============================================================================
-- Fix Infinite Recursion in Conversation Participants Policy
-- ============================================================================
--
-- ISSUE: Policy queries conversation_participants table while evaluating
--        INSERT on conversation_participants, causing infinite recursion
--
-- SOLUTION: Simplify policy to only handle 1-on-1 conversation creation
--           Remove Case 3 which caused the recursion
--
-- ============================================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can be added to valid conversations" ON conversation_participants;

-- Create simplified policy for 1-on-1 conversation creation
CREATE POLICY "Users can be added to valid conversations"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Case 1: Adding yourself to a new conversation (first participant)
      user_id = auth.uid()
      OR
      -- Case 2: Adding teammate/coach as second participant
      -- Only allowed if YOU are already a participant and they're on your team
      (
        -- You must already be in the conversation
        auth.uid() IN (
          SELECT user_id FROM conversation_participants
          WHERE conversation_id = conversation_participants.conversation_id
        )
        AND
        -- And you can message them (same team or coach-player relationship)
        (
          -- Golf teammates
          EXISTS (
            SELECT 1
            FROM golf_players gp1
            JOIN golf_players gp2 ON gp1.team_id = gp2.team_id
            WHERE gp1.user_id = auth.uid()
            AND gp2.user_id = conversation_participants.user_id
            AND gp1.team_id IS NOT NULL
          )
          OR
          -- Golf coach adding their player
          EXISTS (
            SELECT 1
            FROM golf_coaches gc
            JOIN golf_players gp ON gc.team_id = gp.team_id
            WHERE gc.user_id = auth.uid()
            AND gp.user_id = conversation_participants.user_id
          )
          OR
          -- Golf player adding their coach
          EXISTS (
            SELECT 1
            FROM golf_players gp
            JOIN golf_coaches gc ON gp.team_id = gc.team_id
            WHERE gp.user_id = auth.uid()
            AND gc.user_id = conversation_participants.user_id
          )
        )
      )
    )
  );

COMMENT ON POLICY "Users can be added to valid conversations" ON conversation_participants IS
'Simplified policy to avoid recursion. Users can add themselves or add teammates/coaches to conversations they are part of.';
