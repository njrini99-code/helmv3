-- Create team lineups tables for baseball
-- This allows coaches to create and save batting order lineups

-- Team lineups table (one per saved lineup)
CREATE TABLE IF NOT EXISTS team_lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lineup positions (batting order)
CREATE TABLE IF NOT EXISTS lineup_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id UUID NOT NULL REFERENCES team_lineups(id) ON DELETE CASCADE,
  batting_order INT NOT NULL CHECK (batting_order >= 1 AND batting_order <= 9),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lineup_id, batting_order),
  UNIQUE(lineup_id, player_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_lineups_team_id ON team_lineups(team_id);
CREATE INDEX IF NOT EXISTS idx_team_lineups_coach_id ON team_lineups(coach_id);
CREATE INDEX IF NOT EXISTS idx_lineup_positions_lineup_id ON lineup_positions(lineup_id);

-- RLS policies for team_lineups
ALTER TABLE team_lineups ENABLE ROW LEVEL SECURITY;

-- Coaches can view lineups for their teams
CREATE POLICY "Coaches can view team lineups"
  ON team_lineups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = team_lineups.coach_id
      AND coaches.user_id = auth.uid()
    )
  );

-- Coaches can create lineups for their teams
CREATE POLICY "Coaches can create team lineups"
  ON team_lineups
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = coach_id
      AND coaches.user_id = auth.uid()
    )
  );

-- Coaches can update their own lineups
CREATE POLICY "Coaches can update their lineups"
  ON team_lineups
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = team_lineups.coach_id
      AND coaches.user_id = auth.uid()
    )
  );

-- Coaches can delete their own lineups
CREATE POLICY "Coaches can delete their lineups"
  ON team_lineups
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = team_lineups.coach_id
      AND coaches.user_id = auth.uid()
    )
  );

-- RLS policies for lineup_positions
ALTER TABLE lineup_positions ENABLE ROW LEVEL SECURITY;

-- Coaches can view positions for their lineups
CREATE POLICY "Coaches can view lineup positions"
  ON lineup_positions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_lineups tl
      JOIN coaches c ON c.id = tl.coach_id
      WHERE tl.id = lineup_positions.lineup_id
      AND c.user_id = auth.uid()
    )
  );

-- Coaches can insert positions for their lineups
CREATE POLICY "Coaches can insert lineup positions"
  ON lineup_positions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_lineups tl
      JOIN coaches c ON c.id = tl.coach_id
      WHERE tl.id = lineup_id
      AND c.user_id = auth.uid()
    )
  );

-- Coaches can update positions for their lineups
CREATE POLICY "Coaches can update lineup positions"
  ON lineup_positions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_lineups tl
      JOIN coaches c ON c.id = tl.coach_id
      WHERE tl.id = lineup_positions.lineup_id
      AND c.user_id = auth.uid()
    )
  );

-- Coaches can delete positions from their lineups
CREATE POLICY "Coaches can delete lineup positions"
  ON lineup_positions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM team_lineups tl
      JOIN coaches c ON c.id = tl.coach_id
      WHERE tl.id = lineup_positions.lineup_id
      AND c.user_id = auth.uid()
    )
  );

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_team_lineups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_team_lineups_updated_at
  BEFORE UPDATE ON team_lineups
  FOR EACH ROW
  EXECUTE FUNCTION update_team_lineups_updated_at();
