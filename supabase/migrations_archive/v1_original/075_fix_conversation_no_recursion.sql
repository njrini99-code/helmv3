-- ============================================================================
-- Fix Conversation Participants - Complete Recursion Fix
-- ============================================================================
--
-- ISSUE: Previous fix still had recursion by querying conversation_participants
--        within the INSERT policy for conversation_participants
--
-- SOLUTION: Completely avoid querying conversation_participants table
--           Use a simpler policy that only checks team relationships
--
-- ============================================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can be added to valid conversations" ON conversation_participants;

-- Create a simple, non-recursive policy
-- Users can add themselves OR anyone on their team/coach relationship
CREATE POLICY "Users can be added to valid conversations"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Can always add yourself
      user_id = auth.uid()
      OR
      -- Can add teammates (players on same team)
      EXISTS (
        SELECT 1
        FROM golf_players gp1
        JOIN golf_players gp2 ON gp1.team_id = gp2.team_id
        WHERE gp1.user_id = auth.uid()
        AND gp2.user_id = conversation_participants.user_id
        AND gp1.team_id IS NOT NULL
      )
      OR
      -- Coaches can add their players
      EXISTS (
        SELECT 1
        FROM golf_coaches gc
        JOIN golf_players gp ON gc.team_id = gp.team_id
        WHERE gc.user_id = auth.uid()
        AND gp.user_id = conversation_participants.user_id
      )
      OR
      -- Players can add their coach
      EXISTS (
        SELECT 1
        FROM golf_players gp
        JOIN golf_coaches gc ON gp.team_id = gc.team_id
        WHERE gp.user_id = auth.uid()
        AND gc.user_id = conversation_participants.user_id
      )
    )
  );

COMMENT ON POLICY "Users can be added to valid conversations" ON conversation_participants IS
'Simple policy with NO recursion. Users can add themselves or teammates/coaches. Does not query conversation_participants table.';
