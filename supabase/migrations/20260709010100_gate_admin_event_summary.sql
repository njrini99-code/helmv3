-- ============================================================================
-- Migration: 20260709010100_gate_admin_event_summary.sql
-- Wave: W0b (Production-Readiness Mission, docs/audits/PRODUCTION_READINESS_MISSION_2026-07-09.md)
--
-- CONFIRMED P1 (DB fn), gap-fill fleet 2026-07-09:
--   get_admin_event_summary(int) has zero self-gating and EXECUTE granted to
--   PUBLIC/anon — gate + revoke.
--
-- CHECK-FIRST EVIDENCE (read-only SELECTs against LIVE prod, 2026-07-09, via
-- mcp__supabase__execute_sql — nothing applied to any DB by this file):
--
-- 1) Live function body (pg_get_functiondef), verbatim — reproduced in the
--    CREATE OR REPLACE below with NO logic changes other than the new gate
--    line and switching to SECURITY DEFINER (see rationale, point 4):
--      CREATE OR REPLACE FUNCTION public.get_admin_event_summary(p_days_back integer DEFAULT 7)
--       RETURNS jsonb LANGUAGE plpgsql STABLE
--       SET search_path TO 'public', 'pg_temp'
--      AS $function$ ... (totals/by_type/by_severity/by_day CTEs over
--      admin_events, unchanged) ... $function$
--
-- 2) Live grants (information_schema.role_table_grants... actually
--    routine_privileges), confirming the leak:
--      get_admin_event_summary | PUBLIC        | EXECUTE
--      get_admin_event_summary | anon          | EXECUTE
--      get_admin_event_summary | authenticated | EXECUTE
--      get_admin_event_summary | postgres      | EXECUTE
--      get_admin_event_summary | service_role  | EXECUTE
--    This function was covered by the 20260602165152 search_path hardening
--    migration's SET search_path loop (hence it already has
--    `SET search_path = public, pg_temp`), but it was NOT in that same
--    migration's separate REVOKE-from-PUBLIC/anon loop, which covered its 16
--    sibling admin rollup functions
--    (get_admin_analytics_rollup, get_admin_baseball_rollup,
--     get_admin_coachhelm_rollup, get_admin_dashboard_rollup,
--     get_admin_errors_rollup, get_admin_feature_adoption_rollup,
--     get_admin_rounds_rollup, get_admin_teams_scoring_rollup,
--     get_admin_users_rollup, __admin_rollup_b_gate, get_users_with_auth,
--     get_audit_log_recent, get_db_telemetry, get_platform_health_stats,
--     get_shot_data_quality, get_resend_activity_stats,
--     get_resend_domain_breakdown) — get_admin_event_summary is the gap.
--
-- 3) Sibling gate pattern (pg_get_functiondef, live), which every one of the
--    16 functions above uses and this migration now applies here too:
--      __admin_rollup_b_gate() — STABLE SECURITY DEFINER, SET search_path =
--        'public':
--        IF coalesce(auth.role(), '') = 'service_role' THEN RETURN; END IF;
--        IF NOT (public.is_super_admin()
--                OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid()
--                           AND role = 'admin'))
--        THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
--      e.g. get_admin_baseball_rollup's body opens with exactly
--        `PERFORM public.__admin_rollup_b_gate();`
--      before doing any work. This migration adds that identical line to
--      get_admin_event_summary.
--
-- 4) Why SECURITY DEFINER is added (the one structural change beyond the
--    gate line): admin_events has row-level RLS
--    ("Admins can read admin_events": authenticated role, qual = EXISTS
--    (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role =
--    'admin')). The gate helper __admin_rollup_b_gate() authorizes via
--    is_super_admin() (admin_allowlist table) OR users.role = 'admin' — two
--    different admin populations (see MEMORY.md "Admin: Bridge vs legacy
--    /golf/admin ... unreconciled populations"). Keeping this function
--    SECURITY INVOKER would mean a caller who passes the gate purely via
--    is_super_admin() (not users.role = 'admin') then hits admin_events' own
--    RLS and silently gets zero rows back — an inconsistent, confusing
--    under-share. Every sibling in point 3 that queries RLS-guarded tables
--    (get_admin_errors_rollup, get_admin_baseball_rollup, etc.) is already
--    STABLE SECURITY DEFINER for exactly this reason. Matching that shape
--    here keeps behavior consistent across the whole rollup family and
--    matches "the same admin gate its 16 siblings use" per the task
--    instruction, not just the gate call in isolation.
--
-- 5) Nested-call safety check: get_admin_errors_rollup (itself SECURITY
--    DEFINER + gated) calls `public.get_admin_event_summary(7)` inside a
--    BEGIN/EXCEPTION WHEN OTHERS block that already tolerates a thrown
--    error (falls back to v_admin_event_summary := NULL). Adding a gate
--    check inside get_admin_event_summary cannot break that caller: (a) the
--    outer caller already passed the same gate, so the same auth.uid() will
--    pass it again in the nested call (auth.uid()/auth.role() read the
--    request-level JWT/role, not the Postgres current_user, so they are
--    unaffected by the outer function's SECURITY DEFINER context); (b) even
--    in a hypothetical failure, the exception handler degrades gracefully
--    exactly as it does today for get_error_summary/get_audit_log_recent.
--
-- FIX: CREATE OR REPLACE with identical query logic, gate added as the first
-- statement, SECURITY DEFINER added, REVOKE EXECUTE FROM PUBLIC, anon;
-- GRANT EXECUTE TO authenticated, service_role (authenticated callers are
-- gated inside the body exactly like every sibling rollup RPC).
--
-- VERIFY AFTER APPLY (paste output in the PR/approval record):
--   select p.proname, p.prosecdef, pg_get_functiondef(p.oid) from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'get_admin_event_summary';
--   select grantee, privilege_type from information_schema.routine_privileges
--     where routine_schema='public' and routine_name='get_admin_event_summary';
--   -> grantee set must be exactly {authenticated, postgres, service_role}
--      EXECUTE — no PUBLIC, no anon.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_event_summary(p_days_back integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  cutoff timestamptz := now() - (p_days_back || ' days')::interval;
  result jsonb;
BEGIN
  -- Same admin gate as every other admin rollup RPC (get_admin_baseball_rollup,
  -- get_admin_errors_rollup, etc.) — service_role (cron/internal) passes
  -- through; otherwise caller must be is_super_admin() or users.role = 'admin'.
  PERFORM public.__admin_rollup_b_gate();

  WITH
    totals AS (
      SELECT
        count(*)                                                   AS total_events,
        count(*) FILTER (WHERE severity::text = 'error')           AS error_count,
        count(*) FILTER (WHERE severity::text = 'critical')        AS critical_count,
        count(*) FILTER (WHERE NOT resolved)                       AS unresolved_count
      FROM admin_events
      WHERE created_at >= cutoff
    ),
    by_type AS (
      SELECT coalesce(jsonb_object_agg(event_type, cnt), '{}'::jsonb) AS j
      FROM (
        SELECT event_type, count(*) AS cnt
        FROM admin_events
        WHERE created_at >= cutoff
        GROUP BY event_type
      ) t
    ),
    by_severity AS (
      SELECT coalesce(jsonb_object_agg(severity::text, cnt), '{}'::jsonb) AS j
      FROM (
        SELECT severity, count(*) AS cnt
        FROM admin_events
        WHERE created_at >= cutoff
        GROUP BY severity
      ) t
    ),
    by_day AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('date', d::text, 'count', coalesce(dc.cnt, 0))
          ORDER BY d
        ),
        '[]'::jsonb
      ) AS j
      FROM generate_series(cutoff::date, current_date, '1 day') d
      LEFT JOIN (
        SELECT created_at::date AS day, count(*) AS cnt
        FROM admin_events
        WHERE created_at >= cutoff
        GROUP BY 1
      ) dc ON dc.day = d
    )
  SELECT jsonb_build_object(
    'total_events',      totals.total_events,
    'error_count',       totals.error_count,
    'critical_count',    totals.critical_count,
    'unresolved_count',  totals.unresolved_count,
    'events_by_type',    by_type.j,
    'events_by_severity',by_severity.j,
    'events_by_day',     by_day.j
  )
  INTO result
  FROM totals, by_type, by_severity, by_day;

  RETURN result;
END;
$function$;

COMMENT ON FUNCTION public.get_admin_event_summary(integer) IS
  'Admin-only 7-day (default) admin_events rollup (totals/by_type/by_severity/by_day). Gated 2026-07-09 via __admin_rollup_b_gate() (service_role, is_super_admin(), or users.role = ''admin'') to match its 16 sibling admin rollup RPCs — previously had zero self-gating and EXECUTE granted to PUBLIC/anon. Consumed by get_admin_errors_rollup, itself gated.';

REVOKE EXECUTE ON FUNCTION public.get_admin_event_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_event_summary(integer) TO authenticated, service_role;

-- END — get_admin_event_summary gate. ADDITIVE. NOT applied to any DB by this file.
