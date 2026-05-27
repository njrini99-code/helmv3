-- ============================================================================
-- Migration: 20260429T5_reply_stops_sequences.sql
-- Phase 3 bridging trigger.
--
-- Purpose: When an inbound reply lands in crm_replies and is linked to a coach
--   that is currently enrolled in any active crm_sequence_enrollments rows,
--   stop those enrollments with stop_reason='replied'. This is the
--   "stop on reply" behavior of email sequences.
--
-- Lives in its own migration because crm_replies (T3) and
-- crm_sequence_enrollments (T1) were created by sibling Wave A migrations,
-- so we can only safely add the cross-table trigger after both apply.
-- ============================================================================

CREATE OR REPLACE FUNCTION stop_sequences_on_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.coach_id IS NOT NULL THEN
    UPDATE crm_sequence_enrollments
       SET status = 'stopped',
           stopped_at = NEW.received_at,
           stop_reason = 'replied'
     WHERE coach_id = NEW.coach_id
       AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stop_sequences_on_reply ON crm_replies;

CREATE TRIGGER trg_stop_sequences_on_reply
  AFTER INSERT ON crm_replies
  FOR EACH ROW
  EXECUTE FUNCTION stop_sequences_on_reply();
