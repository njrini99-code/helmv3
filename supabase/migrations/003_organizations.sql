-- ============================================================================
-- Migration: 003_organizations.sql
-- Purpose: Unified organizations table (replaces colleges/high_schools)
-- Consolidated from: 006_create_organizations.sql
-- ============================================================================

-- Legacy tables (kept for backwards compatibility, will be deprecated)
CREATE TABLE IF NOT EXISTS colleges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  division TEXT,
  conference TEXT,
  city TEXT,
  state TEXT,
  logo_url TEXT,
  website TEXT,
  baseball_url TEXT,
  head_coach TEXT,
  assistant_coaches TEXT[],
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS high_schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unified Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type organization_type NOT NULL,
  division TEXT,
  conference TEXT,
  location_city TEXT,
  location_state TEXT,
  logo_url TEXT,
  banner_url TEXT,
  website_url TEXT,
  description TEXT,
  primary_color TEXT DEFAULT '#16A34A',
  secondary_color TEXT DEFAULT '#FFFFFF',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_organizations_state ON organizations(location_state);
CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations USING gin(name gin_trgm_ops);

-- Trigger for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
