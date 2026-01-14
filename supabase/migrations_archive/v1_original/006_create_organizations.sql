-- Migration: Create unified organizations table
-- Replaces separate colleges and high_schools tables

-- Enable pg_trgm extension for text search if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('college', 'high_school', 'juco', 'showcase_org', 'travel_ball')),
  division TEXT,
  conference TEXT,
  location_city TEXT,
  location_state VARCHAR(2),
  logo_url TEXT,
  banner_url TEXT,
  website_url TEXT,
  description TEXT,
  primary_color VARCHAR(7) DEFAULT '#16A34A',
  secondary_color VARCHAR(7),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_organizations_type ON organizations(type);
CREATE INDEX idx_organizations_state ON organizations(location_state);
CREATE INDEX idx_organizations_division ON organizations(division) WHERE division IS NOT NULL;
CREATE INDEX idx_organizations_name_trgm ON organizations USING gin(name gin_trgm_ops);

-- Enable Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Organizations are viewable by all authenticated users
CREATE POLICY "Organizations are viewable by all authenticated users"
  ON organizations
  FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policy: Admins can manage organizations
CREATE POLICY "Admins can manage organizations"
  ON organizations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Create update trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Migrate existing colleges to organizations
INSERT INTO organizations (
  id,
  name,
  type,
  division,
  conference,
  location_city,
  location_state,
  logo_url,
  website_url,
  description,
  created_at
)
SELECT
  id,
  name,
  'college' as type,
  division,
  conference,
  city as location_city,
  state as location_state,
  logo_url,
  website as website_url,
  NULL as description,
  created_at
FROM colleges
ON CONFLICT (id) DO NOTHING;

-- Migrate existing high_schools to organizations
INSERT INTO organizations (
  name,
  type,
  location_city,
  location_state,
  created_at
)
SELECT
  name,
  'high_school' as type,
  city as location_city,
  state as location_state,
  created_at
FROM high_schools
ON CONFLICT DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE organizations IS 'Unified table for all organization types: colleges, high schools, JUCOs, showcase orgs';
COMMENT ON COLUMN organizations.type IS 'Organization type: college, high_school, juco, showcase_org, travel_ball';
