-- =============================================================================
-- Phase 1 — Stream B — Coach Engagement Materialized View
-- =============================================================================
-- Computes a Hot/Warm/Cold temperature per coach from the last 90 days of
-- email_events (opens + clicks), weighted by exponential decay with a 14-day
-- half-life. Refreshed every 5 minutes via Vercel Cron
-- (/api/cron/refresh-engagement -> RPC refresh_crm_coach_engagement).
--
-- Score formula: round((open_score * 1.0 + click_score * 3.0) * 10), clamped
-- to [0,100]. Temperature thresholds: hot if click_score > 0.5 OR
-- open_score > 2; warm if open_score > 0.5; else cold.
--
-- Access pattern: server actions read the view via the service-role client
-- (bypassing RLS) and enforce admin role at the action layer. The MV is
-- additionally locked down by REVOKE PUBLIC + GRANT SELECT to authenticated.
-- =============================================================================

CREATE MATERIALIZED VIEW crm_coach_engagement AS
WITH windowed AS (
  SELECT cl.coach_id, ee.event_type, ee.occurred_at,
    exp(-extract(epoch from (now() - ee.occurred_at)) / (14 * 86400.0)) AS decay
  FROM email_events ee
  JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
  WHERE ee.occurred_at > now() - interval '90 days'
),
agg AS (
  SELECT coach_id,
    COALESCE(SUM(decay) FILTER (WHERE event_type = 'email.opened'),  0) AS open_score,
    COALESCE(SUM(decay) FILTER (WHERE event_type = 'email.clicked'), 0) AS click_score,
    COUNT(*) FILTER (WHERE event_type = 'email.opened')  AS opens_90d,
    COUNT(*) FILTER (WHERE event_type = 'email.clicked') AS clicks_90d,
    MAX(occurred_at) AS last_event_at
  FROM windowed GROUP BY coach_id
)
SELECT c.id AS coach_id,
  COALESCE(a.opens_90d, 0)  AS opens_90d,
  COALESCE(a.clicks_90d, 0) AS clicks_90d,
  a.last_event_at,
  LEAST(100, GREATEST(0, ROUND((COALESCE(a.open_score,0) * 1.0 + COALESCE(a.click_score,0) * 3.0) * 10)))::int AS score,
  CASE
    WHEN COALESCE(a.click_score,0) > 0.5 OR COALESCE(a.open_score,0) > 2 THEN 'hot'
    WHEN COALESCE(a.open_score,0) > 0.5                                   THEN 'warm'
    ELSE 'cold'
  END AS temperature
FROM crm_coaches c
LEFT JOIN agg a ON a.coach_id = c.id
WHERE c.is_archived = false;

CREATE UNIQUE INDEX idx_crm_coach_engagement_pk ON crm_coach_engagement (coach_id);
CREATE INDEX idx_crm_coach_engagement_score ON crm_coach_engagement (score DESC);

CREATE OR REPLACE FUNCTION refresh_crm_coach_engagement()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_lock(7777);
  REFRESH MATERIALIZED VIEW CONCURRENTLY crm_coach_engagement;
  PERFORM pg_advisory_unlock(7777);
END; $$;
GRANT EXECUTE ON FUNCTION refresh_crm_coach_engagement() TO authenticated, service_role;

-- Materialized views inherit a permissive ACL by default. Lock down explicitly
-- (server actions read via service-role and enforce admin role at the action
-- layer; this REVOKE/GRANT prevents anonymous access from leaking the view).
REVOKE ALL ON crm_coach_engagement FROM PUBLIC;
GRANT SELECT ON crm_coach_engagement TO authenticated, service_role;
