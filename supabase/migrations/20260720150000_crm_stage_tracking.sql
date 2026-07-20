-- ============================================================================
-- CRM visibility & tracking foundation (2026-07-20)
-- ----------------------------------------------------------------------------
-- 1) crm_stage_transitions — immutable stage-change history for crm_coaches,
--    captured by trigger. Status writes happen client-side in at least five
--    code paths (page.tsx updateCoach/bulkUpdateCoaches, send-email route,
--    crm-gmail-send, crm-dedup), so the DB trigger is the only hook that
--    catches them all. Statuses stored as text to stay decoupled from the
--    enum's future values.
-- 2) Seed: one baseline row per coach (source='seed', from_status NULL) using
--    COALESCE(last_contacted_at, updated_at, created_at) as the best-known
--    "in stage since" — approximate by design; real precision starts now.
-- 3) RPCs (all SECURITY DEFINER + admin-gated + pinned search_path):
--    get_crm_weekly_kpis, get_crm_funnel, get_crm_stage_ages,
--    get_crm_coach_stage_history.
-- Additive only; safe on live prod.
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_stage_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES crm_coaches(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  source text NOT NULL DEFAULT 'app'
);

CREATE INDEX IF NOT EXISTS idx_crm_stage_transitions_coach
  ON crm_stage_transitions (coach_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_stage_transitions_to_status
  ON crm_stage_transitions (to_status, changed_at DESC);

ALTER TABLE crm_stage_transitions ENABLE ROW LEVEL SECURITY;

-- Admin-only, like every other crm_* table. Writes come exclusively from the
-- SECURITY DEFINER trigger below, so no INSERT policy for clients at all.
DROP POLICY IF EXISTS crm_stage_transitions_admin_read ON crm_stage_transitions;
CREATE POLICY crm_stage_transitions_admin_read ON crm_stage_transitions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

REVOKE ALL ON crm_stage_transitions FROM anon;
GRANT SELECT ON crm_stage_transitions TO authenticated;

-- ----------------------------------------------------------------------------
-- Trigger: log every status change, whatever code path performed it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_crm_stage_transition() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO crm_stage_transitions (coach_id, from_status, to_status, changed_by, source)
    VALUES (NEW.id, OLD.status::text, NEW.status::text, auth.uid(), 'app');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_stage_transition ON crm_coaches;
CREATE TRIGGER trg_crm_stage_transition
  AFTER UPDATE OF status ON crm_coaches
  FOR EACH ROW EXECUTE FUNCTION log_crm_stage_transition();

-- ----------------------------------------------------------------------------
-- Seed baseline (idempotent: only when a coach has no transition rows yet).
-- ----------------------------------------------------------------------------
INSERT INTO crm_stage_transitions (coach_id, from_status, to_status, changed_at, source)
SELECT c.id, NULL, c.status::text,
       COALESCE(c.last_contacted_at, c.updated_at, c.created_at, now()), 'seed'
FROM crm_coaches c
WHERE NOT EXISTS (SELECT 1 FROM crm_stage_transitions t WHERE t.coach_id = c.id);

-- ----------------------------------------------------------------------------
-- RPC: weekly outreach + movement KPIs, last p_weeks ISO weeks (ascending).
-- sent/calls come from crm_contact_log (canonical send log — Gmail direct,
-- bulk Resend, and sequences all stamp it); opened/clicked from email_events;
-- replied from crm_replies; stage_advances = forward transitions.
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
      SELECT count(*) FROM email_events ee
      WHERE ee.event_type = 'email.opened'
        AND ee.occurred_at >= w.week_start AND ee.occurred_at < w.week_start + 7
    ),
    'clicked', (
      SELECT count(*) FROM email_events ee
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
-- RPC: email outreach funnel for a window. Event counts + distinct coaches
-- reached at each step (coach linkage via contact_log -> email_events).
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
      SELECT count(*) FROM email_events ee
      WHERE ee.event_type = 'email.delivered' AND ee.occurred_at >= v_since
    ),
    'opened', (
      SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
      WHERE ee.event_type = 'email.opened' AND ee.occurred_at >= v_since
    ),
    'clicked', (
      SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
      WHERE ee.event_type = 'email.clicked' AND ee.occurred_at >= v_since
    ),
    'replied', (
      SELECT count(*) FROM crm_replies r WHERE r.received_at >= v_since
    ),
    'coaches_emailed', (
      SELECT count(DISTINCT cl.coach_id) FROM crm_contact_log cl
      WHERE cl.contact_type = 'email' AND cl.contact_date >= v_since
    ),
    'coaches_opened', (
      SELECT count(DISTINCT cl.coach_id) FROM crm_contact_log cl
      JOIN email_events ee ON ee.contact_log_id = cl.id
      WHERE ee.event_type = 'email.opened' AND ee.occurred_at >= v_since
    ),
    'coaches_clicked', (
      SELECT count(DISTINCT cl.coach_id) FROM crm_contact_log cl
      JOIN email_events ee ON ee.contact_log_id = cl.id
      WHERE ee.event_type = 'email.clicked' AND ee.occurred_at >= v_since
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

-- ----------------------------------------------------------------------------
-- RPC: latest stage-entry timestamp per coach (for days-in-stage UI).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_crm_stage_ages()
    RETURNS TABLE(coach_id uuid, stage_since timestamptz, is_seed boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT DISTINCT ON (t.coach_id)
    t.coach_id, t.changed_at AS stage_since, (t.source = 'seed') AS is_seed
  FROM crm_stage_transitions t
  WHERE EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  ORDER BY t.coach_id, t.changed_at DESC;
$$;

-- ----------------------------------------------------------------------------
-- RPC: full stage history for one coach (detail panel).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_crm_coach_stage_history(p_coach_id uuid)
    RETURNS TABLE(from_status text, to_status text, changed_at timestamptz, source text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT t.from_status, t.to_status, t.changed_at, t.source
  FROM crm_stage_transitions t
  WHERE t.coach_id = p_coach_id
    AND EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  ORDER BY t.changed_at DESC;
$$;

-- Lock the RPCs down: no anon execution (matview/RPC anon-grant drift is a
-- known failure mode in this project — REVOKE explicitly, verify in review).
REVOKE ALL ON FUNCTION get_crm_weekly_kpis(integer) FROM anon, public;
REVOKE ALL ON FUNCTION get_crm_funnel(text) FROM anon, public;
REVOKE ALL ON FUNCTION get_crm_stage_ages() FROM anon, public;
REVOKE ALL ON FUNCTION get_crm_coach_stage_history(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_crm_weekly_kpis(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_crm_funnel(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_crm_stage_ages() TO authenticated;
GRANT EXECUTE ON FUNCTION get_crm_coach_stage_history(uuid) TO authenticated;
