-- ============================================================================
-- Migration: Migrate Foreign Keys to Organizations Table
-- Purpose: Replace deprecated colleges/high_schools FKs with organizations
-- Strategy: 4-phase backwards-compatible migration
-- ============================================================================

-- ============================================================================
-- IMMEDIATE SECURITY: Enable RLS on unprotected tables
-- ============================================================================

-- Enable RLS on colleges (temporary until dropped)
ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Colleges viewable by authenticated users"
  ON colleges FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Enable RLS on high_schools (temporary until dropped)
ALTER TABLE high_schools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "High schools viewable by authenticated users"
  ON high_schools FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Enable RLS on video_views (temporary until dropped)
ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Video views insertable by authenticated users"
  ON video_views FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Video views viewable by video owner"
  ON video_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM videos v
      JOIN players p ON p.id = v.player_id
      WHERE v.id = video_views.video_id
      AND p.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PHASE 1: Add new columns (backwards compatible)
-- ============================================================================

-- Add organization_id to coaches (replaces college_id)
ALTER TABLE coaches
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Add organization_id to players (replaces high_school_id)
ALTER TABLE players
ADD COLUMN IF NOT EXISTS high_school_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Add committed_to_org_id to players (replaces committed_to)
ALTER TABLE players
ADD COLUMN IF NOT EXISTS committed_to_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_coaches_organization ON coaches(organization_id);
CREATE INDEX IF NOT EXISTS idx_players_hs_org ON players(high_school_org_id);
CREATE INDEX IF NOT EXISTS idx_players_committed_org ON players(committed_to_org_id);

-- ============================================================================
-- PHASE 2: Migrate data from deprecated tables to organizations (if not exists)
-- ============================================================================

-- Insert colleges into organizations (if not already there)
INSERT INTO organizations (name, type, division, conference, location_city, location_state, created_at)
SELECT
  c.name,
  'college' as type,
  c.division,
  c.conference,
  c.city as location_city,
  c.state as location_state,
  c.created_at
FROM colleges c
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o
  WHERE o.name = c.name
  AND o.type = 'college'
  AND COALESCE(o.location_state, '') = COALESCE(c.state, '')
)
ON CONFLICT DO NOTHING;

-- Insert high_schools into organizations (if not already there)
INSERT INTO organizations (name, type, location_city, location_state, created_at)
SELECT
  h.name,
  'high_school' as type,
  h.city as location_city,
  h.state as location_state,
  h.created_at
FROM high_schools h
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o
  WHERE o.name = h.name
  AND o.type = 'high_school'
  AND COALESCE(o.location_state, '') = COALESCE(h.state, '')
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PHASE 3: Populate new FK columns from old data
-- ============================================================================

-- Map coaches.college_id to coaches.organization_id
UPDATE coaches c
SET organization_id = (
  SELECT o.id FROM organizations o
  JOIN colleges col ON col.id = c.college_id
  WHERE o.name = col.name
  AND o.type = 'college'
  AND COALESCE(o.location_state, '') = COALESCE(col.state, '')
  LIMIT 1
)
WHERE c.college_id IS NOT NULL
AND c.organization_id IS NULL;

-- Map players.high_school_id to players.high_school_org_id
UPDATE players p
SET high_school_org_id = (
  SELECT o.id FROM organizations o
  JOIN high_schools hs ON hs.id = p.high_school_id
  WHERE o.name = hs.name
  AND o.type = 'high_school'
  AND COALESCE(o.location_state, '') = COALESCE(hs.state, '')
  LIMIT 1
)
WHERE p.high_school_id IS NOT NULL
AND p.high_school_org_id IS NULL;

-- Map players.committed_to to players.committed_to_org_id
UPDATE players p
SET committed_to_org_id = (
  SELECT o.id FROM organizations o
  JOIN colleges col ON col.id = p.committed_to
  WHERE o.name = col.name
  AND o.type = 'college'
  AND COALESCE(o.location_state, '') = COALESCE(col.state, '')
  LIMIT 1
)
WHERE p.committed_to IS NOT NULL
AND p.committed_to_org_id IS NULL;

-- ============================================================================
-- VERIFICATION QUERIES (run these manually to verify before Phase 4)
-- ============================================================================

-- Check migration success rate for coaches:
-- SELECT
--   COUNT(*) as total,
--   COUNT(college_id) as has_old_fk,
--   COUNT(organization_id) as has_new_fk,
--   COUNT(CASE WHEN college_id IS NOT NULL AND organization_id IS NULL THEN 1 END) as unmigrated
-- FROM coaches;

-- Check migration success rate for players high_school:
-- SELECT
--   COUNT(*) as total,
--   COUNT(high_school_id) as has_old_fk,
--   COUNT(high_school_org_id) as has_new_fk,
--   COUNT(CASE WHEN high_school_id IS NOT NULL AND high_school_org_id IS NULL THEN 1 END) as unmigrated
-- FROM players;

-- Check migration success rate for players committed_to:
-- SELECT
--   COUNT(*) as total,
--   COUNT(committed_to) as has_old_fk,
--   COUNT(committed_to_org_id) as has_new_fk,
--   COUNT(CASE WHEN committed_to IS NOT NULL AND committed_to_org_id IS NULL THEN 1 END) as unmigrated
-- FROM players;

-- ============================================================================
-- PHASE 4: Drop deprecated columns and tables (RUN AFTER VERIFICATION)
-- Create separate migration file: 032_drop_deprecated_tables.sql
-- ============================================================================

-- DO NOT RUN YET - This is for after app code is updated
-- See migration 032 below
