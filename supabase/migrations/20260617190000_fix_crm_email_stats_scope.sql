-- Fix get_crm_email_stats so delivered/opened/clicked/bounced can never exceed
-- total_sent (the source of the impossible "110% delivery rate" in the CRM).
--
-- Bug: total_sent counted only CRM crm_contact_log sends, but delivered/opened/
-- etc. counted ALL email_events — including transactional mail (welcome/digest/
-- invites) that shares the same Resend webhook and has no contact-log row. So a
-- denominator of 782 CRM sends was divided into 860 all-source deliveries = 110%.
--
-- Fix: scope every event count to message ids that belong to a CRM contact-log
-- send, and count DISTINCT message ids on both sides — delivered is then a strict
-- subset of total_sent.
CREATE OR REPLACE FUNCTION public.get_crm_email_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    WITH crm_msg AS (
      SELECT DISTINCT resend_message_id
      FROM crm_contact_log
      WHERE resend_message_id IS NOT NULL
    )
    SELECT jsonb_build_object(
      'total_sent', (SELECT count(*) FROM crm_msg),
      'delivered',  (SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
                       WHERE ee.event_type = 'email.delivered'
                         AND ee.resend_message_id IN (SELECT resend_message_id FROM crm_msg)),
      'opened',     (SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
                       WHERE ee.event_type = 'email.opened'
                         AND ee.resend_message_id IN (SELECT resend_message_id FROM crm_msg)),
      'clicked',    (SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
                       WHERE ee.event_type = 'email.clicked'
                         AND ee.resend_message_id IN (SELECT resend_message_id FROM crm_msg)),
      'bounced',    (SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
                       WHERE ee.event_type = 'email.bounced'
                         AND ee.resend_message_id IN (SELECT resend_message_id FROM crm_msg)),
      'complained', (SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
                       WHERE ee.event_type = 'email.complained'
                         AND ee.resend_message_id IN (SELECT resend_message_id FROM crm_msg))
    )
  );
END;
$function$;
