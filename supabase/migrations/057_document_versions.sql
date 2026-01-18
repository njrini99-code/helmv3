-- ============================================================================
-- Migration: 057_document_versions.sql
-- Purpose: Document version control and preview support for golf documents
-- ============================================================================

-- Golf Document Versions
-- Tracks version history for each document
CREATE TABLE IF NOT EXISTS golf_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES golf_documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  uploaded_by UUID REFERENCES golf_coaches(id),
  change_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique version numbers per document
  CONSTRAINT unique_document_version UNIQUE (document_id, version_number)
);

-- Add current_version_id to documents table
ALTER TABLE golf_documents
ADD COLUMN IF NOT EXISTS current_version_id UUID REFERENCES golf_document_versions(id);

-- Add version_count for quick display
ALTER TABLE golf_documents
ADD COLUMN IF NOT EXISTS version_count INT DEFAULT 1;

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_golf_document_versions_document
ON golf_document_versions(document_id);

CREATE INDEX IF NOT EXISTS idx_golf_document_versions_created
ON golf_document_versions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_golf_documents_current_version
ON golf_documents(current_version_id);

-- Function to auto-increment version number on insert
CREATE OR REPLACE FUNCTION set_document_version_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Get next version number for this document
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO NEW.version_number
  FROM golf_document_versions
  WHERE document_id = NEW.document_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to set version number before insert
DROP TRIGGER IF EXISTS set_document_version_number_trigger ON golf_document_versions;
CREATE TRIGGER set_document_version_number_trigger
  BEFORE INSERT ON golf_document_versions
  FOR EACH ROW
  WHEN (NEW.version_number IS NULL OR NEW.version_number = 0)
  EXECUTE FUNCTION set_document_version_number();

-- Function to update document version_count and current_version_id
CREATE OR REPLACE FUNCTION update_document_version_info()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the parent document with new version info
  UPDATE golf_documents
  SET
    current_version_id = NEW.id,
    version_count = (
      SELECT COUNT(*) FROM golf_document_versions WHERE document_id = NEW.document_id
    ),
    file_url = NEW.file_url,
    file_size = NEW.file_size,
    updated_at = NOW()
  WHERE id = NEW.document_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update document after new version is added
DROP TRIGGER IF EXISTS update_document_version_info_trigger ON golf_document_versions;
CREATE TRIGGER update_document_version_info_trigger
  AFTER INSERT ON golf_document_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_document_version_info();

-- RLS Policies for golf_document_versions
ALTER TABLE golf_document_versions ENABLE ROW LEVEL SECURITY;

-- Coaches can view versions for documents in their teams
CREATE POLICY "Coaches can view document versions"
ON golf_document_versions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM golf_documents d
    JOIN golf_teams t ON d.team_id = t.id
    JOIN golf_coaches c ON t.organization_id = c.organization_id
    WHERE d.id = golf_document_versions.document_id
    AND c.user_id = auth.uid()
  )
);

-- Players can view versions for player-visible documents in their teams
CREATE POLICY "Players can view document versions for visible docs"
ON golf_document_versions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM golf_documents d
    JOIN golf_team_members tm ON d.team_id = tm.team_id
    JOIN golf_players p ON tm.player_id = p.id
    WHERE d.id = golf_document_versions.document_id
    AND d.is_public = true
    AND p.user_id = auth.uid()
  )
);

-- Coaches can insert new versions
CREATE POLICY "Coaches can insert document versions"
ON golf_document_versions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM golf_documents d
    JOIN golf_teams t ON d.team_id = t.id
    JOIN golf_coaches c ON t.organization_id = c.organization_id
    WHERE d.id = golf_document_versions.document_id
    AND c.user_id = auth.uid()
  )
);

-- Coaches can delete versions (for cleanup)
CREATE POLICY "Coaches can delete document versions"
ON golf_document_versions FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM golf_documents d
    JOIN golf_teams t ON d.team_id = t.id
    JOIN golf_coaches c ON t.organization_id = c.organization_id
    WHERE d.id = golf_document_versions.document_id
    AND c.user_id = auth.uid()
  )
);

-- Documentation
COMMENT ON TABLE golf_document_versions IS 'Version history for golf team documents';
COMMENT ON COLUMN golf_document_versions.version_number IS 'Auto-incrementing version number per document';
COMMENT ON COLUMN golf_document_versions.change_notes IS 'Optional notes describing changes in this version';
COMMENT ON COLUMN golf_documents.current_version_id IS 'Reference to the current/latest version';
COMMENT ON COLUMN golf_documents.version_count IS 'Total number of versions for quick display';
