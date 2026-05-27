-- ============================================================================
-- Email Clicks + Coach Email Activity Denorm
--   Purpose: capture per-click telemetry (URL, UA, IP) for every email.clicked
--   event, and denormalize "latest email event" onto crm_coaches so the CRM
--   coach table can render email activity without a join.
--
--   Changes:
--     1. New `email_clicks` table (one row per clicked webhook event)
--     2. Trigger on email_events INSERT where event_type = 'email.clicked'
--        that extracts click metadata into email_clicks
--     3. Denorm columns on crm_coaches: last_email_event_type, last_email_event_at
--     4. Trigger on email_events INSERT that updates crm_coaches via the
--        contact_log bridge, monotonically (older events never clobber newer)
--     5. Backfill both email_clicks and the crm_coaches denorm from existing
--        email_events rows
--     6. RLS + realtime publication to match the pattern in the prior migration
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. email_clicks: per-click telemetry extracted from email.clicked events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_clicks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_event_id    uuid NOT NULL REFERENCES email_events(id) ON DELETE CASCADE,

  -- Copied from email_events for fast lookup without a join
  resend_message_id text NOT NULL,
  recipient_email   text NOT NULL,

  -- Extracted from raw_payload -> data -> click
  clicked_url       text,
  user_agent        text,
  ip_address        text,

  occurred_at       timestamptz NOT NULL,
  inserted_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_clicks_resend_msg
  ON email_clicks (resend_message_id);

CREATE INDEX IF NOT EXISTS idx_email_clicks_recipient
  ON email_clicks (recipient_email);

CREATE INDEX IF NOT EXISTS idx_email_clicks_occurred_at
  ON email_clicks (occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 2. RLS on email_clicks — admin-only reads, no direct writes (service role
--    bypasses RLS; all writes happen via the trigger below)
-- ---------------------------------------------------------------------------
ALTER TABLE email_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email clicks"
  ON email_clicks FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "No direct inserts by users" ON email_clicks FOR INSERT WITH CHECK (false);
CREATE POLICY "No direct updates by users" ON email_clicks FOR UPDATE USING (false);
CREATE POLICY "No direct deletes by users" ON email_clicks FOR DELETE USING (false);

-- ---------------------------------------------------------------------------
-- 3. Trigger: on email_events insert, if event is 'email.clicked', extract
--    click metadata from the raw_payload into email_clicks.
--    All three metadata fields (link / userAgent / ipAddress) may be missing
--    from any given payload — tolerate nulls gracefully.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION extract_email_click_from_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clicked_url text;
  v_user_agent  text;
  v_ip_address  text;
  v_recipient   text;
BEGIN
  IF NEW.event_type <> 'email.clicked' THEN
    RETURN NEW;
  END IF;

  v_clicked_url := NEW.raw_payload #>> '{data,click,link}';
  v_user_agent  := NEW.raw_payload #>> '{data,click,userAgent}';
  v_ip_address  := NEW.raw_payload #>> '{data,click,ipAddress}';

  -- Prefer event.recipient_email; fall back to the first entry in data.to
  IF NEW.recipient_email IS NOT NULL THEN
    v_recipient := NEW.recipient_email;
  ELSIF NEW.raw_payload #> '{data,to}' IS NOT NULL THEN
    v_recipient := (NEW.raw_payload #> '{data,to}' ->> 0);
  ELSE
    v_recipient := '';
  END IF;

  INSERT INTO email_clicks (
    email_event_id,
    resend_message_id,
    recipient_email,
    clicked_url,
    user_agent,
    ip_address,
    occurred_at
  ) VALUES (
    NEW.id,
    NEW.resend_message_id,
    v_recipient,
    v_clicked_url,
    v_user_agent,
    v_ip_address,
    NEW.occurred_at
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_events_extract_click ON email_events;
CREATE TRIGGER email_events_extract_click
  AFTER INSERT ON email_events
  FOR EACH ROW EXECUTE FUNCTION extract_email_click_from_event();

-- ---------------------------------------------------------------------------
-- 4. Denorm columns on crm_coaches for "latest email event" lookups.
--    email_status already exists (added in 20260313000000_crm_enhancements.sql)
--    with CHECK (email_status IN ('valid','bounced','complained','unknown')).
-- ---------------------------------------------------------------------------
ALTER TABLE crm_coaches
  ADD COLUMN IF NOT EXISTS last_email_event_type text;

ALTER TABLE crm_coaches
  ADD COLUMN IF NOT EXISTS last_email_event_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_crm_coaches_last_email_event_at
  ON crm_coaches (last_email_event_at DESC)
  WHERE last_email_event_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Trigger: on email_events insert, if the event is linked to a CRM contact
--    log, advance crm_coaches.last_email_event_{type,at} monotonically.
--    The >= guard prevents out-of-order backfill events from clobbering newer
--    real-time events. event_type is stored here WITHOUT the 'email.' prefix
--    to match the documented shape ('sent','delivered','opened', etc.).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_coach_last_email_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id        uuid;
  v_normalized_type text;
BEGIN
  IF NEW.contact_log_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coach_id INTO v_coach_id
    FROM crm_contact_log
   WHERE id = NEW.contact_log_id;

  IF v_coach_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Strip the 'email.' prefix for the denorm column so downstream
  -- consumers see a clean value like 'opened' instead of 'email.opened'.
  IF NEW.event_type LIKE 'email.%' THEN
    v_normalized_type := substring(NEW.event_type FROM 7);
  ELSE
    v_normalized_type := NEW.event_type;
  END IF;

  UPDATE crm_coaches
     SET last_email_event_type = v_normalized_type,
         last_email_event_at   = NEW.occurred_at,
         updated_at            = now()
   WHERE id = v_coach_id
     AND (last_email_event_at IS NULL OR NEW.occurred_at >= last_email_event_at);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_events_sync_coach ON email_events;
CREATE TRIGGER email_events_sync_coach
  AFTER INSERT ON email_events
  FOR EACH ROW EXECUTE FUNCTION sync_coach_last_email_event();

-- ---------------------------------------------------------------------------
-- 6. Backfill email_clicks from existing email_events rows.
--    Idempotent: skip any rows that already have an email_clicks entry.
-- ---------------------------------------------------------------------------
INSERT INTO email_clicks (
  email_event_id,
  resend_message_id,
  recipient_email,
  clicked_url,
  user_agent,
  ip_address,
  occurred_at
)
SELECT
  ev.id,
  ev.resend_message_id,
  COALESCE(
    ev.recipient_email,
    ev.raw_payload #> '{data,to}' ->> 0,
    ''
  ),
  ev.raw_payload #>> '{data,click,link}',
  ev.raw_payload #>> '{data,click,userAgent}',
  ev.raw_payload #>> '{data,click,ipAddress}',
  ev.occurred_at
FROM email_events ev
WHERE ev.event_type = 'email.clicked'
  AND NOT EXISTS (
    SELECT 1 FROM email_clicks ec WHERE ec.email_event_id = ev.id
  );

-- ---------------------------------------------------------------------------
-- 7. Backfill crm_coaches.last_email_event_{type,at} from the latest linked
--    event per coach via the contact_log bridge. Only updates rows where the
--    incoming event is actually newer than (or ties) the current stored value.
-- ---------------------------------------------------------------------------
WITH latest_per_coach AS (
  SELECT
    cl.coach_id,
    (array_agg(ev.event_type  ORDER BY ev.occurred_at DESC))[1] AS last_event_type,
    max(ev.occurred_at)                                          AS last_event_at
  FROM email_events ev
  JOIN crm_contact_log cl ON cl.id = ev.contact_log_id
  WHERE cl.coach_id IS NOT NULL
  GROUP BY cl.coach_id
)
UPDATE crm_coaches c
   SET last_email_event_type = CASE
         WHEN l.last_event_type LIKE 'email.%' THEN substring(l.last_event_type FROM 7)
         ELSE l.last_event_type
       END,
       last_email_event_at   = l.last_event_at,
       updated_at            = now()
  FROM latest_per_coach l
 WHERE c.id = l.coach_id
   AND (c.last_email_event_at IS NULL OR l.last_event_at >= c.last_email_event_at);

-- ---------------------------------------------------------------------------
-- 8. Realtime: add email_clicks to the Supabase Realtime publication so the
--    dashboard can subscribe to new click rows, matching the email_events
--    pattern from 20260420000000.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'email_clicks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE email_clicks;
  END IF;
END $$;

COMMENT ON TABLE email_clicks IS 'Per-click telemetry (URL, UA, IP) extracted from email.clicked webhook events.';
COMMENT ON COLUMN crm_coaches.last_email_event_type IS 'Latest Resend event type for this coach (sent|delivered|delivery_delayed|opened|clicked|bounced|complained), stripped of the email. prefix. Maintained by trigger on email_events.';
COMMENT ON COLUMN crm_coaches.last_email_event_at IS 'Timestamp of the latest Resend webhook event linked to this coach. Maintained by trigger on email_events.';
