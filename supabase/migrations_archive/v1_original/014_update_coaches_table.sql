-- Migration: Update coaches table with missing fields
-- Adds fields required by CLAUDE.md spec

-- Add organization_id reference
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Add program details
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS program_philosophy TEXT;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS program_values TEXT;
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS what_we_look_for TEXT;

-- Add logo if not exists (some schemas might have this)
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add secondary color
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7);

-- Add organization name (denormalized for performance)
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS organization_name TEXT;

-- Add athletic conference (different from academic conference)
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS athletic_conference TEXT;

-- Add onboarding tracking
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

-- ==============================================
-- CREATE INDEXES
-- ==============================================

-- Index for organization lookup
CREATE INDEX IF NOT EXISTS idx_coaches_org ON coaches(organization_id) WHERE organization_id IS NOT NULL;

-- Index for coach type (frequently filtered)
CREATE INDEX IF NOT EXISTS idx_coaches_type ON coaches(coach_type);

-- Index for program division
CREATE INDEX IF NOT EXISTS idx_coaches_division ON coaches(program_division) WHERE program_division IS NOT NULL;

-- Index for conference
CREATE INDEX IF NOT EXISTS idx_coaches_conference ON coaches(athletic_conference) WHERE athletic_conference IS NOT NULL;

-- Composite index for recruiting discovery
CREATE INDEX IF NOT EXISTS idx_coaches_recruiting ON coaches(coach_type, program_division) WHERE coach_type = 'college';

-- Full text search on coach/school names
CREATE INDEX IF NOT EXISTS idx_coaches_name_trgm ON coaches USING gin(full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_coaches_school_trgm ON coaches USING gin(school_name gin_trgm_ops) WHERE school_name IS NOT NULL;

-- ==============================================
-- MIGRATE EXISTING DATA TO ORGANIZATIONS
-- ==============================================

-- Link college coaches to organizations
UPDATE coaches c
SET organization_id = o.id, organization_name = o.name
FROM organizations o
WHERE c.coach_type = 'college'
  AND c.organization_id IS NULL
  AND c.school_name IS NOT NULL
  AND o.type = 'college'
  AND LOWER(TRIM(o.name)) = LOWER(TRIM(c.school_name));

-- Link high school coaches to organizations
UPDATE coaches c
SET organization_id = o.id, organization_name = o.name
FROM organizations o
WHERE c.coach_type = 'high_school'
  AND c.organization_id IS NULL
  AND c.school_name IS NOT NULL
  AND o.type = 'high_school'
  AND LOWER(TRIM(o.name)) = LOWER(TRIM(c.school_name))
  AND (c.school_city IS NULL OR LOWER(o.location_city) = LOWER(c.school_city))
  AND (c.school_state IS NULL OR o.location_state = c.school_state);

-- Link JUCO coaches to organizations
UPDATE coaches c
SET organization_id = o.id, organization_name = o.name
FROM organizations o
WHERE c.coach_type = 'juco'
  AND c.organization_id IS NULL
  AND c.school_name IS NOT NULL
  AND o.type = 'juco'
  AND LOWER(TRIM(o.name)) = LOWER(TRIM(c.school_name));

-- Create organizations for showcase coaches if they don't exist
INSERT INTO organizations (name, type, location_city, location_state, logo_url, primary_color)
SELECT DISTINCT
  c.school_name,
  'showcase_org' as type,
  c.school_city,
  c.school_state,
  c.logo_url,
  c.primary_color
FROM coaches c
WHERE c.coach_type = 'showcase'
  AND c.school_name IS NOT NULL
  AND c.organization_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM organizations o
    WHERE LOWER(TRIM(o.name)) = LOWER(TRIM(c.school_name))
      AND o.type = 'showcase_org'
  )
ON CONFLICT DO NOTHING;

-- Link showcase coaches to their organizations
UPDATE coaches c
SET organization_id = o.id, organization_name = o.name
FROM organizations o
WHERE c.coach_type = 'showcase'
  AND c.organization_id IS NULL
  AND c.school_name IS NOT NULL
  AND o.type = 'showcase_org'
  AND LOWER(TRIM(o.name)) = LOWER(TRIM(c.school_name));

-- ==============================================
-- ADD CONSTRAINTS & TRIGGERS
-- ==============================================

-- Auto-update organization_name when organization changes
CREATE OR REPLACE FUNCTION sync_coach_organization_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL AND (OLD.organization_id IS NULL OR NEW.organization_id != OLD.organization_id) THEN
    SELECT name INTO NEW.organization_name
    FROM organizations
    WHERE id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_coach_org_name
  BEFORE UPDATE ON coaches
  FOR EACH ROW
  WHEN (NEW.organization_id IS DISTINCT FROM OLD.organization_id)
  EXECUTE FUNCTION sync_coach_organization_name();

-- ==============================================
-- HELPER FUNCTIONS
-- ==============================================

-- Get coach's full profile with organization
CREATE OR REPLACE FUNCTION get_coach_profile(p_coach_id UUID)
RETURNS TABLE (
  coach_id UUID,
  full_name TEXT,
  coach_type VARCHAR(20),
  coach_title TEXT,
  email TEXT,
  phone TEXT,
  organization_name TEXT,
  division TEXT,
  conference TEXT,
  about TEXT,
  philosophy TEXT,
  program_values TEXT,
  what_they_look_for TEXT,
  logo_url TEXT,
  team_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as coach_id,
    c.full_name,
    c.coach_type::VARCHAR(20),
    c.coach_title,
    c.email_contact as email,
    c.phone,
    COALESCE(c.organization_name, c.school_name) as organization_name,
    c.program_division as division,
    c.athletic_conference as conference,
    c.about,
    c.program_philosophy as philosophy,
    c.program_values as values,
    c.what_we_look_for as what_they_look_for,
    COALESCE(c.logo_url, o.logo_url) as logo_url,
    COUNT(DISTINCT t.id) as team_count
  FROM coaches c
  LEFT JOIN organizations o ON o.id = c.organization_id
  LEFT JOIN teams t ON (t.head_coach_id = c.id OR EXISTS (
    SELECT 1 FROM team_coach_staff tcs WHERE tcs.team_id = t.id AND tcs.coach_id = c.id
  ))
  WHERE c.id = p_coach_id
  GROUP BY c.id, o.logo_url;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- Get coach's teams
CREATE OR REPLACE FUNCTION get_coach_teams(p_coach_id UUID)
RETURNS TABLE (
  team_id UUID,
  team_name TEXT,
  team_type VARCHAR(20),
  role VARCHAR(100),
  is_head_coach BOOLEAN,
  player_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  -- Head coach teams
  SELECT
    t.id as team_id,
    t.name as team_name,
    t.team_type,
    'Head Coach'::VARCHAR(100) as role,
    TRUE as is_head_coach,
    COUNT(tm.id) as player_count
  FROM teams t
  LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.status = 'active'
  WHERE t.head_coach_id = p_coach_id
  GROUP BY t.id, t.name, t.team_type

  UNION

  -- Staff teams
  SELECT
    t.id as team_id,
    t.name as team_name,
    t.team_type,
    tcs.role,
    FALSE as is_head_coach,
    COUNT(tm.id) as player_count
  FROM team_coach_staff tcs
  JOIN teams t ON t.id = tcs.team_id
  LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.status = 'active'
  WHERE tcs.coach_id = p_coach_id
  GROUP BY t.id, t.name, t.team_type, tcs.role
  ORDER BY is_head_coach DESC, team_name;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- Calculate coach profile completion
CREATE OR REPLACE FUNCTION calculate_coach_completion(p_coach_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_total_fields INTEGER := 12;
  v_completed_fields INTEGER := 0;
  v_coach RECORD;
BEGIN
  SELECT * INTO v_coach FROM coaches WHERE id = p_coach_id;

  IF v_coach.full_name IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_coach.email_contact IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_coach.phone IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_coach.avatar_url IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_coach.coach_title IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_coach.school_name IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_coach.program_division IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_coach.about IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_coach.program_philosophy IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_coach.what_we_look_for IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_coach.logo_url IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;
  IF v_coach.organization_id IS NOT NULL THEN v_completed_fields := v_completed_fields + 1; END IF;

  RETURN (v_completed_fields * 100 / v_total_fields);
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- COMMENTS FOR DOCUMENTATION
-- ==============================================

COMMENT ON COLUMN coaches.organization_id IS 'Link to unified organizations table';
COMMENT ON COLUMN coaches.program_philosophy IS 'Coach/program philosophy and approach';
COMMENT ON COLUMN coaches.program_values IS 'Program values and culture';
COMMENT ON COLUMN coaches.what_we_look_for IS 'What the program looks for in recruits';
COMMENT ON COLUMN coaches.organization_name IS 'Denormalized org name for performance';
COMMENT ON COLUMN coaches.athletic_conference IS 'Athletic conference (may differ from academic)';
