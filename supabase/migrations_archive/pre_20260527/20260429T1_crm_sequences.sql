-- ============================================================================
-- Migration: 20260429T1_crm_sequences.sql
-- Purpose: Email sequences (drip campaigns) — Phase 2 of the CRM upgrade.
--          Three tables:
--            - crm_sequences              (a named drip campaign)
--            - crm_sequence_steps         (ordered step definitions, optional
--                                          template_id + per-step subject/body
--                                          overrides + delay_hours)
--            - crm_sequence_enrollments   (a coach's progress through one
--                                          sequence; one row per
--                                          (sequence, coach) pair)
--
--          Cron route /api/cron/process-sequences ticks every 10 minutes,
--          fetches enrollments where status='active' AND next_send_at <= now(),
--          checks suppression / bounce stop conditions, sends the current
--          step via Resend, advances current_step + next_send_at.
-- ============================================================================

-- ============================================================================
-- crm_sequences — drip campaign definitions
-- ============================================================================
CREATE TABLE crm_sequences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text,
  trigger_kind text NOT NULL DEFAULT 'manual'
    CHECK (trigger_kind IN ('manual','status_change','segment_match')),
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- crm_sequence_steps — ordered steps inside a sequence.
-- step_order is 1-indexed and unique within a sequence.
-- delay_hours is the wait BEFORE this step fires (relative to the previous
-- step's send time, or to enrollment time for step 1).
-- template_id is optional — if set, the renderer pulls subject/body from the
-- template; subject_override / body_override take precedence when present.
-- ============================================================================
CREATE TABLE crm_sequence_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id     uuid NOT NULL REFERENCES crm_sequences(id) ON DELETE CASCADE,
  step_order      smallint NOT NULL CHECK (step_order > 0),
  delay_hours     integer NOT NULL DEFAULT 0 CHECK (delay_hours >= 0),
  template_id     uuid REFERENCES crm_email_templates(id) ON DELETE SET NULL,
  subject_override text,
  body_override   text,
  condition       jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, step_order)
);

CREATE INDEX idx_crm_sequence_steps_sequence
  ON crm_sequence_steps (sequence_id, step_order);

-- ============================================================================
-- crm_sequence_enrollments — one row per (sequence, coach) pair.
-- current_step is the NEXT step to be sent (0 = no steps sent yet).
-- next_send_at is when the cron should next fire for this enrollment.
-- ============================================================================
CREATE TABLE crm_sequence_enrollments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id   uuid NOT NULL REFERENCES crm_sequences(id) ON DELETE CASCADE,
  coach_id      uuid NOT NULL REFERENCES crm_coaches(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','completed','stopped')),
  current_step  smallint NOT NULL DEFAULT 0,
  next_send_at  timestamptz,
  enrolled_at   timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  stopped_at    timestamptz,
  stop_reason   text CHECK (stop_reason IS NULL OR stop_reason IN (
    'replied','unsubscribed','bounced','manual','sequence_completed'
  )),
  enrolled_by   uuid NOT NULL REFERENCES auth.users(id),
  metadata      jsonb DEFAULT '{}'::jsonb,
  UNIQUE (sequence_id, coach_id)
);

CREATE INDEX idx_seq_enrollments_due
  ON crm_sequence_enrollments (next_send_at, status)
  WHERE status = 'active' AND next_send_at IS NOT NULL;

CREATE INDEX idx_seq_enrollments_coach
  ON crm_sequence_enrollments (coach_id, status);

-- ============================================================================
-- updated_at trigger on crm_sequences (mirrors crm_notes / crm_segments
-- pattern in the Phase 1 migrations).
-- ============================================================================
CREATE OR REPLACE FUNCTION update_crm_sequences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_sequences_updated_at
  BEFORE UPDATE ON crm_sequences
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_sequences_updated_at();

-- ============================================================================
-- RLS — admin-only (mirrors the pattern from
-- 20260428T1_crm_email_suppressions.sql).
-- ============================================================================

-- ---- crm_sequences ----
ALTER TABLE crm_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all sequences"
  ON crm_sequences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert sequences"
  ON crm_sequences FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update sequences"
  ON crm_sequences FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete sequences"
  ON crm_sequences FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ---- crm_sequence_steps ----
ALTER TABLE crm_sequence_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all sequence steps"
  ON crm_sequence_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert sequence steps"
  ON crm_sequence_steps FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update sequence steps"
  ON crm_sequence_steps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete sequence steps"
  ON crm_sequence_steps FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ---- crm_sequence_enrollments ----
ALTER TABLE crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all sequence enrollments"
  ON crm_sequence_enrollments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert sequence enrollments"
  ON crm_sequence_enrollments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update sequence enrollments"
  ON crm_sequence_enrollments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete sequence enrollments"
  ON crm_sequence_enrollments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
