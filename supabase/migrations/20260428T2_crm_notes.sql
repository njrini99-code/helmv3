-- ============================================================================
-- Migration: 20260428T2_crm_notes.sql
-- Purpose: First-class CRM notes table (call logs, meeting summaries, etc).
--          Replaces the long-form crm_coaches.notes TEXT column going forward.
--          The legacy column stays in place through Phase 1 and is dropped in
--          Phase 3 once the UI fully migrates.
-- ============================================================================

CREATE TABLE crm_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid NOT NULL REFERENCES crm_coaches(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES auth.users(id),
  body        text NOT NULL CHECK (length(body) <= 8000),
  kind        text NOT NULL DEFAULT 'note' CHECK (kind IN ('note','call_log','meeting_summary','internal')),
  is_pinned   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_notes_coach_created ON crm_notes (coach_id, created_at DESC);

-- ============================================================================
-- updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_crm_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_notes_updated_at
  BEFORE UPDATE ON crm_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_notes_updated_at();

-- ============================================================================
-- Backfill: copy crm_coaches.notes (TEXT) into crm_notes as kind='note'.
-- author_id falls back to the first admin user when created_by is null
-- (auth.users FK rejects sentinel UUIDs). We do NOT drop crm_coaches.notes
-- here — Phase 3 cleanup task.
-- ============================================================================
INSERT INTO crm_notes (coach_id, author_id, body, kind, created_at, updated_at)
SELECT
  c.id,
  COALESCE(
    c.created_by,
    (SELECT u.id FROM users u WHERE u.role = 'admin' ORDER BY u.created_at LIMIT 1)
  ),
  c.notes,
  'note',
  COALESCE(c.created_at, now()),
  COALESCE(c.updated_at, now())
FROM crm_coaches c
WHERE c.notes IS NOT NULL AND length(trim(c.notes)) > 0
  AND EXISTS (SELECT 1 FROM users WHERE role = 'admin');  -- skip backfill if no admin exists yet

-- ============================================================================
-- RLS — admin-only (mirrors crm_coaches pattern)
-- ============================================================================
ALTER TABLE crm_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all notes"
  ON crm_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert notes"
  ON crm_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update notes"
  ON crm_notes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete notes"
  ON crm_notes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
