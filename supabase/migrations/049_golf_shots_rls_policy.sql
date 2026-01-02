-- Enable RLS on golf_shots (if not already enabled)
ALTER TABLE golf_shots ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies that might conflict
DROP POLICY IF EXISTS "Players can read their own shots" ON golf_shots;
DROP POLICY IF EXISTS "Coaches can read their team shots" ON golf_shots;

-- Allow players to read their own shots
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

-- Allow coaches to read their team's shots
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

-- Allow players to insert their own shots
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

-- Allow players to update their own shots
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

-- Allow players to delete their own shots
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
