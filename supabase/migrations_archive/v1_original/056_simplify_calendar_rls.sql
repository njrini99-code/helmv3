-- =====================================================
-- SIMPLIFY CALENDAR RLS FOR PLAYER-CENTRIC APPROACH
-- Players can create class schedules and calendar events
-- Coaches can view player calendars when on same team
-- =====================================================

-- STEP 1: Make created_by nullable (players can create events without coach)
ALTER TABLE golf_events ALTER COLUMN created_by DROP NOT NULL;

-- STEP 2: Fix golf_player_classes RLS - Players can manage their own classes
DROP POLICY IF EXISTS "Players can manage their own classes" ON golf_player_classes;

CREATE POLICY "Players can manage their own classes"
ON golf_player_classes
FOR ALL
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

-- STEP 3: Fix golf_events RLS - Players can manage their team calendar
DROP POLICY IF EXISTS "Players can create personal events" ON golf_events;
DROP POLICY IF EXISTS "Team members can view their events" ON golf_events;
DROP POLICY IF EXISTS "Players and coaches can manage team calendar" ON golf_events;

CREATE POLICY "Players and coaches can manage team calendar"
ON golf_events
FOR ALL
USING (
  -- Player can see their team's events
  team_id IN (
    SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
  OR
  -- Coach can see their team's events
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  -- Player can create events for their team
  team_id IN (
    SELECT team_id FROM golf_players WHERE user_id = auth.uid()
  )
  OR
  -- Coach can create events for their team
  team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
  )
);
