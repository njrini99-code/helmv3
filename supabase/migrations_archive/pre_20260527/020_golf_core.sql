-- ============================================================================
-- Migration: 020_golf_core.sql
-- Purpose: Core golf tables - organizations, teams, coaches, players
-- Consolidated from: 016_create_golf_schema.sql (core tables)
-- ============================================================================

-- Golf Organizations (Schools/Programs)
CREATE TABLE IF NOT EXISTS golf_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  division TEXT,
  conference TEXT,
  city TEXT,
  state TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Golf Teams (Men's Golf, Women's Golf per organization)
CREATE TABLE IF NOT EXISTS golf_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES golf_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  season TEXT,
  invite_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_teams_invite_code ON golf_teams(invite_code) WHERE invite_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_golf_teams_org ON golf_teams(organization_id);

-- Golf Coaches
CREATE TABLE IF NOT EXISTS golf_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES golf_organizations(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_coaches_user ON golf_coaches(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_coaches_team ON golf_coaches(team_id);

-- Golf Players
CREATE TABLE IF NOT EXISTS golf_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  year golf_player_year,
  graduation_year INTEGER,
  major TEXT,
  hometown TEXT,
  state TEXT,
  handicap DECIMAL(4,1),
  scholarship_percentage DECIMAL(5,2),
  gpa DECIMAL(3,2),
  status golf_player_status DEFAULT 'active',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  profile_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_players_user ON golf_players(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_players_team ON golf_players(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_players_status ON golf_players(status);

-- Golf Team Settings
CREATE TABLE IF NOT EXISTS golf_team_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE UNIQUE,
  scoring_format TEXT DEFAULT 'stroke_play',
  handicap_system TEXT DEFAULT 'usga',
  default_tees TEXT,
  timezone TEXT DEFAULT 'America/Chicago',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Triggers
CREATE OR REPLACE FUNCTION update_golf_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_golf_organizations_updated_at
  BEFORE UPDATE ON golf_organizations
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_teams_updated_at
  BEFORE UPDATE ON golf_teams
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_coaches_updated_at
  BEFORE UPDATE ON golf_coaches
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_players_updated_at
  BEFORE UPDATE ON golf_players
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

CREATE TRIGGER update_golf_team_settings_updated_at
  BEFORE UPDATE ON golf_team_settings
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Documentation
COMMENT ON TABLE golf_organizations IS 'Golf schools/programs (separate from baseball organizations)';
COMMENT ON TABLE golf_teams IS 'Golf teams per organization (men, women)';
COMMENT ON TABLE golf_coaches IS 'Golf coaches linked to users';
COMMENT ON TABLE golf_players IS 'Golf players linked to teams';
