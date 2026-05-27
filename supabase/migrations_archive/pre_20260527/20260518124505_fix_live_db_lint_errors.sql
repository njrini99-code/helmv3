-- Fix live database lint errors that were blocking safe CI/advisor gates.

BEGIN;

CREATE EXTENSION IF NOT EXISTS hypopg WITH SCHEMA extensions;

-- Supabase's index advisor calls hypopg_reset() unqualified. We cannot alter
-- the extension-owned function, so expose a thin public wrapper for lint-time
-- and runtime name resolution.
CREATE OR REPLACE FUNCTION public.hypopg_reset()
RETURNS void
LANGUAGE sql
AS $$
  SELECT extensions.hypopg_reset();
$$;

REVOKE EXECUTE ON FUNCTION public.hypopg_reset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hypopg_reset() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_baseball_conversations_with_details(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  creator_id text,
  last_message_content text,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  unread_count bigint,
  participant_ids uuid[],
  participant_names text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.created_at,
    c.updated_at,
    c.created_by::text AS creator_id,
    (SELECT m.content FROM baseball_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.created_at FROM baseball_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.sender_id FROM baseball_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT COUNT(*) FROM baseball_messages m WHERE m.conversation_id = c.id AND m.read = FALSE AND m.sender_id != p_user_id),
    ARRAY(SELECT cp2.user_id FROM baseball_conversation_participants cp2 WHERE cp2.conversation_id = c.id),
    ARRAY(SELECT COALESCE(u.email, 'Unknown') FROM baseball_conversation_participants cp2 JOIN users u ON u.id = cp2.user_id WHERE cp2.conversation_id = c.id)
  FROM baseball_conversations c
  JOIN baseball_conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = p_user_id
  ORDER BY c.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_engagement_summary(time_range_days integer DEFAULT 30)
RETURNS TABLE(
  user_id uuid,
  email text,
  role text,
  rounds_in_period integer,
  reviews_in_period integer,
  messages_in_period integer,
  insights_acknowledged integer,
  events_attended integer,
  engagement_score numeric,
  lifecycle_stage text,
  last_active_at timestamptz,
  days_since_signup integer
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cutoff TIMESTAMPTZ := now() - (time_range_days || ' days')::interval;
BEGIN
  RETURN QUERY
  WITH user_activity AS (
    SELECT
      u.id AS uid,
      u.email AS uemail,
      u.role::text AS urole,
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
    0::INT,
    0::INT,
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
$$;

CREATE OR REPLACE FUNCTION public.get_enhanced_system_health()
RETURNS TABLE(metric_name text, metric_value text, status text, detail text)
LANGUAGE plpgsql
STABLE
AS $$
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
  FROM login_attempts WHERE last_attempt >= CURRENT_DATE AND failed_attempts > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_errors_rollup(
  p_ago7d  timestamptz DEFAULT (now() - interval '7 days'),
  p_ago24h timestamptz DEFAULT (now() - interval '24 hours')
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error_logs_recent       jsonb := '[]'::jsonb;
  v_error_logs_total_7d     bigint := 0;
  v_error_logs_critical_7d  bigint := 0;
  v_error_logs_count_24h    bigint := 0;
  v_error_summary           jsonb := NULL;
  v_audit_recent            jsonb := '[]'::jsonb;
  v_audit_total_7d          bigint := 0;
  v_login_recent            jsonb := '[]'::jsonb;
  v_login_locked_count      bigint := 0;
  v_admin_events_recent     jsonb := '[]'::jsonb;
  v_admin_events_unresolved jsonb := '[]'::jsonb;
  v_admin_events_error_only jsonb := '[]'::jsonb;
  v_admin_event_summary     jsonb := NULL;
BEGIN
  PERFORM public.__admin_rollup_b_gate();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'message', e.message,
        'severity', e.severity,
        'stack', e.stack,
        'url', e.url,
        'user_id', e.user_id,
        'context', e.context,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_error_logs_recent
  FROM (
    SELECT id, message, severity, stack, url, user_id, context, created_at
    FROM error_logs
    ORDER BY created_at DESC
    LIMIT 500
  ) e;

  SELECT COUNT(*)::bigint INTO v_error_logs_total_7d
    FROM error_logs WHERE created_at >= p_ago7d;
  SELECT COUNT(*)::bigint INTO v_error_logs_critical_7d
    FROM error_logs WHERE created_at >= p_ago7d AND severity = 'critical';
  SELECT COUNT(*)::bigint INTO v_error_logs_count_24h
    FROM error_logs WHERE created_at >= p_ago24h;

  BEGIN
    SELECT jsonb_build_object(
      'by_severity', by_severity,
      'top_errors', top_errors,
      'daily_rate', daily_rate,
      'total_count', total_count,
      'critical_count', critical_count
    )
    INTO v_error_summary
    FROM public.get_error_summary(7);
  EXCEPTION WHEN OTHERS THEN
    v_error_summary := NULL;
  END;

  BEGIN
    v_audit_recent := COALESCE(public.get_audit_log_recent(50)::jsonb, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_audit_recent := '[]'::jsonb;
  END;

  SELECT COUNT(*)::bigint INTO v_audit_total_7d
    FROM audit_log WHERE created_at >= p_ago7d;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'email', l.email,
        'failed_attempts', l.failed_attempts,
        'last_attempt', l.last_attempt,
        'locked_until', l.locked_until
      )
      ORDER BY l.last_attempt DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_login_recent
  FROM (
    SELECT email, failed_attempts, last_attempt, locked_until
    FROM login_attempts
    ORDER BY last_attempt DESC NULLS LAST
    LIMIT 20
  ) l;

  SELECT COUNT(*)::bigint INTO v_login_locked_count
    FROM login_attempts WHERE locked_until >= now();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'severity', e.severity::text,
        'title', e.title,
        'message', e.message,
        'user_id', e.user_id,
        'user_email', e.user_email,
        'url', e.url,
        'resolved', e.resolved,
        'resolved_at', e.resolved_at,
        'resolved_by', e.resolved_by,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_admin_events_recent
  FROM (
    SELECT id, event_type, severity, title, message, user_id, user_email,
           url, resolved, resolved_at, resolved_by, created_at
    FROM admin_events
    ORDER BY created_at DESC
    LIMIT 500
  ) e;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'severity', e.severity::text,
        'title', e.title,
        'message', e.message,
        'resolved', e.resolved,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_admin_events_unresolved
  FROM (
    SELECT id, event_type, severity, title, message, resolved, created_at
    FROM admin_events
    WHERE resolved = FALSE
      AND severity IN ('critical', 'error')
    ORDER BY created_at DESC
    LIMIT 20
  ) e;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'severity', e.severity::text,
        'title', e.title,
        'message', e.message,
        'metadata', e.metadata,
        'user_id', e.user_id,
        'user_email', e.user_email,
        'url', e.url,
        'resolved', e.resolved,
        'resolved_at', e.resolved_at,
        'resolved_by', e.resolved_by,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_admin_events_error_only
  FROM (
    SELECT id, event_type, severity, title, message, metadata, user_id,
           user_email, url, resolved, resolved_at, resolved_by, created_at
    FROM admin_events
    WHERE event_type = 'error'
    ORDER BY created_at DESC
    LIMIT 500
  ) e;

  BEGIN
    v_admin_event_summary := COALESCE(public.get_admin_event_summary(7), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_admin_event_summary := NULL;
  END;

  RETURN jsonb_build_object(
    'error_logs', jsonb_build_object(
      'recent', v_error_logs_recent,
      'total_7d', v_error_logs_total_7d,
      'critical_7d', v_error_logs_critical_7d,
      'count_24h', v_error_logs_count_24h
    ),
    'error_summary', v_error_summary,
    'audit_log', jsonb_build_object(
      'recent', v_audit_recent,
      'total_7d', v_audit_total_7d
    ),
    'login_security', jsonb_build_object(
      'recent', v_login_recent,
      'locked_count', v_login_locked_count
    ),
    'admin_events', jsonb_build_object(
      'recent', v_admin_events_recent,
      'unresolved_critical', v_admin_events_unresolved,
      'error_only', v_admin_events_error_only,
      'summary', v_admin_event_summary
    )
  );
END;
$$;

COMMIT;
