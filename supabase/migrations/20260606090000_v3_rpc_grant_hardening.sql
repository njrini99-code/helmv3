-- =============================================================================
-- v3 RPC grant hardening (SEC-RLS-1 / SEC-RLS-2) — 2026-06-06
--
-- Closes a security regression introduced by the 2026-06-05 prod DDL
-- (20260605120000_v3_cohort_population_baseline.sql,
--  20260605130000_v3_approach_proximity_standing.sql). Those migrations
-- (re)created five trusted SECURITY DEFINER RPCs and left them executable by
-- anon / PUBLIC / authenticated — `20260605130000_*.sql:138-140` explicitly
-- `GRANT ALL … TO anon`, and the cohort migration left the default PUBLIC
-- grant in place. Live ACL on prod is `=X/postgres` (PUBLIC) plus anon=X /
-- authenticated=X on all five. Because they are SECURITY DEFINER owned by a
-- bypassrls superuser, an unauthenticated caller could invoke them through
-- PostgREST (POST /rest/v1/rpc/refresh_player_standing with the public anon
-- key) to trigger RLS-bypassing recomputes/DoS, and a logged-in non-admin
-- could recompute an arbitrary player's stats cache (IDOR).
--
-- Every legitimate caller already runs through the service-role client:
--   * refresh_player_standing / _round_metrics / _shot_metrics — invoked by
--     the v3 standing cron routes via createAdminClient()
--     (src/app/api/cron/v3/standing-{refresh,backfill}/route.ts).
--   * refresh_player_stats_cache / mark_player_stats_stale — invoked by the
--     round-completion repair path via createAdminClient()
--     (golf-stats-calculator.ts invalidateOnRoundComplete) and the admin
--     tracer tools (admin-tracer-data.ts).
--
-- Fix (P0): mirror the lockdown pattern of 20260602165152 — REVOKE EXECUTE
-- from PUBLIC, anon, authenticated; GRANT EXECUTE to service_role only.
-- service_role-only (stricter than the 20260602165152 admin set, which kept
-- authenticated) because none of these five are called on a user session in
-- the intended design.
--
-- CROSS-FILE DEPENDENCY (owned by app-code owner, NOT changed here):
--   src/lib/cache/golf-stats-calculator.ts currently calls
--   refresh_player_stats_cache (refreshStatsCache, ~line 277) and
--   mark_player_stats_stale (markStatsStale, ~line 310) through the
--   user-session client `await createClient()`. After this migration those two
--   wrappers MUST switch to createAdminClient() or they will fail with
--   "permission denied for function" for logged-in users. invalidateOnRoundComplete
--   (the primary post-round path) already uses createAdminClient(), so it is unaffected.
--
-- All statements are idempotent (REVOKE/GRANT are repeatable; the loop only
-- touches functions that exist).
-- =============================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (p.proname, pg_get_function_identity_arguments(p.oid)) IN (
        ('refresh_player_standing',              'p_team_ids uuid[]'),
        ('refresh_player_standing_round_metrics','p_team_ids uuid[]'),
        ('refresh_player_standing_shot_metrics', 'p_team_ids uuid[]'),
        ('refresh_player_stats_cache',           'p_player_id uuid'),
        ('mark_player_stats_stale',              'p_player_id uuid')
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', r.sig);
  END LOOP;
END $$;
