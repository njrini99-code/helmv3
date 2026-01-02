
-- Fix golf_events RLS policy
ALTER TABLE golf_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Coaches can manage their events" ON golf_events;
DROP POLICY IF EXISTS "Team members can view their events" ON golf_events;
DROP POLICY IF EXISTS "Public can view all events" ON golf_events;

-- Coaches can manage their events (team_id can be null for unassigned events)
CREATE POLICY "Coaches can manage their events"
ON golf_events FOR ALL
USING (
  team_id IS NULL OR
  team_id IN (
    SELECT team_id FROM golf_coaches
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  team_id IS NULL OR
  team_id IN (
    SELECT team_id FROM golf_coaches
    WHERE user_id = auth.uid()
  )
);

-- Team members can view their team's events
CREATE POLICY "Team members can view their events"
ON golf_events FOR SELECT
USING (
  team_id IN (
    SELECT team_id FROM golf_players
    WHERE user_id = auth.uid()
  )
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_events TO authenticated;
