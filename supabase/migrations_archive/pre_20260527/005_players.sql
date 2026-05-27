-- ============================================================================
-- Migration: 005_players.sql
-- Purpose: Baseball players table
-- Consolidated from: 001_schema.sql, 013_update_players_table.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  player_type player_type NOT NULL,

  -- Basic info
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  city TEXT,
  state TEXT,

  -- Baseball info
  primary_position TEXT,
  secondary_position TEXT,
  grad_year INTEGER,
  bats TEXT,
  throws TEXT,
  height_feet INTEGER,
  height_inches INTEGER,
  weight_lbs INTEGER,

  -- School info
  high_school_name TEXT,
  high_school_id UUID REFERENCES high_schools(id),
  high_school_org_id UUID REFERENCES organizations(id),
  club_team TEXT,

  -- Measurables
  pitch_velo DECIMAL(4,1),
  exit_velo DECIMAL(4,1),
  sixty_time DECIMAL(4,2),
  pop_time DECIMAL(4,2),
  arm_strength DECIMAL(4,1),

  -- Academics
  gpa DECIMAL(3,2),
  sat_score INTEGER,
  act_score INTEGER,

  -- Social/Profile
  instagram TEXT,
  twitter TEXT,
  about_me TEXT,
  has_video BOOLEAN DEFAULT FALSE,

  -- Recruiting
  recruiting_activated BOOLEAN DEFAULT FALSE,
  recruiting_activated_at TIMESTAMPTZ,
  committed_to UUID REFERENCES colleges(id),
  committed_to_org_id UUID REFERENCES organizations(id),
  commitment_date DATE,

  -- Status
  onboarding_completed BOOLEAN DEFAULT FALSE,
  profile_completion_percent INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full text search vector
ALTER TABLE players ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(first_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(last_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(high_school_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(city, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(state, '')), 'C')
  ) STORED;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id);
CREATE INDEX IF NOT EXISTS idx_players_grad_year ON players(grad_year);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(primary_position);
CREATE INDEX IF NOT EXISTS idx_players_state ON players(state);
CREATE INDEX IF NOT EXISTS idx_players_recruiting ON players(recruiting_activated) WHERE recruiting_activated = true;
CREATE INDEX IF NOT EXISTS idx_players_search ON players USING gin(search_vector);

-- Trigger for updated_at
CREATE TRIGGER update_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to calculate profile completion
CREATE OR REPLACE FUNCTION calculate_profile_completion(p players)
RETURNS INTEGER AS $$
DECLARE
  total INTEGER := 15;
  filled INTEGER := 0;
BEGIN
  IF p.first_name IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.last_name IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.primary_position IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.grad_year IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.height_feet IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.weight_lbs IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.high_school_name IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.city IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.state IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.gpa IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.bats IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.throws IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.about_me IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.pitch_velo IS NOT NULL OR p.exit_velo IS NOT NULL THEN filled := filled + 1; END IF;
  IF p.has_video THEN filled := filled + 1; END IF;
  RETURN (filled * 100 / total);
END;
$$ LANGUAGE plpgsql;
