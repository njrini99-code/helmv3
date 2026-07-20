-- ============================================================================
-- CRM templates — real usage tracking
-- ----------------------------------------------------------------------------
-- usage_count was a lossy counter nothing on the Gmail-direct path incremented
-- (1,310 logged email sends, zero with a template stamp from that path). The
-- send paths now (a) stamp templateId into crm_contact_log.metadata on every
-- send and (b) bump usage_count by emails actually sent + set last_used_at.
-- This migration adds the last_used_at column those paths write.
--
-- Additive only; idempotent; safe on live prod.
-- ============================================================================

ALTER TABLE public.crm_email_templates
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

COMMENT ON COLUMN public.crm_email_templates.last_used_at IS
  'Timestamp of the most recent email sent with this template (any send path). Maintained by the send paths alongside usage_count (which counts emails sent, not send-clicks).';
