-- W11: nightly integrity checks. SECURITY DEFINER so it can read pg_catalog
-- ACLs; EXECUTE granted to service_role ONLY (the cron's client) — no
-- auth.uid() gate needed because anon/authenticated cannot call it at all.
CREATE OR REPLACE FUNCTION public.run_integrity_checks() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v jsonb := '[]'::jsonb;
  n bigint;
  sample jsonb;
BEGIN
  -- 1. Orphaned golf team members
  SELECT count(*), COALESCE(jsonb_agg(id) FILTER (WHERE rn <= 5), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT m.id, row_number() OVER () AS rn
    FROM golf_team_members m
    LEFT JOIN golf_teams t ON t.id = m.team_id
    WHERE m.team_id IS NOT NULL AND t.id IS NULL
  ) q;
  v := v || jsonb_build_object('check', 'orphaned_golf_team_members',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);

  -- 2. Stats-cache rows referencing deleted players
  SELECT count(*), COALESCE(jsonb_agg(id) FILTER (WHERE rn <= 5), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT c.id, row_number() OVER () AS rn
    FROM golf_player_stats_cache c
    LEFT JOIN golf_players p ON p.id = c.player_id
    WHERE p.id IS NULL
  ) q;
  v := v || jsonb_build_object('check', 'stats_cache_deleted_players',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);

  -- 3. Schema canaries — Helm Bridge objects that MUST exist (catches
  --    recorded-but-unapplied migrations, the documented failure mode)
  SELECT count(*) INTO n FROM (
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='admin_allowlist')
    UNION ALL
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='admin_events' AND column_name='fingerprint')
    UNION ALL
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname='public' AND p.proname='is_super_admin')
  ) missing;
  v := v || jsonb_build_object('check', 'bridge_schema_canaries',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', '[]'::jsonb);

  -- 4. Anon-grant drift on Bridge-sensitive objects (the recurring gotcha:
  --    recreates auto-grant ALL to anon+authenticated)
  SELECT count(*), COALESCE(jsonb_agg(objname) FILTER (WHERE rn <= 5), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT c.relname AS objname, row_number() OVER () AS rn
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public'
      AND c.relname IN ('admin_allowlist', 'admin_events', 'error_logs', 'background_job_logs', 'audit_log', 'login_attempts')
      AND (has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('anon', c.oid, 'UPDATE')
        OR has_table_privilege('anon', c.oid, 'DELETE'))
  ) q;
  v := v || jsonb_build_object('check', 'anon_grant_drift',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.run_integrity_checks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_integrity_checks() TO service_role;

DO $$
DECLARE v_fn oid;
BEGIN
  SELECT p.oid INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='run_integrity_checks';
  IF has_function_privilege('anon', v_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: run_integrity_checks callable by anon/authenticated';
  END IF;
END $$;
