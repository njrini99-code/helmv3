-- ============================================================================
-- CRM Email Tracking: Resend webhook events for delivery, opens, clicks, bounces
-- ============================================================================

-- 1. Add resend_message_id to existing crm_contact_log table
-- Links sent emails to their Resend message ID for webhook event correlation
ALTER TABLE crm_contact_log ADD COLUMN IF NOT EXISTS resend_message_id text;

CREATE INDEX IF NOT EXISTS idx_crm_contact_log_resend_msg
  ON crm_contact_log (resend_message_id)
  WHERE resend_message_id IS NOT NULL;

-- 2. Create crm_email_events table for webhook event storage
CREATE TABLE IF NOT EXISTS crm_email_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_log_id    uuid REFERENCES crm_contact_log(id) ON DELETE CASCADE,
  resend_message_id text NOT NULL,
  event_type        text NOT NULL,        -- email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained
  recipient_email   text,
  occurred_at       timestamptz NOT NULL,
  raw_payload       jsonb,
  created_at        timestamptz DEFAULT now(),

  -- Idempotency: prevent duplicate webhook deliveries
  CONSTRAINT crm_email_events_dedup UNIQUE (resend_message_id, event_type, occurred_at)
);

-- Indexes for common access patterns
CREATE INDEX idx_crm_email_events_contact ON crm_email_events (contact_log_id);
CREATE INDEX idx_crm_email_events_msg     ON crm_email_events (resend_message_id);
CREATE INDEX idx_crm_email_events_type    ON crm_email_events (event_type);

-- 3. RLS: Admin-only read access (webhook inserts use service role key, bypasses RLS)
ALTER TABLE crm_email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email events"
  ON crm_email_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Deny direct writes from authenticated users (webhook inserts use service role, bypasses RLS)
CREATE POLICY "No direct inserts by users"
  ON crm_email_events FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No direct updates by users"
  ON crm_email_events FOR UPDATE
  USING (false);

CREATE POLICY "No direct deletes by users"
  ON crm_email_events FOR DELETE
  USING (false);

-- 4. Aggregate stats RPC for CRM Dashboard email performance card
CREATE OR REPLACE FUNCTION get_crm_email_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'total_sent', (SELECT count(*) FROM crm_contact_log WHERE resend_message_id IS NOT NULL),
      'delivered',  (SELECT count(DISTINCT resend_message_id) FROM crm_email_events WHERE event_type = 'email.delivered'),
      'opened',     (SELECT count(DISTINCT resend_message_id) FROM crm_email_events WHERE event_type = 'email.opened'),
      'clicked',    (SELECT count(DISTINCT resend_message_id) FROM crm_email_events WHERE event_type = 'email.clicked'),
      'bounced',    (SELECT count(DISTINCT resend_message_id) FROM crm_email_events WHERE event_type = 'email.bounced'),
      'complained', (SELECT count(DISTINCT resend_message_id) FROM crm_email_events WHERE event_type = 'email.complained')
    )
  );
END;
$$;

-- Restrict RPC execution to authenticated users only (anon/public cannot call)
REVOKE EXECUTE ON FUNCTION get_crm_email_stats() FROM public, anon;
