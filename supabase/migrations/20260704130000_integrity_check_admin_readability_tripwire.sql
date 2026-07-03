-- Bridge integrity-check tripwire: 'admin_count_vs_list_readability'.
--
-- Catches the "badge counts 3, list shows 0" RLS class: a table whose count
-- surfaces on the admin dashboard via a SECURITY DEFINER RPC (which bypasses
-- RLS) while the corresponding list view reads it with the BROWSER client
-- (subject to RLS) and silently gets zero rows because no SELECT policy on
-- the table actually applies to the `authenticated` role. "Some SELECT
-- policy exists" is not the same guarantee as "authenticated can use it" —
-- this check verifies the latter directly against pg_policies, the same
-- pg_catalog-backed view the anon_grant_drift check (added in
-- 20260701150000) already relies on SECURITY DEFINER to read.
--
-- Hardcoded table list = every table the admin UI reads with the browser
-- client (crm/ CRM management surfaces + demo_requests + email_events).
-- search_path IS pinned (public, pg_temp — the function must read public
-- tables and pg_catalog views); the rule's regex only accepts '' or
-- pg_catalog,public forms. Service-role-only EXECUTE, ACL-verified below.
-- nosemgrep: helmv3-security-definer-without-search-path
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

  -- 5. Admin-UI browser-client readability: every table the admin UI reads
  --    with the browser client (not service_role) must have at least one
  --    SELECT (or ALL) policy that actually applies to `authenticated` —
  --    otherwise a badge/count RPC (SECURITY DEFINER, RLS-exempt) can read
  --    N rows while the paired list view silently reads 0.
  SELECT count(*), COALESCE(jsonb_agg(objname) FILTER (WHERE rn <= 15), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT t.tbl AS objname, row_number() OVER () AS rn
    FROM unnest(ARRAY[
      'demo_requests', 'crm_coaches', 'crm_contact_log', 'crm_events',
      'crm_email_templates', 'crm_notes', 'crm_replies', 'crm_segments',
      'crm_sequences', 'crm_sequence_steps', 'crm_sequence_enrollments',
      'crm_tasks', 'crm_automations', 'crm_email_suppressions', 'email_events'
    ]) AS t(tbl)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = t.tbl
        AND p.cmd IN ('SELECT', 'ALL')
        AND p.roles && ARRAY['authenticated', 'public']::name[]
    )
  ) q;
  v := v || jsonb_build_object('check', 'admin_count_vs_list_readability',
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
