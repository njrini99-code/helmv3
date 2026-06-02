-- =============================================================================
-- Security hardening (Supabase advisor remediation) — 2026-06-02
--
-- Applied to production via MCP apply_migration (version 20260602165152); this
-- file mirrors it for repo/prod parity. All statements are idempotent.
--
-- (1) function_search_path_mutable (lint 0011): pin search_path on 21 functions
--     that lacked it. Every cross-schema reference in these bodies is already
--     schema-qualified (auth.uid(), extensions.hypopg_reset()) and every
--     unqualified reference is a public object — including the `::citext` cast
--     in write_suppression_on_unsubscribe, whose type lives in public — so
--     `search_path = public, pg_temp` is behavior-preserving.
--
-- (2) anon_security_definer_function_executable (lint 0028): admin/telemetry
--     SECURITY DEFINER functions were executable by anon via the default PUBLIC
--     grant, so they could be invoked UNAUTHENTICATED through PostgREST
--     (e.g. POST /rest/v1/rpc/get_users_with_auth with the public anon key
--     returned users + auth PII). Remove PUBLIC/anon EXECUTE; keep authenticated
--     + service_role so both app call paths (user-session admin actions, which
--     already gate on role='admin', and service-role admin actions) keep
--     working.
--
-- NOTE (follow-up, intentionally NOT in this migration): a logged-in non-admin
-- can still call some of these directly via PostgREST (authenticated retains
-- EXECUTE). Closing that requires per-function work — revoke `authenticated`
-- on the service-role-only functions, and add an inline `is_admin()` gate to
-- the user-session ones (e.g. get_users_with_auth). Those callers are invoked
-- dynamically (rpc(name)) so the client must be traced per function before
-- changing grants/bodies; deferred to avoid breaking the admin dashboard.
-- =============================================================================

-- (1) search_path pin --------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_admin_event_summary','get_api_performance_summary','get_enhanced_system_health',
        'get_error_summary','get_my_baseball_conversation_ids','get_my_player_id',
        'get_onboarding_funnel_analysis','get_team_health_dashboard','get_user_engagement_summary',
        'hypopg_reset','is_baseball_team_coach_v2','is_baseball_team_member_v2','stop_sequences_on_reply',
        'update_crm_automations_updated_at','update_crm_notes_updated_at','update_crm_segments_updated_at',
        'update_crm_sequences_updated_at','update_crm_tasks_updated_at','update_device_tokens_updated_at',
        'update_golf_task_reminders_updated_at','write_suppression_on_unsubscribe'
      )
      AND (p.proconfig IS NULL
           OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp;', r.sig);
  END LOOP;
END $$;

-- (2) revoke anon/PUBLIC on admin + telemetry functions ----------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'get_admin_analytics_rollup','get_admin_baseball_rollup','get_admin_coachhelm_rollup',
        'get_admin_dashboard_rollup','get_admin_errors_rollup','get_admin_feature_adoption_rollup',
        'get_admin_rounds_rollup','get_admin_teams_scoring_rollup','get_admin_users_rollup',
        '__admin_rollup_b_gate','get_users_with_auth','get_audit_log_recent','get_db_telemetry',
        'get_platform_health_stats','get_shot_data_quality','get_resend_activity_stats',
        'get_resend_domain_breakdown'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', r.sig);
  END LOOP;
END $$;
