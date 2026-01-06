-- Fix RLS policy for golf_events to allow players to create personal events

-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "Users can insert events for their team" ON golf_events;
DROP POLICY IF EXISTS "Coaches can insert events" ON golf_events;
DROP POLICY IF EXISTS "Allow event creation" ON golf_events;

-- Create new INSERT policy that allows:
-- 1. Coaches to insert events for their team
-- 2. Players to insert events for their team OR personal events (team_id = null)
CREATE POLICY "Allow users to create events"
ON golf_events
FOR INSERT
TO authenticated
WITH CHECK (
  -- Allow if user is a coach and the team_id matches their team
  (
    EXISTS (
      SELECT 1 FROM golf_coaches
      WHERE golf_coaches.user_id = auth.uid()
        AND golf_coaches.team_id = golf_events.team_id
    )
  )
  OR
  -- Allow if user is a player and either:
  -- - team_id matches their team, OR
  -- - team_id is null (personal event)
  (
    EXISTS (
      SELECT 1 FROM golf_players
      WHERE golf_players.user_id = auth.uid()
        AND (
          golf_players.team_id = golf_events.team_id
          OR golf_events.team_id IS NULL
        )
    )
  )
);
