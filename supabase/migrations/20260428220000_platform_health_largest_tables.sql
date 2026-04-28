-- get_platform_health_stats was hardcoding `largest_tables: '[]'::JSONB`,
-- so the System tab's "Top Tables by Size" panel always rendered "No table
-- data available" even though `get_db_telemetry` could compute the same list.
-- Populate it inline using pg_class so the existing UI consumer (which reads
-- `phs.largest_tables` and maps `table_name`/`size_bytes`/`row_count`) gets
-- real data without needing a second RPC round-trip from the page.
CREATE OR REPLACE FUNCTION public.get_platform_health_stats()
 RETURNS TABLE(
   active_users_1h integer,
   active_users_24h integer,
   active_users_7d integer,
   active_users_30d integer,
   active_sessions integer,
   total_sessions integer,
   total_auth_users integer,
   users_signed_in_today integer,
   users_never_signed_in integer,
   db_size_bytes bigint,
   largest_tables jsonb,
   active_connections integer,
   idle_connections integer
 )
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
  -- Top 5 user tables by total size. Field names match what the admin UI
  -- expects (`table_name`, `size_bytes`, `row_count`) so no TS-side mapping
  -- has to change.
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
