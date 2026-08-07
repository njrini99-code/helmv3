-- Feature Health RPC — two defects found by the 2026-08-06 Helm Bridge audit.
--
-- Supersedes the get_feature_health() body defined in
-- 20260702090000_admin_events_feature_health.sql (the only prior definition).
-- Signature, volatility, SECURITY DEFINER, search_path and the returned jsonb
-- shape are UNCHANGED — only the input ceiling and the heartbeat-table
-- allowlist move. Everything else below is a verbatim copy so a future reader
-- diffing the two files sees exactly two changes.
--
-- (a) CEILING. The guard raised above jsonb_array_length(p_features) > 100.
--     src/lib/admin/feature-registry.ts holds 86 entries today and rpcInput()
--     sends 85 of them (the CRM row is `excluded`) — fifteen features of
--     headroom. Worse, src/lib/admin/data/feature-health.ts caught the
--     exception bare, so crossing the cap would have turned the ENTIRE board
--     plus the /admin overview rollup neutral with nothing anywhere naming
--     the limit. 500 is far past any plausible registry size while still
--     bounding the loop below, which runs six aggregate queries over
--     admin_events per descriptor. The message now reports the actual length
--     so the next person to hit it does not have to read this file.
--
-- (b) BASEBALL HEARTBEATS. The allowlist matched `golf\_%` plus two unprefixed
--     tables, so all 43 registry rows whose heartbeatTable is a baseball_*
--     table (39 distinct tables) resolved to NULL. A NULL heartbeat makes
--     computeFeatureStatus() skip the staleness rule outright
--     (feature-health.ts:214) — meaning NO BaseballHelm feature could EVER go
--     amber on a dead heartbeat, however long its table had gone unwritten.
--
--     BLAST RADIUS, measured against production 2026-08-06 per feature and
--     against that feature's OWN tier threshold (TIER_THRESHOLDS in
--     feature-registry.ts: high 6h, med 72h, low 336h — a uniform 6h reading
--     badly overstates this). Of the 43 registry features with a baseball_*
--     heartbeat:
--       - 18 point at a table this migration still cannot resolve, so they
--         stay NULL and remain unable to go amber. 15 of those 18 name a table
--         that DOES NOT EXIST in the schema (14 distinct names, mostly
--         near-miss typos: baseball_watchlist vs baseball_watchlists,
--         baseball_lineups vs baseball_team_lineups, baseball_insights vs
--         baseball_coach_insights); the other 3 name a real table that lacks
--         the column (2 distinct: baseball_event_acknowledgements has
--         acknowledged_at, baseball_demo_sessions has entered_at). So for the
--         large majority the remedy is a REGISTRY
--         TYPO FIX, not a schema change — recorded as debt with a drift guard
--         in src/test/lib/admin/feature-registry-heartbeats.test.ts. Four of
--         the ten tier-'high' baseball features are in this group
--         (baseball_coachhelm, baseball_command_center, baseball_lifting,
--         baseball_player_today), so they are NOT fixed by this migration.
--       - Of the 25 that CAN now resolve: 5 sit on empty tables (MAX is NULL,
--         no change), 5 are inside their threshold and stay green, and
--         15 are past it and move green -> amber on first run.
--
--     That is the defect being fixed, not a regression: those dots were green
--     because the signal was missing, not because it was good. Features with
--     no feature-tagged admin_events at all still hit the neutral-first rule
--     and never reach the heartbeat check, so this cannot manufacture amber
--     on a not-yet-instrumented feature.
--
--     `lift\_%` is deliberately NOT added. The registry has zero lift_*
--     heartbeat tables — baseball_lift_programs is the only lifting entry and
--     is already baseball-prefixed. Add the pattern in the same commit as the
--     first lift_* heartbeatTable, not before; an allowlist entry with no
--     caller is only attack surface on a dynamic-SQL path.
--
--     SEPARATE FINDING, surfaced by the same measurement and NOT addressed
--     here: `baseball_lift_programs` is CREATED by
--     20260624000063_baseball_v11_premium_lifting.sql:185 yet does not exist
--     in production (information_schema returns 0 rows) and is absent from
--     src/lib/types/database.ts. That is an unapplied migration or a partially
--     applied one, not a registry typo, and it needs its own investigation —
--     `schema_migrations` has recorded migrations as applied in this project
--     that never ran.

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

  -- Split from the length check so jsonb_array_length() is only ever called
  -- on a value already proven to be an array, and so the ceiling error can
  -- report the length that broke it.
  IF p_features IS NULL OR jsonb_typeof(p_features) <> 'array' THEN
    RAISE EXCEPTION 'p_features must be a jsonb array of feature descriptors';
  END IF;
  IF jsonb_array_length(p_features) > 500 THEN
    RAISE EXCEPTION 'p_features must be a jsonb array of <= 500 feature descriptors (got %)',
      jsonb_array_length(p_features);
  END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(p_features) LOOP
    v_key := f->>'key';
    CONTINUE WHEN v_key IS NULL OR length(v_key) > 64;

    -- Heartbeat: dynamic MAX(created_at) against a caller-supplied table name.
    -- HARD allowlist guard — never trust the jsonb input raw: the table must
    -- (a) match an approved prefix and (b) exist with a created_at column.
    -- The `\_` escapes are load-bearing: an unescaped `_` is a LIKE wildcard,
    -- so 'golf_%' would also admit e.g. 'golfXanything'.
    v_table := f->>'heartbeat_table';
    v_heartbeat := NULL;
    IF v_table IS NOT NULL
       AND (v_table LIKE 'golf\_%'
            OR v_table LIKE 'baseball\_%'
            OR v_table IN ('admin_events', 'error_logs'))
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

COMMENT ON FUNCTION public.get_feature_health(jsonb) IS
  'Helm Bridge feature-health rollup (W15). p_features: jsonb array of '
  '{"key","heartbeat_table"} descriptors, max 500 — built by rpcInput() in '
  'src/lib/admin/feature-registry.ts. heartbeat_table must be golf_*, '
  'baseball_*, admin_events or error_logs AND carry a created_at column; '
  'anything else resolves NULL, which makes the caller skip the staleness '
  'rule entirely rather than assume freshness.';

-- ── Safety rails (W3 pattern) ───────────────────────────────────────────────
-- CREATE OR REPLACE preserves the existing ACL, so this is a re-assertion
-- rather than a change. service_role is inert here by design: the internal
-- is_super_admin() gate reads auth.uid(), which is NULL under service_role, so
-- a service_role call still gets 42501 — and service_role can already read
-- admin_events directly, so nothing is widened.
REVOKE EXECUTE ON FUNCTION public.get_feature_health(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_feature_health(jsonb) TO authenticated, service_role;

DO $$
DECLARE
  v_fn oid;
  v_src text;
BEGIN
  SELECT p.oid, p.prosrc INTO v_fn, v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_feature_health';

  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'get_feature_health missing after replace';
  END IF;

  -- Both fixes actually landed in the stored body (a CREATE OR REPLACE that
  -- silently resolved to a different overload would otherwise pass unnoticed).
  IF strpos(v_src, 'jsonb_array_length(p_features) > 500') = 0 THEN
    RAISE EXCEPTION 'Ceiling check failed: get_feature_health still caps p_features below 500';
  END IF;
  IF strpos(v_src, 'baseball\_%') = 0 THEN
    RAISE EXCEPTION 'Allowlist check failed: get_feature_health still rejects baseball_* heartbeat tables';
  END IF;

  -- RPC ACL, unchanged from 20260702090000: anon must NOT execute; the
  -- super admin calls this with their own JWT, so authenticated must.
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: get_feature_health executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: get_feature_health missing authenticated EXECUTE';
  END IF;
END $$;
