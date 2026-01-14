-- ============================================================================
-- Migration: 004_coaches.sql
-- Purpose: Baseball coaches table
-- Consolidated from: 001_schema.sql, 003_add_conference_to_coaches.sql, 014_update_coaches_table.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  coach_type coach_type NOT NULL,
  full_name TEXT,
  email_contact TEXT,
  phone TEXT,
  avatar_url TEXT,
  coach_title TEXT,

  -- Organization relationships (new unified)
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Legacy relationship (deprecated, kept for migration)
  college_id UUID REFERENCES colleges(id) ON DELETE SET NULL,

  -- School info (denormalized for quick access)
  school_name TEXT,
  school_city TEXT,
  school_state TEXT,
  program_division TEXT,
  conference TEXT,

  -- Profile content
  about TEXT,
  primary_color TEXT DEFAULT '#16A34A',
  secondary_color TEXT DEFAULT '#FFFFFF',
  recruiting_class_needs TEXT[],

  -- Status
  onboarding_completed BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coaches_user_id ON coaches(user_id);
CREATE INDEX IF NOT EXISTS idx_coaches_type ON coaches(coach_type);
CREATE INDEX IF NOT EXISTS idx_coaches_organization ON coaches(organization_id);
CREATE INDEX IF NOT EXISTS idx_coaches_state ON coaches(school_state);

-- Trigger for updated_at
CREATE TRIGGER update_coaches_updated_at
  BEFORE UPDATE ON coaches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
