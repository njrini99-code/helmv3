-- =============================================================================
-- Admin DB Telemetry RPC — 2026-04-28
--
-- Restores the System tab telemetry block (Connection Pool / Database Size /
-- Top Tables by Size). The previous code path returned zeros because no
-- aggregating function existed; the admin dashboard showed
-- `0 active / 0 idle`, `0 B`, and "No table data available" even though prod
-- has tens of GB of data.
--
-- Returns a single row with a JSONB payload so the action layer can do one
-- RPC round-trip and surface every value at once. Numbers are sourced from:
--   * pg_stat_activity (live connection states for the current database)
--   * pg_database_size(current_database())
--   * pg_total_relation_size + pg_class.reltuples for top tables
--
-- SECURITY DEFINER so it can read pg_stat_activity (otherwise non-superusers
-- only see their own rows). Body checks role from public.users; service_role
-- callers bypass the user check by virtue of bypassing RLS, so the explicit
-- gate runs only when called by an authenticated session.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_db_telemetry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role text;
  v_caller uuid;
  v_active int;
  v_idle int;
  v_db_size bigint;
  v_top_tables jsonb;
  v_result jsonb;
BEGIN
  -- Auth gate: allow service_role unconditionally; otherwise require admin.
  -- auth.role() returns 'service_role' for the service-role JWT, 'authenticated'
  -- for normal users, and 'anon' otherwise.
  IF auth.role() <> 'service_role' THEN
    v_caller := auth.uid();
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    SELECT role::text INTO v_role
    FROM public.users
    WHERE id = v_caller;

    IF v_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Connection pool snapshot for the current database only.
  SELECT
    COUNT(*) FILTER (WHERE state = 'active'),
    COUNT(*) FILTER (WHERE state = 'idle')
  INTO v_active, v_idle
  FROM pg_stat_activity
  WHERE datname = current_database();

  -- Total bytes consumed by the current database (data + indexes + toast).
  v_db_size := pg_database_size(current_database());

  -- Top 10 user tables by total relation size, excluding system schemas.
  SELECT COALESCE(
    jsonb_agg(t ORDER BY (t->>'size_bytes')::bigint DESC),
    '[]'::jsonb
  )
  INTO v_top_tables
  FROM (
    SELECT jsonb_build_object(
      'schema',       n.nspname,
      'table',        c.relname,
      'size_bytes',   pg_total_relation_size(c.oid),
      'row_estimate', GREATEST(c.reltuples::bigint, 0)
    ) AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg_temp_%'
      AND n.nspname NOT LIKE 'pg_toast_temp_%'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 10
  ) sub;

  v_result := jsonb_build_object(
    'connection_pool_active', COALESCE(v_active, 0),
    'connection_pool_idle',   COALESCE(v_idle, 0),
    'db_size_bytes',          COALESCE(v_db_size, 0),
    'top_tables',             COALESCE(v_top_tables, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- Lock down execution. Only authenticated callers (admin gate inside body) and
-- service_role may execute. anon/public are denied at the GRANT layer too.
REVOKE ALL ON FUNCTION public.get_db_telemetry() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_db_telemetry() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_db_telemetry() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_db_telemetry() TO service_role;

COMMENT ON FUNCTION public.get_db_telemetry() IS
  'Admin-only DB telemetry: connection pool (active/idle), pg_database_size, '
  'and top 10 tables by total relation size. Surfaced on the admin System '
  'tab. Service role bypasses the user-role gate.';
