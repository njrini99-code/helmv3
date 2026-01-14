-- ============================================================================
-- Migration: 018_team_lineups.sql
-- Purpose: Team lineups for baseball batting orders
-- Consolidated from: 038_team_lineups.sql
-- ============================================================================

-- Team Lineups
CREATE TABLE IF NOT EXISTS team_lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lineup Positions (batting order)
CREATE TABLE IF NOT EXISTS lineup_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id UUID NOT NULL REFERENCES team_lineups(id) ON DELETE CASCADE,
  batting_order INT NOT NULL CHECK (batting_order >= 1 AND batting_order <= 9),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lineup_id, batting_order),
  UNIQUE(lineup_id, player_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_lineups_team_id ON team_lineups(team_id);
CREATE INDEX IF NOT EXISTS idx_team_lineups_coach_id ON team_lineups(coach_id);
CREATE INDEX IF NOT EXISTS idx_lineup_positions_lineup_id ON lineup_positions(lineup_id);

-- Triggers
CREATE OR REPLACE FUNCTION update_team_lineups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_team_lineups_updated_at
  BEFORE UPDATE ON team_lineups
  FOR EACH ROW EXECUTE FUNCTION update_team_lineups_updated_at();

-- Documentation
COMMENT ON TABLE team_lineups IS 'Saved batting order lineups for baseball teams';
COMMENT ON TABLE lineup_positions IS 'Individual positions in a batting lineup';
