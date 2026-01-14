-- =====================================================
-- FIX: Separate SELECT policy for golf_player_classes
-- Allow players to read their own classes
-- Keep restrictive policies for INSERT/UPDATE/DELETE
-- =====================================================

-- Drop the overly restrictive ALL policies
DROP POLICY IF EXISTS "Players can manage own classes" ON golf_player_classes;
DROP POLICY IF EXISTS "Players can manage their own classes" ON golf_player_classes;

-- Allow players to SELECT (read) their own classes
-- This is needed for calendar joins
CREATE POLICY "Players can read their own classes"
ON golf_player_classes
FOR SELECT
USING (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);

-- Keep strict control for INSERT/UPDATE/DELETE
CREATE POLICY "Players can insert their own classes"
ON golf_player_classes
FOR INSERT
WITH CHECK (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Players can update their own classes"
ON golf_player_classes
FOR UPDATE
USING (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Players can delete their own classes"
ON golf_player_classes
FOR DELETE
USING (
  player_id IN (
    SELECT id FROM golf_players WHERE user_id = auth.uid()
  )
);
