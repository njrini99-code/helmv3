-- =============================================================================
-- Phase 3 — Stream P3-B — CRM Insights RPCs
-- =============================================================================
-- Three SECURITY DEFINER read-only RPCs powering the new Insights dashboard
-- (`/golf/admin/crm/insights`):
--
--   1. get_crm_template_performance(window) -> per-template send / open / click /
--      bounce counts (template resolved by joining contact_log.subject ==
--      crm_email_templates.subject — no FK exists yet).
--   2. get_crm_time_to_open(window) -> histogram buckets of seconds between an
--      email's `email.sent` and first `email.opened` event.
--   3. get_crm_click_destinations(window, limit) -> top N clicked URLs ordered
--      by total click count, with unique recipient counts.
--
-- All three are SECURITY DEFINER so they can read email_events / email_clicks
-- across the admin surface; the calling server actions in
-- src/app/golf/actions/crm-insights.ts gate by `users.role = 'admin'` first.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-template performance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_crm_template_performance(p_window text DEFAULT '30d')
RETURNS TABLE (
  template_id     uuid,
  template_name   text,
  sent_count      integer,
  delivered_count integer,
  opened_count    integer,
  clicked_count   integer,
  bounced_count   integer,
  open_rate       numeric,
  click_rate      numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH window_days AS (
    SELECT (CASE p_window
      WHEN '7d'  THEN now() - interval '7 days'
      WHEN '30d' THEN now() - interval '30 days'
      WHEN '90d' THEN now() - interval '90 days'
      ELSE         now() - interval '30 days'
    END) AS since
  ),
  -- The send pipeline doesn't currently store template_id on contact_log;
  -- we resolve it by matching the rendered subject string. Best-effort:
  -- templates whose subject was customized at send-time won't match.
  template_logs AS (
    SELECT
      t.id    AS template_id,
      t.name  AS template_name,
      cl.id   AS contact_log_id
    FROM crm_email_templates t
    JOIN crm_contact_log cl ON cl.subject = t.subject
    WHERE cl.contact_date >= (SELECT since FROM window_days)
      AND cl.contact_type = 'email'
  )
  SELECT
    tl.template_id,
    tl.template_name,
    COUNT(*)::int AS sent_count,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM email_events ee
        WHERE ee.contact_log_id = tl.contact_log_id
          AND ee.event_type = 'email.delivered'
      )
    )::int AS delivered_count,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM email_events ee
        WHERE ee.contact_log_id = tl.contact_log_id
          AND ee.event_type = 'email.opened'
      )
    )::int AS opened_count,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM email_events ee
        WHERE ee.contact_log_id = tl.contact_log_id
          AND ee.event_type = 'email.clicked'
      )
    )::int AS clicked_count,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM email_events ee
        WHERE ee.contact_log_id = tl.contact_log_id
          AND ee.event_type = 'email.bounced'
      )
    )::int AS bounced_count,
    -- Open / click rates are computed in TypeScript so we can divide by the
    -- delivered count (or sent count, whichever the UI prefers) without
    -- spreading SQL CASE-NULLIF arithmetic across two layers.
    NULL::numeric AS open_rate,
    NULL::numeric AS click_rate
  FROM template_logs tl
  GROUP BY tl.template_id, tl.template_name
  ORDER BY sent_count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_crm_template_performance(text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Time-to-open distribution (histogram buckets)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_crm_time_to_open(p_window text DEFAULT '30d')
RETURNS TABLE (
  bucket_min int,
  bucket_max int,
  count      int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH window_days AS (
    SELECT (CASE p_window
      WHEN '7d'  THEN now() - interval '7 days'
      WHEN '30d' THEN now() - interval '30 days'
      WHEN '90d' THEN now() - interval '90 days'
      ELSE         now() - interval '30 days'
    END) AS since
  ),
  paired AS (
    SELECT
      sent.contact_log_id,
      EXTRACT(EPOCH FROM (
        MIN(opened.occurred_at) - sent.occurred_at
      )) AS seconds_to_open
    FROM email_events sent
    JOIN email_events opened
      ON opened.contact_log_id = sent.contact_log_id
     AND opened.event_type = 'email.opened'
     AND opened.occurred_at > sent.occurred_at
    WHERE sent.event_type = 'email.sent'
      AND sent.occurred_at >= (SELECT since FROM window_days)
    GROUP BY sent.contact_log_id, sent.occurred_at
  ),
  bucketed AS (
    SELECT
      CASE
        WHEN seconds_to_open < 60     THEN '0-60'
        WHEN seconds_to_open < 600    THEN '60-600'
        WHEN seconds_to_open < 3600   THEN '600-3600'
        WHEN seconds_to_open < 14400  THEN '3600-14400'
        WHEN seconds_to_open < 86400  THEN '14400-86400'
        ELSE                               '86400+'
      END AS bucket
    FROM paired
  )
  SELECT
    (split_part(bucket, '-', 1))::int AS bucket_min,
    CASE
      WHEN bucket = '86400+' THEN 999999
      ELSE (split_part(bucket, '-', 2))::int
    END AS bucket_max,
    COUNT(*)::int AS count
  FROM bucketed
  GROUP BY bucket
  ORDER BY bucket_min;
$$;

GRANT EXECUTE ON FUNCTION get_crm_time_to_open(text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Click destinations heatmap
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_crm_click_destinations(
  p_window text DEFAULT '30d',
  p_limit  int  DEFAULT 25
)
RETURNS TABLE (
  clicked_url       text,
  click_count       int,
  unique_recipients int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH window_days AS (
    SELECT (CASE p_window
      WHEN '7d'  THEN now() - interval '7 days'
      WHEN '30d' THEN now() - interval '30 days'
      WHEN '90d' THEN now() - interval '90 days'
      ELSE         now() - interval '30 days'
    END) AS since
  )
  SELECT
    clicked_url,
    COUNT(*)::int AS click_count,
    COUNT(DISTINCT recipient_email)::int AS unique_recipients
  FROM email_clicks
  WHERE occurred_at >= (SELECT since FROM window_days)
    AND clicked_url IS NOT NULL
    AND clicked_url <> ''
  GROUP BY clicked_url
  ORDER BY click_count DESC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION get_crm_click_destinations(text, int)
  TO authenticated, service_role;
