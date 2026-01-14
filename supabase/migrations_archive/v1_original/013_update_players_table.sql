-- Migration: Update players table with missing fields
-- Adds fields required by CLAUDE.md spec that weren't in original schema

-- Add player_type if not exists (should already exist but checking)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'player_type') THEN
    ALTER TABLE players ADD COLUMN player_type VARCHAR(20) DEFAULT 'high_school'
      CHECK (player_type IN ('high_school', 'showcase', 'juco', 'college'));
  END IF;
END $$;

-- Add recruiting_activated fields
ALTER TABLE players ADD COLUMN IF NOT EXISTS recruiting_activated BOOLEAN DEFAULT FALSE;
ALTER TABLE players ADD COLUMN IF NOT EXISTS recruiting_activated_at TIMESTAMPTZ;

-- Add organization references
ALTER TABLE players ADD COLUMN IF NOT EXISTS high_school_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS showcase_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE players ADD COLUMN IF NOT EXISTS college_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Add showcase team info
ALTER TABLE players ADD COLUMN IF NOT EXISTS showcase_team_name VARCHAR(255);

-- Add goals and aspirations
ALTER TABLE players ADD COLUMN IF NOT EXISTS primary_goal VARCHAR(50);
ALTER TABLE players ADD COLUMN IF NOT EXISTS top_schools TEXT[];

-- Add committed fields with org reference
ALTER TABLE players ADD COLUMN IF NOT EXISTS committed_to_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Add full_name computed field (for search)
ALTER TABLE players ADD COLUMN IF NOT EXISTS full_name TEXT GENERATED ALWAYS AS (
  CASE
    WHEN first_name IS NOT NULL AND last_name IS NOT NULL
    THEN first_name || ' ' || last_name
    ELSE COALESCE(first_name, last_name, '')
  END
) STORED;

-- Add verification flag for metrics
ALTER TABLE players ADD COLUMN IF NOT EXISTS verified_metrics BOOLEAN DEFAULT FALSE;

-- Add onboarding tracking
ALTER TABLE players ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

-- ==============================================
-- CREATE INDEXES
-- ==============================================

-- Index for recruiting discovery (critical for performance)
CREATE INDEX IF NOT EXISTS idx_players_recruiting ON players(recruiting_activated) WHERE recruiting_activated = TRUE;

-- Index for player type
CREATE INDEX IF NOT EXISTS idx_players_type ON players(player_type);

-- Index for graduation year (frequently filtered)
CREATE INDEX IF NOT EXISTS idx_players_grad_year ON players(grad_year) WHERE grad_year IS NOT NULL;

-- Index for position (frequently filtered)
CREATE INDEX IF NOT EXISTS idx_players_position ON players(primary_position) WHERE primary_position IS NOT NULL;

-- Index for state (frequently filtered)
CREATE INDEX IF NOT EXISTS idx_players_state ON players(state) WHERE state IS NOT NULL;

-- Composite index for common discover query
CREATE INDEX IF NOT EXISTS idx_players_recruiting_grad_pos ON players(recruiting_activated, grad_year, primary_position)
  WHERE recruiting_activated = TRUE;

-- Full text search on names
CREATE INDEX IF NOT EXISTS idx_players_full_name_trgm ON players USING gin(full_name gin_trgm_ops);

-- Org references
CREATE INDEX IF NOT EXISTS idx_players_hs_org ON players(high_school_org_id) WHERE high_school_org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_players_showcase_org ON players(showcase_org_id) WHERE showcase_org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_players_college_org ON players(college_org_id) WHERE college_org_id IS NOT NULL;

-- Committed players
CREATE INDEX IF NOT EXISTS idx_players_committed ON players(committed_to_org_id) WHERE committed_to_org_id IS NOT NULL;

-- ==============================================
-- MIGRATE EXISTING DATA
-- ==============================================

-- Link existing players to organizations where possible
-- This matches high_school_name to organizations
UPDATE players p
SET high_school_org_id = o.id
FROM organizations o
WHERE p.high_school_name IS NOT NULL
  AND p.high_school_org_id IS NULL
  AND o.type = 'high_school'
  AND LOWER(TRIM(o.name)) = LOWER(TRIM(p.high_school_name))
  AND (p.state IS NULL OR o.location_state = p.state);

-- Link committed players to organizations
-- The committed_to field is a UUID reference to colleges table
-- We need to migrate via the colleges -> organizations mapping
UPDATE players p
SET committed_to_org_id = o.id
FROM colleges c
JOIN organizations o ON LOWER(TRIM(o.name)) = LOWER(TRIM(c.name)) AND o.type = 'college'
WHERE p.committed_to = c.id
  AND p.committed_to_org_id IS NULL;

-- ==============================================
-- ADD CONSTRAINTS
-- ==============================================

-- Ensure recruiting_activated_at is set when activated
CREATE OR REPLACE FUNCTION set_recruiting_activated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.recruiting_activated = TRUE AND OLD.recruiting_activated = FALSE AND NEW.recruiting_activated_at IS NULL THEN
    NEW.recruiting_activated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_recruiting_activated_timestamp
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION set_recruiting_activated_at();

-- ==============================================
-- HELPER FUNCTIONS
-- ==============================================

-- Get multi-team player context
CREATE OR REPLACE FUNCTION get_player_teams(p_player_id UUID)
RETURNS TABLE (
  team_id UUID,
  team_name TEXT,
  team_type VARCHAR(20),
  role VARCHAR(50),
  jersey_number INTEGER,
  is_primary BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as team_id,
    t.name as team_name,
    t.team_type,
    tm.role,
    tm.jersey_number,
    (tm.team_id = (
      SELECT tm2.team_id
      FROM team_members tm2
      WHERE tm2.player_id = p_player_id
        AND tm2.status = 'active'
      ORDER BY tm2.joined_at ASC
      LIMIT 1
    )) as is_primary
  FROM team_members tm
  JOIN teams t ON t.id = tm.team_id
  WHERE tm.player_id = p_player_id
    AND tm.status = 'active'
  ORDER BY tm.joined_at ASC;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- Calculate profile completion percentage
CREATE OR REPLACE FUNCTION calculate_profile_completion(p_player_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_total_fields INTEGER := 20;
  v_completed_fields INTEGER := 0;
  v_player RECORD;
BEGIN
  SELECT * INTO v_player FROM players WHERE id = p_player_id;

  IF v_player.first_name IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.last_name IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.email IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.phone IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.avatar_url IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.city IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.state IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.primary_position IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.grad_year IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.height_feet IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.weight_lbs IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.high_school_name IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.pitch_velo IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.exit_velo IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.sixty_time IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.gpa IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.about_me IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.primary_goal IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.has_video = TRUE THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_player.highlight_url IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;

  RETURN (v_completed_fields * 100 / v_total_fields);
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- COMMENTS FOR DOCUMENTATION
-- ==============================================

COMMENT ON COLUMN players.recruiting_activated IS 'TRUE when player activates recruiting to get discovered by coaches';
COMMENT ON COLUMN players.player_type IS 'Player type: high_school, showcase, juco, college';
COMMENT ON COLUMN players.high_school_org_id IS 'Link to high school organization (if exists in orgs table)';
COMMENT ON COLUMN players.showcase_org_id IS 'Link to showcase organization (if exists in orgs table)';
COMMENT ON COLUMN players.college_org_id IS 'Link to college organization (for college players)';
COMMENT ON COLUMN players.top_schools IS 'Array of school names player is interested in';
COMMENT ON COLUMN players.full_name IS 'Computed field: first_name + last_name for search';
