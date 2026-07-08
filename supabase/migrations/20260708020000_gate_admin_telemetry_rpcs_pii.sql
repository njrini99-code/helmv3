-- SECURITY (2026-07-08 forensic audit): get_users_with_auth() and
-- get_platform_health_stats() are SECURITY DEFINER + EXECUTE-to-authenticated
-- but had NO authorization check — any logged-in user could dump every user's
-- email + auth metadata, or read platform DB/connection telemetry. Prepend the
-- same is_super_admin()/is_admin() gate the sibling admin RPCs
-- (get_admin_dashboard_rollup, get_audit_log_recent) already use. Bodies are
-- otherwise byte-identical to the pre-existing definitions. Idempotent
-- (CREATE OR REPLACE). Applied to prod via MCP apply_migration on 2026-07-08.

CREATE OR REPLACE FUNCTION public.get_users_with_auth()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(json_agg(u), '[]'::json) INTO result
  FROM (
    SELECT
      pu.id,
      pu.email,
      pu.role,
      pu.created_at,
      pu.last_seen,
      au.last_sign_in_at,
      au.email_confirmed_at,
      au.created_at as auth_created_at
    FROM users pu
    LEFT JOIN auth.users au ON au.id = pu.id
    ORDER BY pu.created_at DESC
  ) u;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_platform_health_stats()
 RETURNS TABLE(active_users_1h integer, active_users_24h integer, active_users_7d integer, active_users_30d integer, active_sessions integer, total_sessions integer, total_auth_users integer, users_signed_in_today integer, users_never_signed_in integer, db_size_bytes bigint, largest_tables jsonb, active_connections integer, idle_connections integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_1h    TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
  v_24h   TIMESTAMPTZ := NOW() - INTERVAL '24 hours';
  v_7d    TIMESTAMPTZ := NOW() - INTERVAL '7 days';
  v_30d   TIMESTAMPTZ := NOW() - INTERVAL '30 days';
  v_today TIMESTAMPTZ := DATE_TRUNC('day', NOW());
  v_largest jsonb;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(t ORDER BY (t->>'size_bytes')::bigint DESC),
    '[]'::jsonb
  )
  INTO v_largest
  FROM (
    SELECT jsonb_build_object(
      'table_name', n.nspname || '.' || c.relname,
      'size_bytes', pg_total_relation_size(c.oid),
      'row_count',  GREATEST(c.reltuples::bigint, 0)
    ) AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg_temp_%'
      AND n.nspname NOT LIKE 'pg_toast_temp_%'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 5
  ) sub;

  RETURN QUERY SELECT
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_1h),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_24h),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_7d),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_30d),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_1h),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen IS NOT NULL),
    (SELECT COUNT(*)::INTEGER FROM users),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_today),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen IS NULL),
    (SELECT pg_database_size(current_database())::BIGINT),
    COALESCE(v_largest, '[]'::jsonb),
    (SELECT COUNT(*)::INTEGER FROM pg_stat_activity WHERE state = 'active' AND datname = current_database()),
    (SELECT COUNT(*)::INTEGER FROM pg_stat_activity WHERE state = 'idle'   AND datname = current_database());
END;
$function$;
