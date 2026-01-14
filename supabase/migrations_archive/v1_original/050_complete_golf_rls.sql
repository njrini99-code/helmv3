
-- ============================================================================
-- GOLF_SHOTS TABLE - CRITICAL FOR STATS
-- ============================================================================

ALTER TABLE golf_shots ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Players can read their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Coaches can read their team shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can insert their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can update their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Players can delete their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Authenticated users can access golf_shots" ON golf_shots;

-- Players can read their own shots
CREATE POLICY "Players can read their own shots"
ON golf_shots FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);

-- Coaches can read their team's shots
CREATE POLICY "Coaches can read their team shots"
ON golf_shots FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM golf_rounds
    JOIN golf_players ON golf_players.id = golf_rounds.player_id
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_players.team_id IN (
      SELECT team_id FROM golf_coaches
      WHERE user_id = auth.uid()
    )
  )
);

-- Players can insert their own shots
CREATE POLICY "Players can insert their own shots"
ON golf_shots FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);

-- Players can update their own shots
CREATE POLICY "Players can update their own shots"
ON golf_shots FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);

-- Players can delete their own shots
CREATE POLICY "Players can delete their own shots"
ON golf_shots FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);

-- ============================================================================
-- GOLF_ROUNDS TABLE - CRITICAL FOR STATS
-- ============================================================================

ALTER TABLE golf_rounds ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Players can read their own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Coaches can read their team rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can insert their own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can update their own rounds" ON golf_rounds;
DROP POLICY IF EXISTS "Players can delete their own rounds" ON golf_rounds;

-- Players can read their own rounds
CREATE POLICY "Players can read their own rounds"
ON golf_rounds FOR SELECT
USING (
  player_id IN (
    SELECT id FROM golf_players
    WHERE user_id = auth.uid()
  )
);

-- Coaches can read their team's rounds
CREATE POLICY "Coaches can read their team rounds"
ON golf_rounds FOR SELECT
USING (
  player_id IN (
    SELECT gp.id
    FROM golf_players gp
    WHERE gp.team_id IN (
      SELECT team_id FROM golf_coaches
      WHERE user_id = auth.uid()
    )
  )
);

-- Players can insert their own rounds
CREATE POLICY "Players can insert their own rounds"
ON golf_rounds FOR INSERT
WITH CHECK (
  player_id IN (
    SELECT id FROM golf_players
    WHERE user_id = auth.uid()
  )
);

-- Players can update their own rounds
CREATE POLICY "Players can update their own rounds"
ON golf_rounds FOR UPDATE
USING (
  player_id IN (
    SELECT id FROM golf_players
    WHERE user_id = auth.uid()
  )
);

-- Players can delete their own rounds
CREATE POLICY "Players can delete their own rounds"
ON golf_rounds FOR DELETE
USING (
  player_id IN (
    SELECT id FROM golf_players
    WHERE user_id = auth.uid()
  )
);

-- ============================================================================
-- GOLF_EVENTS TABLE
-- ============================================================================

ALTER TABLE golf_events ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Coaches can manage their events" ON golf_events;
DROP POLICY IF EXISTS "Team members can view their events" ON golf_events;

-- Coaches can manage their events
CREATE POLICY "Coaches can manage their events"
ON golf_events FOR ALL
USING (
  team_id IN (
    SELECT team_id FROM golf_coaches
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  team_id IN (
    SELECT team_id FROM golf_coaches
    WHERE user_id = auth.uid()
  )
);

-- Team members can view their events
CREATE POLICY "Team members can view their events"
ON golf_events FOR SELECT
USING (
  team_id IN (
    SELECT team_id FROM golf_players
    WHERE user_id = auth.uid()
  )
);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_shots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_rounds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_events TO authenticated;
