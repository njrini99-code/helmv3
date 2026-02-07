-- ============================================================================
-- Migration: 060_add_golf_documents_folder.sql
-- Purpose: Add folder column to golf_documents for document organization
-- ============================================================================

-- Add folder column
ALTER TABLE golf_documents ADD COLUMN IF NOT EXISTS folder TEXT;

-- Index for folder filtering
CREATE INDEX IF NOT EXISTS idx_golf_documents_folder ON golf_documents(folder);

COMMENT ON COLUMN golf_documents.folder IS 'Optional folder name for document organization';
