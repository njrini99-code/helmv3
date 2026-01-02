-- Fix golf_players table by adding missing columns
-- Run this to make golf_players match the schema in 016_create_golf_schema.sql

-- Add team_id column (most critical)
ALTER TABLE golf_players
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL;

-- Add other missing profile columns
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

-- Create index for team_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_golf_players_team_id ON golf_players(team_id);

-- Verify the changes
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'golf_players'
ORDER BY ordinal_position;
