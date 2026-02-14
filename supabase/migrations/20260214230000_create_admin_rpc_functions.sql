-- ============================================================================
-- Migration: 20260214230000_create_admin_rpc_functions.sql
-- Purpose: Create RPC functions for admin dashboard platform health stats
-- ============================================================================

-- ============================================================================
-- GET PLATFORM HEALTH STATS
-- Returns real-time platform health metrics from auth sessions + DB stats
-- ============================================================================
CREATE OR REPLACE FUNCTION get_platform_health_stats()
RETURNS TABLE (
  active_users_1h INTEGER,
  active_users_24h INTEGER,
  active_users_7d INTEGER,
  active_users_30d INTEGER,
  active_sessions INTEGER,
  total_sessions INTEGER,
  total_auth_users INTEGER,
  users_signed_in_today INTEGER,
  users_never_signed_in INTEGER,
  db_size_bytes BIGINT,
  largest_tables JSONB,
  active_connections INTEGER,
  idle_connections INTEGER
) AS $$
DECLARE
  v_1h TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
  v_24h TIMESTAMPTZ := NOW() - INTERVAL '24 hours';
  v_7d TIMESTAMPTZ := NOW() - INTERVAL '7 days';
  v_30d TIMESTAMPTZ := NOW() - INTERVAL '30 days';
  v_today TIMESTAMPTZ := DATE_TRUNC('day', NOW());
BEGIN
  RETURN QUERY
  SELECT
    -- Active users based on last_seen from users table
    (SELECT COUNT(DISTINCT id)::INTEGER FROM users WHERE last_seen >= v_1h),
    (SELECT COUNT(DISTINCT id)::INTEGER FROM users WHERE last_seen >= v_24h),
    (SELECT COUNT(DISTINCT id)::INTEGER FROM users WHERE last_seen >= v_7d),
    (SELECT COUNT(DISTINCT id)::INTEGER FROM users WHERE last_seen >= v_30d),
    -- Active sessions (users with recent activity)
    (SELECT COUNT(DISTINCT id)::INTEGER FROM users WHERE last_seen >= v_1h),
    -- Total sessions (all users who have signed in)
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen IS NOT NULL),
    -- Total auth users
    (SELECT COUNT(*)::INTEGER FROM users),
    -- Users signed in today
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_today),
    -- Users who never signed in
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen IS NULL),
    -- DB size (estimate using pg_database_size)
    (SELECT pg_database_size(current_database())::BIGINT),
    -- Largest tables
    (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.size_bytes DESC), '[]'::JSONB)
      FROM (
        SELECT 
          relname::TEXT AS table_name,
          pg_total_relation_size(c.oid)::BIGINT AS size_bytes,
          (SELECT reltuples::BIGINT FROM pg_class WHERE oid = c.oid) AS row_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 10
      ) t
    ),
    -- Active connections
    (SELECT COUNT(*)::INTEGER FROM pg_stat_activity WHERE state = 'active' AND datname = current_database()),
    -- Idle connections
    (SELECT COUNT(*)::INTEGER FROM pg_stat_activity WHERE state = 'idle' AND datname = current_database());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (admin check will be done in app layer)
GRANT EXECUTE ON FUNCTION get_platform_health_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_platform_health_stats() TO service_role;

-- ============================================================================
-- GET USERS WITH AUTH
-- Returns user IDs with their last sign-in timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION get_users_with_auth()
RETURNS TABLE (
  id UUID,
  last_sign_in_at TIMESTAMPTZ,
  last_seen TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.last_seen AS last_sign_in_at, -- Using last_seen as proxy for sign-in
    u.last_seen
  FROM users u;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_users_with_auth() TO authenticated;
GRANT EXECUTE ON FUNCTION get_users_with_auth() TO service_role;

-- ============================================================================
-- GET ERROR SUMMARY
-- Returns aggregated error statistics
-- ============================================================================
CREATE OR REPLACE FUNCTION get_error_summary(days_back INTEGER DEFAULT 7)
RETURNS TABLE (
  by_severity JSONB,
  top_errors JSONB,
  daily_rate JSONB,
  total_count BIGINT,
  critical_count BIGINT
) AS $$
DECLARE
  v_start TIMESTAMPTZ := NOW() - (days_back || ' days')::INTERVAL;
BEGIN
  RETURN QUERY
  WITH 
    errors_in_range AS (
      SELECT * FROM error_logs WHERE created_at >= v_start
    ),
    sev_counts AS (
      SELECT jsonb_agg(jsonb_build_object('severity', severity, 'count', cnt)) AS data
      FROM (
        SELECT COALESCE(severity, 'error') AS severity, COUNT(*)::INTEGER AS cnt
        FROM errors_in_range
        GROUP BY severity
      ) s
    ),
    top_errs AS (
      SELECT jsonb_agg(t ORDER BY t.occurrences DESC) AS data
      FROM (
        SELECT 
          message,
          COALESCE(severity, 'error') AS severity,
          COUNT(*)::INTEGER AS occurrences,
          MIN(created_at)::TEXT AS first_seen,
          MAX(created_at)::TEXT AS last_seen,
          COUNT(DISTINCT user_id)::INTEGER AS affected_users
        FROM errors_in_range
        GROUP BY message, severity
        ORDER BY COUNT(*) DESC
        LIMIT 20
      ) t
    ),
    daily AS (
      SELECT jsonb_agg(jsonb_build_object('day', day, 'count', cnt) ORDER BY day) AS data
      FROM (
        SELECT DATE(created_at) AS day, COUNT(*)::INTEGER AS cnt
        FROM errors_in_range
        GROUP BY DATE(created_at)
      ) d
    )
  SELECT
    COALESCE((SELECT data FROM sev_counts), '[]'::JSONB),
    COALESCE((SELECT data FROM top_errs), '[]'::JSONB),
    COALESCE((SELECT data FROM daily), '[]'::JSONB),
    (SELECT COUNT(*) FROM errors_in_range),
    (SELECT COUNT(*) FROM errors_in_range WHERE severity = 'critical');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_error_summary(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_error_summary(INTEGER) TO service_role;

-- ============================================================================
-- GET AUDIT LOG RECENT
-- Returns recent audit log entries with user email resolution
-- ============================================================================
CREATE OR REPLACE FUNCTION get_audit_log_recent(limit_count INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  action TEXT,
  table_name TEXT,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.user_id,
    u.email,
    a.action,
    a.table_name,
    a.record_id::TEXT,
    a.old_data,
    a.new_data,
    a.created_at
  FROM audit_log a
  LEFT JOIN users u ON u.id = a.user_id
  ORDER BY a.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_audit_log_recent(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_log_recent(INTEGER) TO service_role;

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================
COMMENT ON FUNCTION get_platform_health_stats() IS 'Returns real-time platform health metrics for admin dashboard';
COMMENT ON FUNCTION get_users_with_auth() IS 'Returns all users with their last sign-in timestamps';
COMMENT ON FUNCTION get_error_summary(INTEGER) IS 'Returns aggregated error statistics for specified days back';
COMMENT ON FUNCTION get_audit_log_recent(INTEGER) IS 'Returns recent audit log entries with user email resolution';
