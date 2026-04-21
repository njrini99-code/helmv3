-- ============================================================================
-- Resend Activity Mirror
--   Purpose: capture EVERY email sent through Resend (not just CRM outreach)
--   and present a live dashboard that mirrors https://resend.com/emails
--
--   Changes:
--     1. Rename crm_email_events -> email_events (broader scope)
--     2. Create back-compat view crm_email_events for any stale references
--     3. Create new `emails` snapshot table (one row per Resend message_id)
--     4. Trigger: on email_events INSERT, auto-upsert the emails snapshot
--     5. RPC: get_resend_activity_stats(window) for the KPI cards
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Rename crm_email_events -> email_events (preserves data, constraints, RLS)
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS crm_email_events RENAME TO email_events;

-- Rename associated indexes to match new table name
ALTER INDEX IF EXISTS idx_crm_email_events_contact RENAME TO idx_email_events_contact;
ALTER INDEX IF EXISTS idx_crm_email_events_msg     RENAME TO idx_email_events_msg;
ALTER INDEX IF EXISTS idx_crm_email_events_type    RENAME TO idx_email_events_type;
ALTER INDEX IF EXISTS crm_email_events_dedup       RENAME TO email_events_dedup;

-- Useful additional indexes for the new dashboard
CREATE INDEX IF NOT EXISTS idx_email_events_occurred_at
  ON email_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_events_type_occurred
  ON email_events (event_type, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Back-compat view so any code still referencing crm_email_events works
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW crm_email_events AS
  SELECT * FROM email_events;

-- RPC compatibility: keep get_crm_email_stats() pointing at the renamed table
CREATE OR REPLACE FUNCTION get_crm_email_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'total_sent', (SELECT count(*) FROM crm_contact_log WHERE resend_message_id IS NOT NULL),
      'delivered',  (SELECT count(DISTINCT resend_message_id) FROM email_events WHERE event_type = 'email.delivered'),
      'opened',     (SELECT count(DISTINCT resend_message_id) FROM email_events WHERE event_type = 'email.opened'),
      'clicked',    (SELECT count(DISTINCT resend_message_id) FROM email_events WHERE event_type = 'email.clicked'),
      'bounced',    (SELECT count(DISTINCT resend_message_id) FROM email_events WHERE event_type = 'email.bounced'),
      'complained', (SELECT count(DISTINCT resend_message_id) FROM email_events WHERE event_type = 'email.complained')
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. New `emails` snapshot table (one row per resend_message_id)
--    Populated by the webhook. This is the "fast path" for list views, search,
--    and filtering — avoids scanning the full event log.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emails (
  resend_message_id   text PRIMARY KEY,

  -- Message content (captured from email.sent event)
  from_address        text,
  to_addresses        text[] NOT NULL DEFAULT '{}',
  subject             text,
  tags                jsonb,

  -- Cross-reference back to CRM contact log if this was a CRM outreach email
  contact_log_id      uuid REFERENCES crm_contact_log(id) ON DELETE SET NULL,

  -- Source classification: 'crm' | 'transactional' | 'unknown'
  -- Denormalized so we can filter quickly without joins.
  source              text NOT NULL DEFAULT 'unknown',

  -- Status timestamps — null means that event hasn't happened
  sent_at             timestamptz,
  delivered_at        timestamptz,
  delivery_delayed_at timestamptz,
  opened_at           timestamptz,
  clicked_at          timestamptz,
  bounced_at          timestamptz,
  complained_at       timestamptz,

  -- Derived convenience columns for the dashboard
  last_event_type     text,
  last_event_at       timestamptz,

  -- Counters (an email can be opened/clicked multiple times)
  open_count          integer NOT NULL DEFAULT 0,
  click_count         integer NOT NULL DEFAULT 0,

  -- Bookkeeping
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_emails_last_event_at
  ON emails (last_event_at DESC);

CREATE INDEX IF NOT EXISTS idx_emails_sent_at
  ON emails (sent_at DESC) WHERE sent_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emails_to_gin
  ON emails USING GIN (to_addresses);

-- Trigram extension must be enabled BEFORE the index that uses gin_trgm_ops.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_emails_subject_trgm
  ON emails USING GIN (subject gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_emails_source
  ON emails (source);

CREATE INDEX IF NOT EXISTS idx_emails_contact_log
  ON emails (contact_log_id) WHERE contact_log_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. RLS on the new snapshot table
-- ---------------------------------------------------------------------------
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view emails"
  ON emails FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Writes only via service role (webhook) — blocked for regular users.
CREATE POLICY "No direct inserts by users" ON emails FOR INSERT WITH CHECK (false);
CREATE POLICY "No direct updates by users" ON emails FOR UPDATE USING (false);
CREATE POLICY "No direct deletes by users" ON emails FOR DELETE USING (false);

-- ---------------------------------------------------------------------------
-- 5. Trigger: on email_events insert, upsert the emails snapshot
--    Priority order for "current status": complained > bounced > clicked >
--    opened > delivery_delayed > delivered > sent
--    (later events override earlier ones in the last_event fields)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_email_snapshot_from_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from       text;
  v_to         text[];
  v_subject    text;
  v_tags       jsonb;
  v_source     text;
  v_recipient  text;
BEGIN
  -- Pull message fields from the raw payload (if present)
  v_from    := NEW.raw_payload #>> '{data,from}';
  v_subject := NEW.raw_payload #>> '{data,subject}';
  v_tags    := NEW.raw_payload -> 'data' -> 'tags';

  -- Resend sends `to` as a JSON array of strings. Fall back to recipient_email.
  IF NEW.raw_payload #> '{data,to}' IS NOT NULL THEN
    SELECT array_agg(value::text) INTO v_to
      FROM jsonb_array_elements_text(NEW.raw_payload #> '{data,to}');
  ELSIF NEW.recipient_email IS NOT NULL THEN
    v_to := ARRAY[NEW.recipient_email];
  ELSE
    v_to := '{}';
  END IF;

  -- Classify source by whether it links to a CRM contact log
  IF NEW.contact_log_id IS NOT NULL THEN
    v_source := 'crm';
  ELSE
    v_source := 'transactional';
  END IF;

  INSERT INTO emails AS e (
    resend_message_id,
    from_address,
    to_addresses,
    subject,
    tags,
    contact_log_id,
    source,
    sent_at,
    delivered_at,
    delivery_delayed_at,
    opened_at,
    clicked_at,
    bounced_at,
    complained_at,
    last_event_type,
    last_event_at,
    open_count,
    click_count,
    first_seen_at,
    updated_at
  ) VALUES (
    NEW.resend_message_id,
    v_from,
    v_to,
    v_subject,
    v_tags,
    NEW.contact_log_id,
    v_source,
    CASE WHEN NEW.event_type = 'email.sent'              THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.delivered'         THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.delivery_delayed'  THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.opened'            THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.clicked'           THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.bounced'           THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.complained'        THEN NEW.occurred_at END,
    NEW.event_type,
    NEW.occurred_at,
    CASE WHEN NEW.event_type = 'email.opened'  THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type = 'email.clicked' THEN 1 ELSE 0 END,
    NEW.occurred_at,
    now()
  )
  ON CONFLICT (resend_message_id) DO UPDATE SET
    -- Only fill content fields if currently null (email.sent usually arrives first)
    from_address       = COALESCE(e.from_address, EXCLUDED.from_address),
    to_addresses       = CASE WHEN e.to_addresses = '{}'::text[] THEN EXCLUDED.to_addresses ELSE e.to_addresses END,
    subject            = COALESCE(e.subject, EXCLUDED.subject),
    tags               = COALESCE(e.tags, EXCLUDED.tags),
    contact_log_id     = COALESCE(e.contact_log_id, EXCLUDED.contact_log_id),
    source             = CASE WHEN e.source = 'unknown' THEN EXCLUDED.source ELSE e.source END,

    -- Status timestamps: take earliest per event type
    sent_at             = LEAST(e.sent_at,             EXCLUDED.sent_at),
    delivered_at        = LEAST(e.delivered_at,        EXCLUDED.delivered_at),
    delivery_delayed_at = LEAST(e.delivery_delayed_at, EXCLUDED.delivery_delayed_at),
    opened_at           = LEAST(e.opened_at,           EXCLUDED.opened_at),
    clicked_at          = LEAST(e.clicked_at,          EXCLUDED.clicked_at),
    bounced_at          = LEAST(e.bounced_at,          EXCLUDED.bounced_at),
    complained_at       = LEAST(e.complained_at,       EXCLUDED.complained_at),

    -- Latest event wins for last_event_*
    last_event_type = CASE WHEN EXCLUDED.last_event_at > COALESCE(e.last_event_at, 'epoch'::timestamptz)
                           THEN EXCLUDED.last_event_type ELSE e.last_event_type END,
    last_event_at   = GREATEST(e.last_event_at, EXCLUDED.last_event_at),

    open_count  = e.open_count  + CASE WHEN NEW.event_type = 'email.opened'  THEN 1 ELSE 0 END,
    click_count = e.click_count + CASE WHEN NEW.event_type = 'email.clicked' THEN 1 ELSE 0 END,

    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_events_sync_snapshot ON email_events;
CREATE TRIGGER email_events_sync_snapshot
  AFTER INSERT ON email_events
  FOR EACH ROW EXECUTE FUNCTION sync_email_snapshot_from_event();

-- ---------------------------------------------------------------------------
-- 6. Backfill existing email_events into the new emails snapshot
--    Idempotent — safe to re-run.
-- ---------------------------------------------------------------------------
INSERT INTO emails (
  resend_message_id,
  from_address,
  to_addresses,
  subject,
  tags,
  contact_log_id,
  source,
  sent_at,
  delivered_at,
  delivery_delayed_at,
  opened_at,
  clicked_at,
  bounced_at,
  complained_at,
  last_event_type,
  last_event_at,
  open_count,
  click_count,
  first_seen_at,
  updated_at
)
SELECT
  ev.resend_message_id,
  max(ev.raw_payload #>> '{data,from}'),
  COALESCE(
    (
      SELECT array_agg(DISTINCT value::text)
      FROM email_events ev2,
           jsonb_array_elements_text(ev2.raw_payload #> '{data,to}') value
      WHERE ev2.resend_message_id = ev.resend_message_id
    ),
    ARRAY[max(ev.recipient_email)]::text[]
  ),
  max(ev.raw_payload #>> '{data,subject}'),
  (array_agg(ev.raw_payload -> 'data' -> 'tags') FILTER (WHERE ev.raw_payload -> 'data' -> 'tags' IS NOT NULL))[1],
  -- max() has no aggregate on uuid; pull any non-null contact_log_id via array_agg
  (array_agg(ev.contact_log_id) FILTER (WHERE ev.contact_log_id IS NOT NULL))[1],
  CASE WHEN (array_agg(ev.contact_log_id) FILTER (WHERE ev.contact_log_id IS NOT NULL))[1] IS NOT NULL
       THEN 'crm' ELSE 'transactional' END,
  min(ev.occurred_at) FILTER (WHERE ev.event_type = 'email.sent'),
  min(ev.occurred_at) FILTER (WHERE ev.event_type = 'email.delivered'),
  min(ev.occurred_at) FILTER (WHERE ev.event_type = 'email.delivery_delayed'),
  min(ev.occurred_at) FILTER (WHERE ev.event_type = 'email.opened'),
  min(ev.occurred_at) FILTER (WHERE ev.event_type = 'email.clicked'),
  min(ev.occurred_at) FILTER (WHERE ev.event_type = 'email.bounced'),
  min(ev.occurred_at) FILTER (WHERE ev.event_type = 'email.complained'),
  (array_agg(ev.event_type ORDER BY ev.occurred_at DESC))[1],
  max(ev.occurred_at),
  count(*) FILTER (WHERE ev.event_type = 'email.opened'),
  count(*) FILTER (WHERE ev.event_type = 'email.clicked'),
  min(ev.created_at),
  now()
FROM email_events ev
GROUP BY ev.resend_message_id
ON CONFLICT (resend_message_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Aggregate stats RPC for the new dashboard
--    Accepts a time window: '24h', '7d', '30d', 'all'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_resend_activity_stats(p_window text DEFAULT '7d')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_since := CASE p_window
    WHEN '24h' THEN now() - interval '24 hours'
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    ELSE 'epoch'::timestamptz
  END;

  SELECT jsonb_build_object(
    'window', p_window,
    'since',  v_since,

    'total',     count(*),
    'sent',      count(*) FILTER (WHERE sent_at IS NOT NULL),
    'delivered', count(*) FILTER (WHERE delivered_at IS NOT NULL),
    'opened',    count(*) FILTER (WHERE opened_at IS NOT NULL),
    'clicked',   count(*) FILTER (WHERE clicked_at IS NOT NULL),
    'bounced',   count(*) FILTER (WHERE bounced_at IS NOT NULL),
    'complained',count(*) FILTER (WHERE complained_at IS NOT NULL),
    'pending',   count(*) FILTER (WHERE sent_at IS NOT NULL AND delivered_at IS NULL AND bounced_at IS NULL),

    'open_count',  coalesce(sum(open_count), 0),
    'click_count', coalesce(sum(click_count), 0),

    'by_source', (
      SELECT jsonb_object_agg(source, cnt) FROM (
        SELECT source, count(*) AS cnt FROM emails
        WHERE (sent_at >= v_since OR first_seen_at >= v_since)
        GROUP BY source
      ) s
    ),
    'by_day', (
      SELECT jsonb_agg(jsonb_build_object(
        'day',       day,
        'sent',      sent,
        'delivered', delivered,
        'opened',    opened,
        'clicked',   clicked,
        'bounced',   bounced
      ) ORDER BY day)
      FROM (
        SELECT
          date_trunc('day', coalesce(sent_at, first_seen_at))::date AS day,
          count(*) FILTER (WHERE sent_at IS NOT NULL)      AS sent,
          count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
          count(*) FILTER (WHERE opened_at IS NOT NULL)    AS opened,
          count(*) FILTER (WHERE clicked_at IS NOT NULL)   AS clicked,
          count(*) FILTER (WHERE bounced_at IS NOT NULL)   AS bounced
        FROM emails
        WHERE (sent_at >= v_since OR first_seen_at >= v_since)
        GROUP BY day
      ) d
    )
  )
  INTO v_result
  FROM emails
  WHERE (sent_at >= v_since OR first_seen_at >= v_since);

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_resend_activity_stats(text) FROM public, anon;

-- ---------------------------------------------------------------------------
-- 8. Per-domain breakdown RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_resend_domain_breakdown(p_window text DEFAULT '30d')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_since := CASE p_window
    WHEN '24h' THEN now() - interval '24 hours'
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    ELSE 'epoch'::timestamptz
  END;

  RETURN (
    SELECT jsonb_agg(row_to_json(d) ORDER BY d.total DESC)
    FROM (
      SELECT
        split_part(lower(addr), '@', 2) AS domain,
        count(*)                                           AS total,
        count(*) FILTER (WHERE delivered_at IS NOT NULL)   AS delivered,
        count(*) FILTER (WHERE opened_at IS NOT NULL)      AS opened,
        count(*) FILTER (WHERE clicked_at IS NOT NULL)     AS clicked,
        count(*) FILTER (WHERE bounced_at IS NOT NULL)     AS bounced
      FROM emails, unnest(to_addresses) AS addr
      WHERE (sent_at >= v_since OR first_seen_at >= v_since)
        AND addr IS NOT NULL
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 25
    ) d
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_resend_domain_breakdown(text) FROM public, anon;

-- ---------------------------------------------------------------------------
-- 9. Realtime: enable publication on both tables so the dashboard can subscribe
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'emails'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE emails;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'email_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE email_events;
  END IF;
END $$;

COMMENT ON TABLE emails IS 'Per-message snapshot for all Resend emails (mirrors resend.com/emails).';
COMMENT ON TABLE email_events IS 'Immutable event log for all Resend webhook events. Renamed from crm_email_events (view kept for back-compat).';
