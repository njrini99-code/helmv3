-- W15: feature-tagged error capture + feature-health rollup.
-- File: supabase/migrations/20260702090000_admin_events_feature_health.sql
-- ADDITIVE ONLY on admin_events (live writers stay backward-compatible; the
-- column must land BEFORE src/lib/server-error-logger.ts starts writing it).

ALTER TABLE public.admin_events
  ADD COLUMN IF NOT EXISTS feature text;

COMMENT ON COLUMN public.admin_events.feature IS
  'Canonical feature key from src/lib/admin/feature-registry.ts (FEATURE_COVERAGE.md §1). '
  'Free text by design — the feature vocabulary grows faster than sports/sources; '
  'validity is enforced app-side by the FeatureKey type + contract tests.';

CREATE INDEX IF NOT EXISTS idx_admin_events_feature_created
  ON public.admin_events (feature, created_at DESC)
  WHERE feature IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_events_feature_unresolved
  ON public.admin_events (feature, severity)
  WHERE NOT resolved AND feature IS NOT NULL;

-- ── get_feature_health(p_features jsonb) ────────────────────────────────────
-- One round-trip rollup for the Feature Health board (W16). Same gate pattern
-- as get_active_sessions / resolve_admin_event
-- (20260701130000_bridge_rpcs_sessions_resolve.sql): SECURITY DEFINER in
-- public, internal is_super_admin() gate, authenticated EXECUTE only.
-- Input: jsonb array of {"key": text, "heartbeat_table": text|null}.
-- NOISE DISCIPLINE (FEATURE_COVERAGE.md §0): fingerprint counts include ONLY
-- severity error/critical; warnings + info are returned as separate drill-in
-- counts and can never drive a dot; RLS denials get their own counters.
CREATE OR REPLACE FUNCTION public.get_feature_health(p_features jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  f jsonb;
  v_key text;
  v_table text;
  v_heartbeat timestamptz;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_features IS NULL
     OR jsonb_typeof(p_features) <> 'array'
     OR jsonb_array_length(p_features) > 100 THEN
    RAISE EXCEPTION 'p_features must be a jsonb array of <= 100 feature descriptors';
  END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(p_features) LOOP
    v_key := f->>'key';
    CONTINUE WHEN v_key IS NULL OR length(v_key) > 64;

    -- Heartbeat: dynamic MAX(created_at) against a caller-supplied table name.
    -- HARD allowlist guard — never trust the jsonb input raw: the table must
    -- (a) match an approved prefix and (b) exist with a created_at column.
    v_table := f->>'heartbeat_table';
    v_heartbeat := NULL;
    IF v_table IS NOT NULL
       AND (v_table LIKE 'golf\_%' OR v_table IN ('admin_events', 'error_logs'))
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = v_table
           AND column_name = 'created_at')
    THEN
      EXECUTE format('SELECT max(created_at) FROM public.%I', v_table)
        INTO v_heartbeat;
    END IF;

    v_result := v_result || jsonb_build_object(
      'key', v_key,
      'events_24h', COALESCE((
        SELECT jsonb_build_object(
          'total',               count(*),
          'errors',              count(*) FILTER (WHERE severity IN ('error','critical')),
          'critical_unresolved', count(*) FILTER (WHERE severity = 'critical' AND NOT resolved),
          'warnings',            count(*) FILTER (WHERE severity = 'warning' AND source <> 'rls_denial'),
          'fingerprints',        count(DISTINCT fingerprint) FILTER (WHERE severity IN ('error','critical')),
          'rls_denials',         count(*) FILTER (WHERE source = 'rls_denial'),
          'rls_denial_fingerprints', count(DISTINCT fingerprint) FILTER (WHERE source = 'rls_denial'),
          'rls_denial_users',    count(DISTINCT user_id) FILTER (WHERE source = 'rls_denial')
        )
        FROM public.admin_events
        WHERE feature = v_key
          AND created_at >= now() - interval '24 hours'), '{}'::jsonb),
      'top_signatures', COALESCE((
        SELECT jsonb_agg(sig ORDER BY (sig->>'count')::int DESC)
        FROM (
          SELECT jsonb_build_object(
            'fingerprint', fingerprint,
            'title',       min(title),
            'count',       count(*),
            'first_seen',  min(created_at),
            'last_seen',   max(created_at),
            'severity',    CASE WHEN bool_or(severity = 'critical') THEN 'critical' ELSE 'error' END,
            'resolved',    bool_and(resolved)
          ) AS sig
          FROM public.admin_events
          WHERE feature = v_key
            AND created_at >= now() - interval '24 hours'
            AND severity IN ('error','critical')
            AND fingerprint IS NOT NULL
          GROUP BY fingerprint
          ORDER BY count(*) DESC
          LIMIT 5
        ) top5), '[]'::jsonb),
      'fingerprints_prev_24h', (
        SELECT count(DISTINCT fingerprint)
        FROM public.admin_events
        WHERE feature = v_key
          AND severity IN ('error','critical')
          AND created_at >= now() - interval '48 hours'
          AND created_at <  now() - interval '24 hours'),
      'errors_prev_24h', (
        SELECT count(*)
        FROM public.admin_events
        WHERE feature = v_key
          AND severity IN ('error','critical')
          AND created_at >= now() - interval '48 hours'
          AND created_at <  now() - interval '24 hours'),
      'fingerprints_7d', (
        SELECT count(DISTINCT fingerprint)
        FROM public.admin_events
        WHERE feature = v_key
          AND severity IN ('error','critical')
          AND created_at >= now() - interval '7 days'),
      'integrity_status', (
        SELECT CASE WHEN severity IN ('error','critical') THEN 'fail' ELSE 'pass' END
        FROM public.admin_events
        WHERE feature = v_key AND source = 'integrity'
        ORDER BY created_at DESC
        LIMIT 1),
      'heartbeat_last_activity', v_heartbeat
    );
  END LOOP;

  RETURN v_result;
END;
$$;

-- ── Safety rails (W3 pattern) ───────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_feature_health(jsonb) FROM PUBLIC, anon, authenticated;
-- authenticated EXECUTE required: invoked with the super admin's user-scoped
-- JWT (internal is_super_admin() gate does the real filtering). anon: NOTHING.
GRANT EXECUTE ON FUNCTION public.get_feature_health(jsonb) TO authenticated;

DO $$
DECLARE
  v_fn oid;
BEGIN
  -- Column landed.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_events' AND column_name = 'feature'
  ) THEN
    RAISE EXCEPTION 'Column check failed: admin_events.feature missing';
  END IF;

  -- Re-assert the W2 ACL contract on admin_events: anon NOTHING, authenticated
  -- no INSERT, and the legacy authenticated SELECT/UPDATE (still needed by
  -- /golf/admin until W14 retirement) is intact.
  IF has_table_privilege('anon', 'public.admin_events', 'SELECT')
     OR has_table_privilege('anon', 'public.admin_events', 'INSERT')
     OR has_table_privilege('anon', 'public.admin_events', 'UPDATE')
     OR has_table_privilege('anon', 'public.admin_events', 'DELETE')
     OR has_table_privilege('authenticated', 'public.admin_events', 'INSERT') THEN
    RAISE EXCEPTION 'ACL check failed: admin_events over-granted (anon any / authenticated INSERT)';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.admin_events', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.admin_events', 'UPDATE') THEN
    RAISE EXCEPTION 'ACL check failed: legacy authenticated SELECT/UPDATE on admin_events was dropped (breaks /golf/admin)';
  END IF;

  -- RPC ACL: anon must NOT execute; authenticated must.
  SELECT p.oid INTO v_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_feature_health';

  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: get_feature_health executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: get_feature_health missing authenticated EXECUTE';
  END IF;
END $$;