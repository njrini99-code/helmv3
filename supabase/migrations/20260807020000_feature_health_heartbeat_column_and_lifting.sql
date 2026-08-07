-- Feature Health RPC — let a heartbeat name its own timestamp column, and
-- admit the unified lifting tables.
--
-- Follow-up to 20260806030000, which taught this function to accept
-- `baseball\_%` heartbeats. Sizing that change surfaced that 18 of the 43
-- baseball features named a heartbeat the RPC could never resolve. 15 were
-- registry typos (fixed in the same commit as this migration, in
-- src/lib/admin/feature-registry.ts, each repointed to the table that
-- feature's OWN server actions actually write). The remaining 3 could not be
-- fixed in the registry alone, and are what this migration is for.
--
-- (a) HEARTBEAT COLUMN. The gate hard-coded `column_name = 'created_at'`, so a
--     table whose activity timestamp is named anything else was unreachable —
--     it resolved NULL, which makes computeFeatureStatus() skip the staleness
--     rule entirely (feature-health.ts:214) and the feature can never go amber.
--     Three features are in that position, and for all three the differently
--     named column IS the activity:
--       baseball_command_center -> baseball_event_acknowledgements.acknowledged_at
--       baseball_demo_access    -> baseball_demo_sessions.entered_at
--       baseball_demo_tracking  -> baseball_demo_sessions.entered_at
--     Repointing them at some other table with a created_at would have been
--     the smaller change and the wrong one: it measures a different feature.
--     `baseball_events.created_at` is calendar activity, not command-centre use.
--
--     Descriptors may now carry an optional `heartbeat_column`, defaulting to
--     'created_at' so every existing descriptor behaves identically.
--
--     SAFETY — this does NOT widen the injection surface. The column name is
--     subject to the SAME information_schema EXISTS gate the table name has
--     always been (it must be a real column of that already-allowlisted table
--     in the public schema), and is interpolated with %I exactly as the table
--     name is. An input that is not a real column of a real allowlisted table
--     fails the gate and resolves NULL, which is the existing no-signal path.
--     information_schema.columns is itself privilege-filtered, so the gate can
--     only pass for something the definer can actually read.
--
-- (b) helm_lifting_ ALLOWLIST. 20260806030000 deliberately withheld a lifting
--     prefix, on the rule that "an allowlist entry with no caller is only
--     attack surface." This is the commit that supplies the caller.
--
--     `baseball_lifting` (tier 'high') pointed at `baseball_lift_programs`,
--     which does not exist. Verified against production: ZERO
--     `baseball_lift_*` and ZERO `baseball_strength_*` tables exist, while 33
--     `helm_lifting_*` tables do. 20260624000063_baseball_v11_premium_lifting
--     is RECORDED as applied and creates ~20 of that retired family — so the
--     answer was never to re-run it (that would create 20 dead tables) but to
--     recognise the family was superseded by the cross-sport helm_lifting_*
--     model. Every remaining reference to `baseball_lift_*` in src/ is a
--     comment or a test asserting nothing writes there, and the three baseball
--     lifting action files write helm_lifting_sessions / _session_exercises /
--     _days / _group_members. The feature is repointed at
--     helm_lifting_sessions (last write 2026-07-04), which needs this prefix.
--
--     Deliberately `helm\_lifting\_%`, not `helm\_%`: the narrower pattern is
--     the one with a caller.
--
-- Everything else below is a verbatim copy of the 20260806030000 body so a
-- future reader diffing the two files sees exactly these two changes.

CREATE OR REPLACE FUNCTION public.get_feature_health(p_features jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
DECLARE
  v_result jsonb := '[]'::jsonb;
  f jsonb;
  v_key text;
  v_table text;
  v_col text;
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

    -- Heartbeat: dynamic MAX(<column>) against a caller-supplied table name.
    -- HARD allowlist guard — never trust the jsonb input raw: the table must
    -- (a) match an approved prefix and (b) exist WITH THAT COLUMN.
    -- The `\_` escapes are load-bearing: an unescaped `_` is a LIKE wildcard,
    -- so 'golf_%' would also admit e.g. 'golfXanything'.
    v_table := f->>'heartbeat_table';
    -- Defaults to created_at, so a descriptor that omits it is unchanged.
    v_col := COALESCE(f->>'heartbeat_column', 'created_at');
    v_heartbeat := NULL;
    IF v_table IS NOT NULL
       AND length(v_col) <= 63
       AND (v_table LIKE 'golf\_%'
            OR v_table LIKE 'baseball\_%'
            OR v_table LIKE 'helm\_lifting\_%'
            OR v_table IN ('admin_events', 'error_logs'))
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = v_table
           AND column_name = v_col)
    THEN
      EXECUTE format('SELECT max(%I) FROM public.%I', v_col, v_table)
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
$fn$;

COMMENT ON FUNCTION public.get_feature_health(jsonb) IS
  'Helm Bridge feature-health rollup (W15). p_features: jsonb array of '
  '{"key","heartbeat_table","heartbeat_column"} descriptors, max 500 — built '
  'by rpcInput() in src/lib/admin/feature-registry.ts. heartbeat_table must be '
  'golf_*, baseball_*, helm_lifting_*, admin_events or error_logs AND actually '
  'carry heartbeat_column (default created_at); anything else resolves NULL, '
  'which makes the caller skip the staleness rule entirely rather than assume '
  'freshness.';

-- ── Safety rails (W3 pattern) ───────────────────────────────────────────────
-- CREATE OR REPLACE preserves the existing ACL, so this is a re-assertion
-- rather than a change. service_role is inert here by design: the internal
-- is_super_admin() gate reads auth.uid(), which is NULL under service_role, so
-- a service_role call still gets 42501.
REVOKE EXECUTE ON FUNCTION public.get_feature_health(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_feature_health(jsonb) TO authenticated, service_role;

DO $guard$
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

  -- Carried forward from 20260806030000 so a re-run of THAT file after this
  -- one cannot silently undo it.
  IF strpos(v_src, 'jsonb_array_length(p_features) > 500') = 0 THEN
    RAISE EXCEPTION 'Ceiling check failed: get_feature_health still caps p_features below 500';
  END IF;
  IF strpos(v_src, 'baseball\_%') = 0 THEN
    RAISE EXCEPTION 'Allowlist check failed: get_feature_health still rejects baseball_* heartbeat tables';
  END IF;

  -- This migration's own two changes.
  IF strpos(v_src, 'helm\_lifting\_%') = 0 THEN
    RAISE EXCEPTION 'Allowlist check failed: get_feature_health still rejects helm_lifting_* heartbeat tables';
  END IF;
  IF strpos(v_src, 'heartbeat_column') = 0 THEN
    RAISE EXCEPTION 'Column check failed: get_feature_health does not read heartbeat_column';
  END IF;
  -- The column must stay inside the EXISTS gate; a %I interpolation with no
  -- information_schema check would be the one genuinely unsafe shape here.
  IF strpos(v_src, 'AND column_name = v_col') = 0 THEN
    RAISE EXCEPTION 'Safety check failed: heartbeat_column is not validated against information_schema';
  END IF;

  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: get_feature_health executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: get_feature_health missing authenticated EXECUTE';
  END IF;
END $guard$;
