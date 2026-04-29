-- ============================================================================
-- Migration: 20260428T1_crm_email_suppressions.sql
-- Purpose: CRM email suppression list (unsubscribes, bounces, complaints,
--          manual blocks, invalid addresses). Used by send-email gate to
--          skip recipients and by the Resend webhook trigger (T7) to record
--          unsubscribe events.
-- ============================================================================

-- citext gives case-insensitive email matching for the suppression check.
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- TABLE
-- ============================================================================
CREATE TABLE crm_email_suppressions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL,
  reason        text NOT NULL CHECK (reason IN ('unsubscribed','hard_bounce','complained','manual','invalid')),
  source        text NOT NULL CHECK (source IN ('resend_webhook','admin','import','system')),
  metadata      jsonb DEFAULT '{}'::jsonb,
  suppressed_at timestamptz NOT NULL DEFAULT now(),
  suppressed_by uuid REFERENCES auth.users(id),
  UNIQUE (email, reason)
);

CREATE INDEX idx_suppressions_email ON crm_email_suppressions (email);
CREATE INDEX idx_suppressions_suppressed_at ON crm_email_suppressions (suppressed_at DESC);

-- ============================================================================
-- RLS — admin-only (mirrors crm_coaches pattern)
-- ============================================================================
ALTER TABLE crm_email_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all suppressions"
  ON crm_email_suppressions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert suppressions"
  ON crm_email_suppressions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update suppressions"
  ON crm_email_suppressions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete suppressions"
  ON crm_email_suppressions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
