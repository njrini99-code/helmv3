-- ============================================================================
-- CRM Insights metric alignment (2026-07-20)
-- ----------------------------------------------------------------------------
-- Two CREATE OR REPLACE fixes closing a metric-consistency gap between the
-- three CRM analytics RPCs added in 20260720150000_crm_stage_tracking.sql
-- (get_crm_weekly_kpis, get_crm_funnel) and the older
-- get_crm_time_to_open (20260704110000_crm_rpcs_admin_gate.sql). Additive
-- CREATE OR REPLACE only — same signatures, same return types, safe on live
-- prod. NOT applied here — the integrator applies this migration.
--
-- (1) get_crm_weekly_kpis: dedupe 'opened'/'clicked' per message.
-- ----------------------------------------------------------------------------
-- Before this fix, get_crm_weekly_kpis counted 'opened'/'clicked' as raw
-- `count(*)` over email_events — every open/click ping (a recipient
-- re-opening the same email counts as another webhook event) inflated the
-- number — while get_crm_funnel already deduped the same two metrics with
-- `count(DISTINCT ee.resend_message_id)` (one count per message, however
-- many times it was opened/clicked). The weekly trend and the funnel
-- disagreed on what "opened" means for the exact same underlying event
-- stream. Aligned to get_crm_funnel's distinct-message convention.
--
-- (2) get_crm_funnel: anchor delivered/opened/clicked on the send, not the
--     event.
-- ----------------------------------------------------------------------------
-- get_crm_time_to_open anchors its window on the SEND: it only pairs opens
-- to emails whose `email.sent` event occurred within the window
-- (`sent.occurred_at >= since`), then measures time-to-open from there —
-- i.e. it reports on a cohort of emails sent in the window, however long
-- their opens took to land.
--
-- get_crm_funnel's 'sent' metric already used this same cohort semantics
-- (`crm_contact_log.contact_date >= v_since`), but 'delivered'/'opened'/
-- 'clicked' did not: they filtered on the *event's own* `occurred_at`,
-- independent of when the underlying email was sent. That let an email
-- sent 95 days ago (outside a 90d window, not counted in 'sent') still
-- inflate 'opened' if it was opened 5 days ago (inside the window) — a
-- funnel where the numerator and denominator aren't drawn from the same
-- cohort, so "sent → opened" wasn't a real conversion rate.
--
-- Fixed by joining delivered/opened/clicked through crm_contact_log and
-- filtering on `cl.contact_date >= v_since` (the send date) instead of
-- `ee.occurred_at >= v_since` (the event date) — matching
-- get_crm_time_to_open's send-anchored cohort. coaches_opened/
-- coaches_clicked already joined to crm_contact_log for coach linkage;
-- they're switched to the same `cl.contact_date` filter for the same
-- reason. This mirrors get_crm_template_performance's existing
-- EXISTS(... ee.contact_log_id = tl.contact_log_id) pattern, so an
-- email_events row with no contact_log_id (never linked to an outbound
-- send) no longer counts toward the funnel — consistent with how
-- coaches_opened/coaches_clicked already required that link.
--
-- 'replied'/'coaches_replied' are deliberately left anchored on
-- crm_replies.received_at (received-in-window), not send date:
-- crm_replies.contact_log_id is nullable (not every reply resolves to a
-- specific outbound send via subject/thread matching), and "replies
-- received this window" is itself a meaningful, independently-useful
-- metric — same convention CRM inboxes use for a reply count. Rebasing it
-- would silently drop replies with no resolvable contact_log_id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) get_crm_weekly_kpis — dedupe opened/clicked per message.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_crm_weekly_kpis(p_weeks integer DEFAULT 8) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
  v_weeks integer := LEAST(GREATEST(COALESCE(p_weeks, 8), 1), 26);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH weeks AS (
    SELECT date_trunc('week', now())::date - (7 * gs) AS week_start
    FROM generate_series(v_weeks - 1, 0, -1) AS gs
  )
  SELECT jsonb_agg(jsonb_build_object(
    'week_start', w.week_start,
    'sent', (
      SELECT count(*) FROM crm_contact_log cl
      WHERE cl.contact_type = 'email'
        AND cl.contact_date >= w.week_start AND cl.contact_date < w.week_start + 7
    ),
    'calls', (
      SELECT count(*) FROM crm_contact_log cl
      WHERE cl.contact_type = 'call'
        AND cl.contact_date >= w.week_start AND cl.contact_date < w.week_start + 7
    ),
    'opened', (
      -- Deduped per message (matches get_crm_funnel) — was raw count(*),
      -- which double-counted repeat opens of the same email.
      SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
      WHERE ee.event_type = 'email.opened'
        AND ee.occurred_at >= w.week_start AND ee.occurred_at < w.week_start + 7
    ),
    'clicked', (
      -- Deduped per message (matches get_crm_funnel) — was raw count(*),
      -- which double-counted repeat clicks of the same email.
      SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
      WHERE ee.event_type = 'email.clicked'
        AND ee.occurred_at >= w.week_start AND ee.occurred_at < w.week_start + 7
    ),
    'replied', (
      SELECT count(*) FROM crm_replies r
      WHERE r.received_at >= w.week_start AND r.received_at < w.week_start + 7
    ),
    'stage_advances', (
      SELECT count(*) FROM crm_stage_transitions t
      WHERE t.source = 'app'
        AND t.to_status IN ('contacted', 'engaged', 'proposal', 'won')
        AND t.changed_at >= w.week_start AND t.changed_at < w.week_start + 7
    )
  ) ORDER BY w.week_start)
  INTO v_result
  FROM weeks w;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ----------------------------------------------------------------------------
-- (2) get_crm_funnel — anchor delivered/opened/clicked on the send date.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_crm_funnel(p_window text DEFAULT '30d') RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    ELSE now() - interval '30 days'
  END;

  SELECT jsonb_build_object(
    'window', p_window,
    'since', v_since,
    'sent', (
      SELECT count(*) FROM crm_contact_log cl
      WHERE cl.contact_type = 'email' AND cl.contact_date >= v_since
    ),
    'delivered', (
      -- Anchored on the send (cl.contact_date), not the delivery event's
      -- own occurred_at — matches get_crm_time_to_open's cohort semantics
      -- and keeps 'sent' and 'delivered' drawn from the same population.
      SELECT count(*) FROM email_events ee
      JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
      WHERE ee.event_type = 'email.delivered'
        AND cl.contact_type = 'email' AND cl.contact_date >= v_since
    ),
    'opened', (
      SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
      JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
      WHERE ee.event_type = 'email.opened'
        AND cl.contact_type = 'email' AND cl.contact_date >= v_since
    ),
    'clicked', (
      SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
      JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
      WHERE ee.event_type = 'email.clicked'
        AND cl.contact_type = 'email' AND cl.contact_date >= v_since
    ),
    'replied', (
      -- Deliberately NOT rebased to send date — see migration header.
      SELECT count(*) FROM crm_replies r WHERE r.received_at >= v_since
    ),
    'coaches_emailed', (
      SELECT count(DISTINCT cl.coach_id) FROM crm_contact_log cl
      WHERE cl.contact_type = 'email' AND cl.contact_date >= v_since
    ),
    'coaches_opened', (
      SELECT count(DISTINCT cl.coach_id) FROM crm_contact_log cl
      JOIN email_events ee ON ee.contact_log_id = cl.id
      WHERE ee.event_type = 'email.opened' AND cl.contact_date >= v_since
    ),
    'coaches_clicked', (
      SELECT count(DISTINCT cl.coach_id) FROM crm_contact_log cl
      JOIN email_events ee ON ee.contact_log_id = cl.id
      WHERE ee.event_type = 'email.clicked' AND cl.contact_date >= v_since
    ),
    'coaches_replied', (
      SELECT count(DISTINCT r.coach_id) FROM crm_replies r
      WHERE r.received_at >= v_since AND r.coach_id IS NOT NULL
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- Lock the RPCs down: no anon execution (matview/RPC anon-grant drift is a
-- known failure mode in this project — REVOKE explicitly, verify in review).
REVOKE ALL ON FUNCTION get_crm_weekly_kpis(integer) FROM anon, public;
REVOKE ALL ON FUNCTION get_crm_funnel(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_crm_weekly_kpis(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_crm_funnel(text) TO authenticated;
