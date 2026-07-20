-- ============================================================================
-- CRM Insights RPC fixes (2026-07-19 wiring audit, "insights" package)
-- ----------------------------------------------------------------------------
-- Three independent, additive CREATE OR REPLACE fixes. Idempotent; safe on
-- live prod. NOT applied here — the integrator applies this migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) get_resend_activity_stats: add a native '90d' window.
-- ----------------------------------------------------------------------------
-- The insights dashboard's window vocabulary ('7d' | '30d' | '90d') was
-- being aliased in the TS action layer to this RPC's unbounded 'all' window
-- (its v_since CASE had no '90d' branch, falling through to ELSE
-- 'epoch'::timestamptz), while every sibling insights RPC
-- (get_crm_template_performance, get_crm_time_to_open,
-- get_crm_click_destinations) genuinely bounds '90d' to
-- now() - interval '90 days'. Selecting the '90d' tab therefore showed
-- all-time KPI totals next to a true trailing-90-day chart/heatmap/table.
-- Adding the native branch here lets the action layer pass '90d' straight
-- through instead of aliasing it away.
--
-- Also fixes a second, independent mismatch: the 'pending' count included
-- rows with delivery_delayed_at set, while the per-row status badges
-- (deriveStatus() in the Resend Activity UI) label those same rows
-- "Delayed" — checking delivery_delayed_at before falling back to pending.
-- Adding `AND delivery_delayed_at IS NULL` aligns the aggregate KPI with the
-- per-row status shown right next to it.
CREATE OR REPLACE FUNCTION "public"."get_resend_activity_stats"("p_window" "text" DEFAULT '7d'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path TO 'public'
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
    WHEN '90d' THEN now() - interval '90 days'
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
    'pending',   count(*) FILTER (WHERE sent_at IS NOT NULL AND delivered_at IS NULL AND bounced_at IS NULL AND delivery_delayed_at IS NULL),

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

-- ----------------------------------------------------------------------------
-- (2) get_crm_template_performance: prefer metadata->>'template_id' join.
-- ----------------------------------------------------------------------------
-- The template_logs CTE attributed crm_contact_log rows to templates purely
-- by cl.subject = t.subject text equality, never consulting
-- crm_contact_log.metadata->>'template_id', which the Gmail-direct-send
-- pipeline already populates with the real FK (see
-- 20260617180000_crm_contact_log_metadata.sql). Subject-only matching drops
-- or misattributes history whenever a template's subject is edited after
-- being sent, or two templates share identical subject text. Prefer the
-- metadata FK when present; fall back to subject-equality only when it's
-- null (older rows sent before the metadata column existed).
CREATE OR REPLACE FUNCTION "public"."get_crm_template_performance"("p_window" "text" DEFAULT '30d'::"text") RETURNS TABLE("template_id" "uuid", "template_name" "text", "sent_count" integer, "delivered_count" integer, "opened_count" integer, "clicked_count" integer, "bounced_count" integer, "open_rate" numeric, "click_rate" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH window_days AS (
    SELECT (CASE p_window WHEN '7d' THEN now() - interval '7 days' WHEN '30d' THEN now() - interval '30 days' WHEN '90d' THEN now() - interval '90 days' ELSE now() - interval '30 days' END) AS since
  ),
  template_logs AS (
    SELECT t.id AS template_id, t.name AS template_name, cl.id AS contact_log_id
    FROM crm_email_templates t
    JOIN crm_contact_log cl
      ON (cl.metadata->>'template_id' = t.id::text)
      OR (cl.metadata->>'template_id' IS NULL AND cl.subject = t.subject)
    WHERE cl.contact_date >= (SELECT since FROM window_days) AND cl.contact_type = 'email'
  )
  SELECT tl.template_id, tl.template_name,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events ee WHERE ee.contact_log_id = tl.contact_log_id AND ee.event_type = 'email.delivered'))::int,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events ee WHERE ee.contact_log_id = tl.contact_log_id AND ee.event_type = 'email.opened'))::int,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events ee WHERE ee.contact_log_id = tl.contact_log_id AND ee.event_type = 'email.clicked'))::int,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events ee WHERE ee.contact_log_id = tl.contact_log_id AND ee.event_type = 'email.bounced'))::int,
    NULL::numeric, NULL::numeric
  FROM template_logs tl GROUP BY tl.template_id, tl.template_name ORDER BY 3 DESC;
$$;
