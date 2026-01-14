-- Fix golf_players table by adding missing columns
-- Migration: 20251231000001_fix_golf_players_columns.sql

-- Add team_id column (most critical for relationships)
ALTER TABLE golf_players
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL;

-- Add other missing profile columns from the original schema
ALTER TABLE golf_players
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS year golf_player_year,
ADD COLUMN IF NOT EXISTS graduation_year INTEGER,
ADD COLUMN IF NOT EXISTS major TEXT,
ADD COLUMN IF NOT EXISTS hometown TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS handicap DECIMAL(4,1),
ADD COLUMN IF NOT EXISTS scholarship_percentage DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS gpa DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS status golf_player_status DEFAULT 'active',
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Create index for team_id lookups
CREATE INDEX IF NOT EXISTS idx_golf_players_team_id ON golf_players(team_id);

-- Add updated_at trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_golf_players_updated_at') THEN
    CREATE TRIGGER update_golf_players_updated_at
      BEFORE UPDATE ON golf_players
      FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();
  END IF;
END $$;
