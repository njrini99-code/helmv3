-- ============================================================================
-- Migration: 20260429T3_crm_replies.sql
-- Phase 3 — Stream P3-A: Inbound reply tracking
--
-- Purpose: Persist inbound coach replies received via Resend Inbound Email
--   Receiving (operator must configure the inbound webhook in the Resend
--   dashboard separately). The /api/webhooks/resend-inbound route parses
--   payloads and writes here.
--
-- thread_id is normalized from the inbound email's References[0] header (or,
-- if missing, In-Reply-To, or finally the message's own Message-ID). The
-- receiving route also tries to attach coach_id + contact_log_id by matching
-- in_reply_to to crm_contact_log.resend_message_id.
--
-- NOTE on sequence-stop trigger: the original spec called for a trigger here
-- that flips active crm_sequence_enrollments rows to status='stopped',
-- stop_reason='replied' on insert. crm_sequence_enrollments is created by
-- Wave A1's Phase 2 migration (20260505T1_crm_sequences.sql). To avoid
-- migration ordering issues, that trigger is intentionally NOT added here.
-- The orchestrator will land it as a separate follow-up migration once both
-- this one and the sequences migration are applied.
-- ============================================================================

CREATE TABLE crm_replies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id           uuid REFERENCES crm_coaches(id) ON DELETE SET NULL,
  contact_log_id     uuid REFERENCES crm_contact_log(id) ON DELETE SET NULL,
  thread_id          text,
  message_id         text NOT NULL,
  in_reply_to        text,
  from_address       text NOT NULL,
  to_addresses       text[] NOT NULL DEFAULT '{}',
  subject            text,
  body_text          text,
  body_html          text,
  received_at        timestamptz NOT NULL DEFAULT now(),
  raw_payload        jsonb,
  is_read            boolean NOT NULL DEFAULT false,
  UNIQUE (message_id)
);

CREATE INDEX idx_crm_replies_thread
  ON crm_replies (thread_id, received_at DESC)
  WHERE thread_id IS NOT NULL;

CREATE INDEX idx_crm_replies_coach
  ON crm_replies (coach_id, received_at DESC)
  WHERE coach_id IS NOT NULL;

CREATE INDEX idx_crm_replies_unread
  ON crm_replies (received_at DESC)
  WHERE is_read = false;

-- ============================================================================
-- RLS — admin-only (mirrors crm_email_suppressions pattern from 20260428T1)
-- ============================================================================
ALTER TABLE crm_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all replies"
  ON crm_replies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert replies"
  ON crm_replies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update replies"
  ON crm_replies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete replies"
  ON crm_replies FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
