-- ============================================================================
-- Migration: 20260428T4_crm_segments.sql
-- Purpose: Saved CoachFilters definitions (named segments). The `definition`
--          JSONB shape MIRRORS the Filters interface in CoachFilters.tsx and
--          the SegmentDefinition contract in
--          src/app/golf/admin/crm/types/foundations.ts. If one moves, the
--          others must move in lockstep.
-- ============================================================================

CREATE TABLE crm_segments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description text CHECK (description IS NULL OR length(description) <= 500),
  definition  jsonb NOT NULL,
  created_by  uuid NOT NULL REFERENCES auth.users(id),
  is_shared   boolean NOT NULL DEFAULT true,
  pin_order   smallint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, name)
);

CREATE INDEX idx_crm_segments_pin ON crm_segments (pin_order) WHERE pin_order IS NOT NULL;

-- ============================================================================
-- updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_crm_segments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_segments_updated_at
  BEFORE UPDATE ON crm_segments
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_segments_updated_at();

-- ============================================================================
-- RLS — admin-only (mirrors crm_coaches pattern)
-- ============================================================================
ALTER TABLE crm_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all segments"
  ON crm_segments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert segments"
  ON crm_segments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update segments"
  ON crm_segments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete segments"
  ON crm_segments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
