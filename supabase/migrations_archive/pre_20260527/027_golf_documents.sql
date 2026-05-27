-- ============================================================================
-- Migration: 027_golf_documents.sql
-- Purpose: Golf team documents
-- Consolidated from: 016_create_golf_schema.sql (documents section)
-- ============================================================================

-- Golf Documents
CREATE TABLE IF NOT EXISTS golf_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  category TEXT,
  player_visible BOOLEAN DEFAULT TRUE,
  uploaded_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_documents_team ON golf_documents(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_documents_category ON golf_documents(category);
CREATE INDEX IF NOT EXISTS idx_golf_documents_visible ON golf_documents(player_visible);

-- Triggers
CREATE TRIGGER update_golf_documents_updated_at
  BEFORE UPDATE ON golf_documents
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Documentation
COMMENT ON TABLE golf_documents IS 'Team documents uploaded by coaches';
