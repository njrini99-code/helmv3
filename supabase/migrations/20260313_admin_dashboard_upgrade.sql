-- ============================================================================
-- Migration: 20260313_admin_dashboard_upgrade.sql
-- Purpose: Admin dashboard upgrade - new monitoring tables, RPC functions, RLS
-- Tables: api_call_logs, error_rate_hourly, auth_metrics_hourly,
--         background_job_logs, golf_platform_metrics_daily,
--         golf_tracer_health_snapshot
-- Functions: get_user_engagement_summary, get_team_health_dashboard,
--            get_onboarding_funnel_analysis, get_coach_effectiveness_metrics,
--            get_api_performance_summary, get_enhanced_system_health
-- ============================================================================

-- ============================================================================
-- 1. NEW TABLES
-- ============================================================================

-- API performance tracking (hourly aggregation)
CREATE TABLE IF NOT EXISTS api_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route TEXT NOT NULL,
  method TEXT DEFAULT 'POST',
  request_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  avg_duration_ms INT DEFAULT 0,
  p50_ms INT DEFAULT 0,
  p95_ms INT DEFAULT 0,
  p99_ms INT DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_call_logs_recorded ON api_call_logs(recorded_at DESC);

-- Error rate hourly tracking
CREATE TABLE IF NOT EXISTS error_rate_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hour TIMESTAMPTZ NOT NULL,
  total_errors INT DEFAULT 0,
  critical_errors INT DEFAULT 0,
  user_facing_errors INT DEFAULT 0,
  internal_errors INT DEFAULT 0,
  affected_users INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_rate_hour ON error_rate_hourly(hour DESC);

-- Auth metrics hourly
CREATE TABLE IF NOT EXISTS auth_metrics_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hour TIMESTAMPTZ NOT NULL,
  successful_logins INT DEFAULT 0,
  failed_logins INT DEFAULT 0,
  active_sessions INT DEFAULT 0,
  new_sessions INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_metrics_hour ON auth_metrics_hourly(hour DESC);

-- Background job tracking
CREATE TABLE IF NOT EXISTS background_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  job_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  duration_ms INT,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  metadata JSONB,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bg_jobs_type_started ON background_job_logs(job_type, started_at DESC);

-- Platform metrics daily snapshots
CREATE TABLE IF NOT EXISTS golf_platform_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,
  daily_active_users INT DEFAULT 0,
  weekly_active_users INT DEFAULT 0,
  monthly_active_users INT DEFAULT 0,
  total_users INT DEFAULT 0,
  new_signups INT DEFAULT 0,
  rounds_today INT DEFAULT 0,
  rounds_this_week INT DEFAULT 0,
  total_rounds INT DEFAULT 0,
  avg_rounds_per_active_player NUMERIC(6,2),
  insights_generated INT DEFAULT 0,
  reviews_created INT DEFAULT 0,
  patterns_detected INT DEFAULT 0,
  active_teams INT DEFAULT 0,
  avg_engagement_score NUMERIC(5,2),
  churn_at_risk_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tracer health snapshots (weekly)
CREATE TABLE IF NOT EXISTS golf_tracer_health_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapped_at TIMESTAMPTZ DEFAULT now(),
  health_score NUMERIC(5,2),
  completion_pct NUMERIC(5,2),
  quality_score NUMERIC(5,2),
  error_count_7d INT DEFAULT 0,
  players_with_stale_cache INT DEFAULT 0,
  avg_round_quality_score NUMERIC(5,2),
  stuck_rounds INT DEFAULT 0,
  total_rounds_tracked INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracer_health_snapped ON golf_tracer_health_snapshot(snapped_at DESC);

-- ============================================================================
-- 2. RPC FUNCTIONS
-- ============================================================================

-- User engagement summary
CREATE OR REPLACE FUNCTION get_user_engagement_summary(time_range_days INT DEFAULT 30)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role TEXT,
  rounds_in_period INT,
  reviews_in_period INT,
  messages_in_period INT,
  insights_acknowledged INT,
  events_attended INT,
  engagement_score NUMERIC,
  lifecycle_stage TEXT,
  last_active_at TIMESTAMPTZ,
  days_since_signup INT
) AS $$
DECLARE
  cutoff TIMESTAMPTZ := now() - (time_range_days || ' days')::interval;
BEGIN
  RETURN QUERY
  WITH user_activity AS (
    SELECT
      u.id AS uid,
      u.email AS uemail,
      u.role AS urole,
      u.created_at AS ucreated,
      u.last_seen AS ulast_seen,
      COALESCE(gp.id, gc.id) AS profile_id,
      COALESCE(gp.onboarding_completed, gc.onboarding_completed, false) AS onboarding_done
    FROM users u
    LEFT JOIN golf_players gp ON gp.user_id = u.id
    LEFT JOIN golf_coaches gc ON gc.user_id = u.id
  ),
  round_counts AS (
    SELECT gr.player_id, COUNT(*) AS cnt
    FROM golf_rounds gr
    WHERE gr.created_at >= cutoff
    GROUP BY gr.player_id
  ),
  review_counts AS (
    SELECT grr.player_id, COUNT(*) AS cnt
    FROM golf_round_reviews grr
    WHERE grr.created_at >= cutoff
    GROUP BY grr.player_id
  ),
  message_counts AS (
    SELECT gm.sender_id, COUNT(*) AS cnt
    FROM golf_messages gm
    WHERE gm.created_at >= cutoff
    GROUP BY gm.sender_id
  )
  SELECT
    ua.uid,
    ua.uemail,
    ua.urole,
    COALESCE(rc.cnt, 0)::INT,
    COALESCE(rv.cnt, 0)::INT,
    COALESCE(mc.cnt, 0)::INT,
    0::INT, -- insights_acknowledged placeholder
    0::INT, -- events_attended placeholder
    (COALESCE(rc.cnt, 0) * 3 + COALESCE(rv.cnt, 0) * 2 + COALESCE(mc.cnt, 0))::NUMERIC AS engagement_score,
    CASE
      WHEN ua.ucreated > now() - interval '7 days' AND NOT ua.onboarding_done THEN 'brand_new'
      WHEN NOT ua.onboarding_done THEN 'onboarding'
      WHEN COALESCE(rc.cnt, 0) = 0 AND ua.ulast_seen < now() - interval '30 days' THEN 'churned'
      WHEN COALESCE(rc.cnt, 0) = 0 AND ua.ulast_seen < now() - interval '14 days' THEN 'at_risk'
      WHEN COALESCE(rc.cnt, 0) >= 10 THEN 'power_user'
      WHEN COALESCE(rc.cnt, 0) >= 3 THEN 'engaged'
      WHEN COALESCE(rc.cnt, 0) >= 1 THEN 'active'
      ELSE 'dormant'
    END AS lifecycle_stage,
    ua.ulast_seen,
    EXTRACT(DAY FROM now() - ua.ucreated)::INT
  FROM user_activity ua
  LEFT JOIN golf_players gp2 ON gp2.user_id = ua.uid
  LEFT JOIN round_counts rc ON rc.player_id = gp2.id
  LEFT JOIN review_counts rv ON rv.player_id = gp2.id
  LEFT JOIN message_counts mc ON mc.sender_id = ua.uid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Team health dashboard
CREATE OR REPLACE FUNCTION get_team_health_dashboard()
RETURNS TABLE (
  team_id UUID,
  team_name TEXT,
  org_name TEXT,
  member_count INT,
  active_7d INT,
  active_30d INT,
  rounds_30d INT,
  avg_rounds_per_player NUMERIC,
  health_score NUMERIC,
  health_tier TEXT,
  has_ai_philosophy BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    o.name,
    COUNT(DISTINCT tm.player_id)::INT,
    COUNT(DISTINCT CASE WHEN gr7.player_id IS NOT NULL THEN tm.player_id END)::INT,
    COUNT(DISTINCT CASE WHEN gr30.player_id IS NOT NULL THEN tm.player_id END)::INT,
    COUNT(DISTINCT gr30.id)::INT,
    CASE WHEN COUNT(DISTINCT tm.player_id) > 0
      THEN ROUND(COUNT(DISTINCT gr30.id)::NUMERIC / COUNT(DISTINCT tm.player_id), 1)
      ELSE 0 END,
    CASE WHEN COUNT(DISTINCT tm.player_id) > 0
      THEN ROUND(
        (COUNT(DISTINCT CASE WHEN gr7.player_id IS NOT NULL THEN tm.player_id END)::NUMERIC /
         NULLIF(COUNT(DISTINCT tm.player_id), 0) * 50) +
        (LEAST(COUNT(DISTINCT gr30.id)::NUMERIC / NULLIF(COUNT(DISTINCT tm.player_id), 0) / 4, 1) * 30) +
        (CASE WHEN bool_or(gcp.coach_id IS NOT NULL) THEN 20 ELSE 0 END)
      , 1)
      ELSE 0 END,
    CASE
      WHEN COUNT(DISTINCT CASE WHEN gr7.player_id IS NOT NULL THEN tm.player_id END)::NUMERIC /
           NULLIF(COUNT(DISTINCT tm.player_id), 0) >= 0.6 THEN 'thriving'
      WHEN COUNT(DISTINCT CASE WHEN gr7.player_id IS NOT NULL THEN tm.player_id END)::NUMERIC /
           NULLIF(COUNT(DISTINCT tm.player_id), 0) >= 0.3 THEN 'healthy'
      WHEN COUNT(DISTINCT CASE WHEN gr30.player_id IS NOT NULL THEN tm.player_id END) > 0 THEN 'at_risk'
      ELSE 'inactive'
    END,
    bool_or(gcp.coach_id IS NOT NULL)
  FROM golf_teams t
  LEFT JOIN organizations o ON o.id = t.organization_id
  LEFT JOIN golf_team_members tm ON tm.team_id = t.id AND tm.status = 'active'
  LEFT JOIN golf_rounds gr7 ON gr7.player_id = tm.player_id AND gr7.created_at >= now() - interval '7 days'
  LEFT JOIN golf_rounds gr30 ON gr30.player_id = tm.player_id AND gr30.created_at >= now() - interval '30 days'
  LEFT JOIN golf_coaches gc ON gc.organization_id = t.organization_id
  LEFT JOIN golf_coach_philosophy gcp ON gcp.coach_id = gc.id
  GROUP BY t.id, t.name, o.name;
END;
$$ LANGUAGE plpgsql STABLE;

-- Onboarding funnel analysis
CREATE OR REPLACE FUNCTION get_onboarding_funnel_analysis()
RETURNS TABLE (
  step_name TEXT,
  step_order INT,
  total_count INT,
  completed_count INT,
  completion_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH totals AS (
    SELECT COUNT(*)::INT AS total_users FROM users
  ),
  steps AS (
    SELECT 'signed_up' AS sname, 1 AS sorder, (SELECT total_users FROM totals) AS cnt
    UNION ALL
    SELECT 'profile_created', 2, (SELECT COUNT(*)::INT FROM users u WHERE EXISTS (SELECT 1 FROM golf_players gp WHERE gp.user_id = u.id) OR EXISTS (SELECT 1 FROM golf_coaches gc WHERE gc.user_id = u.id))
    UNION ALL
    SELECT 'onboarding_completed', 3, (SELECT COUNT(*)::INT FROM users u LEFT JOIN golf_players gp ON gp.user_id = u.id LEFT JOIN golf_coaches gc ON gc.user_id = u.id WHERE COALESCE(gp.onboarding_completed, gc.onboarding_completed, false) = true)
    UNION ALL
    SELECT 'first_round', 4, (SELECT COUNT(DISTINCT player_id)::INT FROM golf_rounds)
    UNION ALL
    SELECT 'active_this_week', 5, (SELECT COUNT(DISTINCT player_id)::INT FROM golf_rounds WHERE created_at >= now() - interval '7 days')
  )
  SELECT
    s.sname,
    s.sorder,
    (SELECT total_users FROM totals),
    s.cnt,
    ROUND(s.cnt::NUMERIC / NULLIF((SELECT total_users FROM totals), 0) * 100, 1)
  FROM steps s
  ORDER BY s.sorder;
END;
$$ LANGUAGE plpgsql STABLE;

-- Coach effectiveness metrics
CREATE OR REPLACE FUNCTION get_coach_effectiveness_metrics()
RETURNS TABLE (
  coach_id UUID,
  coach_name TEXT,
  team_count INT,
  player_count INT,
  reviews_published INT,
  avg_review_time_hours NUMERIC,
  has_philosophy BOOLEAN,
  effectiveness_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gc.id,
    gc.full_name,
    COUNT(DISTINCT t.id)::INT,
    COUNT(DISTINCT tm.player_id)::INT,
    COUNT(DISTINCT grr.id)::INT,
    ROUND(AVG(EXTRACT(EPOCH FROM (grr.created_at - gr.created_at)) / 3600)::NUMERIC, 1),
    EXISTS(SELECT 1 FROM golf_coach_philosophy gcp WHERE gcp.coach_id = gc.id),
    ROUND(
      (LEAST(COUNT(DISTINCT grr.id)::NUMERIC / NULLIF(COUNT(DISTINCT gr.id), 0), 1) * 40) +
      (CASE WHEN EXISTS(SELECT 1 FROM golf_coach_philosophy gcp WHERE gcp.coach_id = gc.id) THEN 30 ELSE 0 END) +
      (LEAST(COUNT(DISTINCT tm.player_id)::NUMERIC / 10, 1) * 30)
    , 1)
  FROM golf_coaches gc
  LEFT JOIN organizations o ON o.id = gc.organization_id
  LEFT JOIN golf_teams t ON t.organization_id = o.id
  LEFT JOIN golf_team_members tm ON tm.team_id = t.id AND tm.status = 'active'
  LEFT JOIN golf_rounds gr ON gr.player_id = tm.player_id AND gr.created_at >= now() - interval '30 days'
  LEFT JOIN golf_round_reviews grr ON grr.round_id = gr.id AND grr.published_by = gc.id
  GROUP BY gc.id, gc.full_name;
END;
$$ LANGUAGE plpgsql STABLE;

-- API performance summary
CREATE OR REPLACE FUNCTION get_api_performance_summary(days_back INT DEFAULT 7)
RETURNS TABLE (
  route TEXT,
  total_requests INT,
  total_errors INT,
  error_rate NUMERIC,
  avg_ms INT,
  p50_ms INT,
  p95_ms INT,
  p99_ms INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.route,
    SUM(a.request_count)::INT,
    SUM(a.error_count)::INT,
    ROUND(SUM(a.error_count)::NUMERIC / NULLIF(SUM(a.request_count), 0) * 100, 2),
    ROUND(AVG(a.avg_duration_ms))::INT,
    ROUND(AVG(a.p50_ms))::INT,
    ROUND(AVG(a.p95_ms))::INT,
    ROUND(AVG(a.p99_ms))::INT
  FROM api_call_logs a
  WHERE a.recorded_at >= now() - (days_back || ' days')::interval
  GROUP BY a.route
  ORDER BY SUM(a.request_count) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- System health snapshot
CREATE OR REPLACE FUNCTION get_enhanced_system_health()
RETURNS TABLE (
  metric_name TEXT,
  metric_value TEXT,
  status TEXT,
  detail TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'db_size'::TEXT, pg_size_pretty(pg_database_size(current_database())), 'ok'::TEXT, ''::TEXT
  UNION ALL
  SELECT 'active_connections', COUNT(*)::TEXT,
    CASE WHEN COUNT(*) > 80 THEN 'critical' WHEN COUNT(*) > 50 THEN 'warning' ELSE 'ok' END,
    'Max: 100'
  FROM pg_stat_activity WHERE state = 'active'
  UNION ALL
  SELECT 'idle_connections', COUNT(*)::TEXT,
    CASE WHEN COUNT(*) > 30 THEN 'warning' ELSE 'ok' END, ''
  FROM pg_stat_activity WHERE state = 'idle'
  UNION ALL
  SELECT 'errors_last_hour', COUNT(*)::TEXT,
    CASE WHEN COUNT(*) > 50 THEN 'critical' WHEN COUNT(*) > 10 THEN 'warning' ELSE 'ok' END, ''
  FROM error_logs WHERE created_at >= now() - interval '1 hour'
  UNION ALL
  SELECT 'failed_logins_today', COUNT(*)::TEXT,
    CASE WHEN COUNT(*) > 20 THEN 'warning' ELSE 'ok' END, ''
  FROM login_attempts WHERE attempted_at >= CURRENT_DATE AND success = false;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================
-- These tables are admin-only, accessed via service_role key.
-- Enable RLS with no public policies to block anonymous/authenticated access.

ALTER TABLE api_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_rate_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_metrics_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_platform_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_tracer_health_snapshot ENABLE ROW LEVEL SECURITY;
