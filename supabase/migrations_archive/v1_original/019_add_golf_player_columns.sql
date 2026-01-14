-- Add missing columns to golf_players table
-- These columns exist in 016_create_golf_schema.sql but weren't applied to remote

ALTER TABLE golf_players 
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL,
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

-- Also ensure golf_players has proper indexes
CREATE INDEX IF NOT EXISTS idx_golf_players_team ON golf_players(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_golf_players_user ON golf_players(user_id);

-- Rename handicap_index to match schema (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'golf_players' AND column_name = 'handicap_index'
  ) THEN
    ALTER TABLE golf_players DROP COLUMN handicap_index;
  END IF;
END
$$;

-- Ensure golf_coaches has all required columns
ALTER TABLE golf_coaches
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
