-- Feature Health RPC — stop counting resolved incidents as current instability.
--
-- Bridge audit 2026-08-21 (Calendar → calendar_events sample): the classifier
-- computed AMBER off 2 error fingerprints in the trailing 24h, with the
-- displayed reason text ("2 error fingerprint(s) in the last 24h.") reading
-- as an open problem. Both underlying admin_events rows are already
-- `resolved = true`. Root cause: `events_24h.errors` / `.fingerprints` and
-- the two 24h-ago comparison windows (`errors_prev_24h`, `fingerprints_prev_24h`)
-- never filtered on `resolved` — only `critical_unresolved` did.
--
-- FIX — filter the current-instability aggregates by `resolved IS NOT TRUE`:
--   * events_24h.errors, events_24h.fingerprints
--   * events_24h.rls_denials, events_24h.rls_denial_fingerprints,
--     events_24h.rls_denial_users (added for the same reason, even though a
--     live check found every rls_denial row in this database is resolved AND
--     none fall inside a 24h window today, so this is a no-op right now —
--     added for consistency with the errors/fingerprints treatment rather
--     than because current data needs it)
--   * errors_prev_24h, fingerprints_prev_24h (the trend comparison must use
--     the same definition of "current" as the window it's compared against,
--     or the delta itself is meaningless)
--
-- `resolved IS NOT TRUE`, not `NOT resolved`: `admin_events.resolved` is
-- nullable (0 nulls in production today, per information_schema — but a
-- FILTER (WHERE ... AND NOT resolved) silently drops a NULL row from the
-- count instead of treating "never marked resolved" as "still open", which
-- is the wrong default for an incident counter). `critical_unresolved`
-- already carries the unsafe `NOT resolved` idiom from 20260702090000 —
-- left as-is here (out of scope, not touched by this migration) rather than
-- silently changed underneath a field this migration doesn't claim to fix.
--
-- DELIBERATELY NOT FILTERED — `fingerprints_7d` and `events_24h.total`.
-- `fingerprints_7d` feeds `hasNoFeatureData` in feature-health.ts: filtering
-- it would flip a feature whose last problem was resolved days ago from
-- GREEN ("no signal, presumed healthy") to NEUTRAL ("no data at all") —
-- trading one inaccuracy for a worse one. `total` is a raw traffic count,
-- not an instability signal.
--
-- Everything else below is a verbatim copy of the 20260807020000 body so a
-- future reader diffing the two files sees exactly this one class of change.

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
          'errors',              count(*) FILTER (WHERE severity IN ('error','critical') AND resolved IS NOT TRUE),
          'critical_unresolved', count(*) FILTER (WHERE severity = 'critical' AND NOT resolved),
          'warnings',            count(*) FILTER (WHERE severity = 'warning' AND source <> 'rls_denial'),
          'fingerprints',        count(DISTINCT fingerprint) FILTER (WHERE severity IN ('error','critical') AND resolved IS NOT TRUE),
          'rls_denials',         count(*) FILTER (WHERE source = 'rls_denial' AND resolved IS NOT TRUE),
          'rls_denial_fingerprints', count(DISTINCT fingerprint) FILTER (WHERE source = 'rls_denial' AND resolved IS NOT TRUE),
          'rls_denial_users',    count(DISTINCT user_id) FILTER (WHERE source = 'rls_denial' AND resolved IS NOT TRUE)
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
          AND resolved IS NOT TRUE
          AND created_at >= now() - interval '48 hours'
          AND created_at <  now() - interval '24 hours'),
      'errors_prev_24h', (
        SELECT count(*)
        FROM public.admin_events
        WHERE feature = v_key
          AND severity IN ('error','critical')
          AND resolved IS NOT TRUE
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
  'freshness. events_24h.errors/.fingerprints/.rls_denials*, errors_prev_24h '
  'and fingerprints_prev_24h all exclude resolved=true rows (20260821050000) — '
  'fingerprints_7d and total deliberately do not, since fingerprints_7d feeds '
  'hasNoFeatureData and filtering it would misclassify a freshly-cleared '
  'feature as having no data at all.';

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
  v_resolved_filter_count int;
  v_marker_pos int;
BEGIN
  SELECT p.oid, p.prosrc INTO v_fn, v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_feature_health';

  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'get_feature_health missing after replace';
  END IF;

  -- ── Carried forward verbatim from 20260807020000, so a re-run of an older
  --    migration after this one cannot silently undo either fix. ──────────
  IF strpos(v_src, 'jsonb_array_length(p_features) > 500') = 0 THEN
    RAISE EXCEPTION 'Ceiling check failed: get_feature_health still caps p_features below 500';
  END IF;
  IF strpos(v_src, 'baseball\_%') = 0 THEN
    RAISE EXCEPTION 'Allowlist check failed: get_feature_health still rejects baseball_* heartbeat tables';
  END IF;
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

  -- ── This migration's own change ─────────────────────────────────────────
  -- An existence check (strpos(...) = 0) would pass vacuously: the OLD
  -- `critical_unresolved` field already contains the substring 'NOT resolved',
  -- and 'resolved' alone appears all over this function (top_signatures'
  -- `bool_and(resolved)`, the COMMENT text, etc). Count occurrences of the
  -- EXACT new filter clause instead, and require it once per field it must
  -- guard: events_24h.errors, .fingerprints, .rls_denials,
  -- .rls_denial_fingerprints, .rls_denial_users, errors_prev_24h,
  -- fingerprints_prev_24h = 7.
  v_resolved_filter_count :=
    (length(v_src) - length(replace(v_src, 'resolved IS NOT TRUE', ''))) / length('resolved IS NOT TRUE');
  IF v_resolved_filter_count <> 7 THEN
    RAISE EXCEPTION
      'Resolved-exclusion check failed: expected 7 occurrences of ''resolved IS NOT TRUE'' '
      '(events_24h.errors/.fingerprints/.rls_denials/.rls_denial_fingerprints/.rls_denial_users, '
      'errors_prev_24h, fingerprints_prev_24h), found %', v_resolved_filter_count;
  END IF;

  -- fingerprints_7d must stay UNFILTERED by resolved — it feeds
  -- hasNoFeatureData, and filtering it would flip a freshly-cleared feature
  -- from GREEN to NEUTRAL. Bound the substring scan to this field's own
  -- subquery (300 chars comfortably covers it) so a resolved-filter added
  -- somewhere ELSE in the function body can't false-positive this check.
  v_marker_pos := strpos(v_src, 'fingerprints_7d');
  IF v_marker_pos = 0 THEN
    RAISE EXCEPTION 'fingerprints_7d field missing from get_feature_health';
  END IF;
  IF position('resolved' in substr(v_src, v_marker_pos, 300)) > 0 THEN
    RAISE EXCEPTION 'fingerprints_7d must stay unfiltered by resolved (feeds hasNoFeatureData)';
  END IF;
END $guard$;
