-- Migration: harden SECDEF functions with explicit search_path
--
-- CLAUDE.md rule #6 requires every elevated-privilege function (i.e.
-- one that runs with the definer's rights rather than the caller's)
-- to pin search_path to prevent search-path hijacking that would turn
-- RLS into a one-step privilege escalation.
--
-- These functions shipped without the clause. Rather than editing the
-- 17 original migrations (would break Supabase's content-hash migration
-- tracking — `supabase migration repair` is not an option for migrations
-- already applied across dev/staging/prod), we ALTER them in-place here.
-- ALTER FUNCTION ... SET search_path applies at every call without
-- rewriting the function body.
--
-- DEFENSE IN DEPTH: A prior sweep (20260523200000_coachhelm_p0_sweep.sql)
-- ALTERed 3 functions (get_my_coach_id, is_baseball_primary_coach,
-- is_baseball_team_coach(team_uuid)). Re-applying them here is
-- idempotent and survives a future `supabase db reset` that replays
-- migrations in order without the prior sweep.
--
-- AFTER THIS MIGRATION runs against the live database:
--   * Every elevated-privilege function in the project pins search_path
--     to `pg_catalog, public` at call time.
--   * Note: semgrep `helmv3-security-definer-without-search-path`
--     findings on the ORIGINAL source migrations remain — semgrep is
--     file-scoped and cannot see this ALTER. To silence the rule
--     entirely the original migrations would need editing, which is
--     forbidden by Supabase's migration content-hash tracking.
--
-- ROLLBACK: each ALTER FUNCTION below can be reverted with
--   ALTER FUNCTION <name>(<args>) RESET search_path;
--
-- VERIFIED 2026-05-27 — finding list at /tmp/security-definer-findings.txt
-- All 31 unique function signatures derived from the LATEST CREATE FUNCTION
-- in the supabase/migrations/ tree (timestamp-prefixed files only;
-- legacy 0XX_*.sql files are out of semgrep scope per .coderabbit/semgrep/
-- helmv3.yml exclude pattern).

-- Baseball RLS helpers (from 20260125000000_fix_baseball_rls_comprehensive.sql)
ALTER FUNCTION public.is_baseball_team_coach(uuid)
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.is_baseball_team_member(uuid)
  SET search_path = 'pg_catalog, public';

-- User presence (from 20260205100000_add_user_presence.sql)
ALTER FUNCTION public.heartbeat()
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.update_user_presence(uuid)
  SET search_path = 'pg_catalog, public';

-- Admin bypass helper (from 20260209100000_add_admin_read_bypass_rls.sql)
ALTER FUNCTION public.is_admin()
  SET search_path = 'pg_catalog, public';

-- CRM coaches (from 20260214200000_create_crm_coaches.sql)
ALTER FUNCTION public.get_crm_pipeline_summary()
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.log_coach_contact(
  uuid, contact_type, text, text, timestamptz, coach_status
) SET search_path = 'pg_catalog, public';

-- CRM events (from 20260214210000_create_crm_events.sql)
ALTER FUNCTION public.create_crm_event_with_update(
  text, crm_event_type, timestamptz, timestamptz,
  uuid, text, text, text, boolean
) SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.get_coach_upcoming_events(uuid, integer)
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.get_crm_events_in_range(timestamptz, timestamptz)
  SET search_path = 'pg_catalog, public';

-- Admin events (from 20260214220000_create_admin_events.sql)
ALTER FUNCTION public.get_admin_event_summary(integer)
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.log_admin_event(
  text, text, admin_event_severity, text, jsonb,
  uuid, text, text, text, jsonb
) SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.resolve_admin_event(uuid, uuid)
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.resolve_admin_events_by_type(text, uuid)
  SET search_path = 'pg_catalog, public';

-- Admin RPCs (from 20260214230000_create_admin_rpc_functions.sql)
ALTER FUNCTION public.get_audit_log_recent(integer)
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.get_error_summary(integer)
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.get_platform_health_stats()
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.get_users_with_auth()
  SET search_path = 'pg_catalog, public';

-- Auth rate limits (from 20260222100000_create_auth_rate_limits.sql)
ALTER FUNCTION public.cleanup_expired_rate_limits()
  SET search_path = 'pg_catalog, public';

-- Head-coach RLS fix (from 20260222120000_fix_head_coach_id_rls.sql)
-- NOTE: is_baseball_primary_coach was previously ALTERed in
-- 20260523200000_coachhelm_p0_sweep.sql line 234. Re-applying is
-- idempotent — last ALTER wins.
ALTER FUNCTION public.get_my_baseball_conversation_ids()
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.is_baseball_primary_coach(uuid)
  SET search_path = 'pg_catalog, public';

-- Emergency RLS fix v2 (from 20260222140000_emergency_rls_fix_v2.sql)
-- NOTE: get_my_coach_id was previously ALTERed in
-- 20260523200000_coachhelm_p0_sweep.sql line 233. Re-applying is
-- idempotent — last ALTER wins.
ALTER FUNCTION public.get_my_coach_id()
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.get_my_player_id()
  SET search_path = 'pg_catalog, public';

-- Baseball box-score system (from 20260222200000_baseball_box_score_system.sql)
ALTER FUNCTION public.is_baseball_team_coach_v2(uuid)
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.is_baseball_team_member_v2(uuid)
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.recalculate_baseball_season_stats(uuid, uuid, integer)
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.recalculate_team_baseball_season_stats(uuid, integer)
  SET search_path = 'pg_catalog, public';

-- Stats-cache refresh (from 20260310220000_fix_driving_distance_avg.sql)
ALTER FUNCTION public.update_round_stats_cache()
  SET search_path = 'pg_catalog, public';

-- Stats-cache refresh (from 20260312040122_fix_18_hole_stats_cache.sql)
-- NOTE: update_player_stats_cache was previously ALTERed in
-- 20260523200000_coachhelm_p0_sweep.sql. Re-applying is idempotent.
ALTER FUNCTION public.update_player_stats_cache()
  SET search_path = 'pg_catalog, public';

-- CRM enhancements (from 20260313000000_crm_enhancements.sql)
ALTER FUNCTION public.get_crm_coach_email_events(uuid)
  SET search_path = 'pg_catalog, public';
ALTER FUNCTION public.get_crm_email_stats_detailed()
  SET search_path = 'pg_catalog, public';

-- End of migration.
-- Unique ALTERs applied: 31
