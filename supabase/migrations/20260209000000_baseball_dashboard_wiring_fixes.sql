-- ============================================================================
-- Migration: 20260209000000_baseball_dashboard_wiring_fixes.sql
-- Purpose: Fix missing columns that the baseball dashboard code queries
--          but that don't exist in the database.
-- ============================================================================

-- ============================================================================
-- 1. Add 'title' column to baseball_events
--    The original events table uses 'name' but all dashboard/calendar code
--    references 'title'. Add title as a column and backfill from name.
-- ============================================================================

ALTER TABLE baseball_events
  ADD COLUMN IF NOT EXISTS title TEXT;

-- Backfill: copy name into title for existing rows
UPDATE baseball_events SET title = name WHERE title IS NULL AND name IS NOT NULL;

-- ============================================================================
-- 2. Add 'last_contact' column to baseball_watchlists
--    Referenced by: src/lib/queries/baseball-dashboard.ts watchlist query
-- ============================================================================

ALTER TABLE baseball_watchlists
  ADD COLUMN IF NOT EXISTS last_contact TIMESTAMPTZ;

-- ============================================================================
-- 3. Add indexes for engagement event dashboard queries
--    The dashboard queries baseball_player_engagement_events with filters
--    on coach_id+engagement_type and player_id+engagement_type for weekly
--    profile view counts. These indexes optimize those queries.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_coach_type_date
  ON baseball_player_engagement_events(coach_id, engagement_type, engagement_date DESC)
  WHERE coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_engagement_player_type_date
  ON baseball_player_engagement_events(player_id, engagement_type, engagement_date DESC);

-- ============================================================================
-- 4. Fix baseball_documents schema - add missing columns
--    Code expects: uploaded_by (FK to users), version_count, folder
--    Migration 20260208 created: uploaded_by_id (wrong name)
-- ============================================================================

-- Rename uploaded_by_id to uploaded_by (code expects uploaded_by as FK name for join)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'baseball_documents' AND column_name = 'uploaded_by_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'baseball_documents' AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE baseball_documents RENAME COLUMN uploaded_by_id TO uploaded_by;
  END IF;
END $$;

-- Add FK constraint if not already present (uploaded_by -> users.id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'baseball_documents_uploaded_by_fkey'
      AND table_name = 'baseball_documents'
  ) THEN
    ALTER TABLE baseball_documents
      ADD CONSTRAINT baseball_documents_uploaded_by_fkey
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add missing columns to baseball_documents
ALTER TABLE baseball_documents
  ADD COLUMN IF NOT EXISTS version_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS folder TEXT;

-- ============================================================================
-- 5. Fix baseball_document_versions schema - add missing columns
--    Code expects: file_name, file_size, mime_type, storage_path, change_notes, uploaded_by
--    Migration 20260208 only created: file_url, version_number, uploaded_by_id
-- ============================================================================

-- Rename uploaded_by_id to uploaded_by in versions table too
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'baseball_document_versions' AND column_name = 'uploaded_by_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'baseball_document_versions' AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE baseball_document_versions RENAME COLUMN uploaded_by_id TO uploaded_by;
  END IF;
END $$;

-- Add FK constraint for versions uploaded_by
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'baseball_document_versions_uploaded_by_fkey'
      AND table_name = 'baseball_document_versions'
  ) THEN
    ALTER TABLE baseball_document_versions
      ADD CONSTRAINT baseball_document_versions_uploaded_by_fkey
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add missing columns to baseball_document_versions
ALTER TABLE baseball_document_versions
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS change_notes TEXT;

-- ============================================================================
-- Done! All dashboard and feature queries should now work correctly.
-- ============================================================================
