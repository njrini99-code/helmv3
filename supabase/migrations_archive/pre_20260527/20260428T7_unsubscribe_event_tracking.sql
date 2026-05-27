-- ============================================================================
-- Migration: 20260428T7_unsubscribe_event_tracking.sql
-- Purpose: When the Resend webhook records an `email.unsubscribed` event into
--          email_events, automatically:
--            1. Insert a 'unsubscribed' row into crm_email_suppressions
--               (idempotent via UNIQUE (email, reason)).
--            2. Flip the related coach's email_status to 'unsubscribed'.
--
--          The webhook handler itself only needs to add 'email.unsubscribed'
--          to its TRACKED_EVENTS Set; this trigger handles the side effect
--          atomically with the event row insert.
-- ============================================================================

CREATE OR REPLACE FUNCTION write_suppression_on_unsubscribe()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.event_type = 'email.unsubscribed' AND NEW.recipient_email IS NOT NULL THEN
    INSERT INTO crm_email_suppressions (email, reason, source, metadata, suppressed_at)
    VALUES (
      NEW.recipient_email::citext,
      'unsubscribed',
      'resend_webhook',
      jsonb_build_object(
        'email_id', NEW.resend_message_id,
        'event_id', NEW.id
      ),
      NEW.occurred_at
    )
    ON CONFLICT (email, reason) DO NOTHING;

    UPDATE crm_coaches c
       SET email_status = 'unsubscribed',
           updated_at = now()
      FROM crm_contact_log cl
     WHERE cl.id = NEW.contact_log_id
       AND cl.coach_id = c.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_write_suppression_on_unsubscribe ON email_events;

CREATE TRIGGER trg_write_suppression_on_unsubscribe
  AFTER INSERT ON email_events
  FOR EACH ROW
  EXECUTE FUNCTION write_suppression_on_unsubscribe();
