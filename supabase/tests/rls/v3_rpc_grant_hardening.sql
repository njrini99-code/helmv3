-- pgTAP contracts for the v3 RPC grant hardening migration (20260606090000).
-- Asserts that the 5 trusted SECURITY DEFINER RPCs (re)created by the
-- 2026-06-05 prod DDL are locked down to service_role only.
--
-- Source: SEC-RLS-1 / SEC-RLS-2 in
--   docs/audits/COACHHELM_FULL_VALIDITY_AND_FACET_AUDIT_2026-06-06.md
--
-- The 2026-06-05 cohort + approach-proximity migrations left these executable
-- by anon / PUBLIC / authenticated (20260605130000_*.sql:138-140 GRANT ALL TO
-- anon; live ACL `=X` PUBLIC). Because they are SECURITY DEFINER owned by a
-- bypassrls role, that allowed unauthenticated RLS-bypassing recompute/DoS and
-- authenticated cache IDOR. If any of these assertions fail, a migration has
-- re-opened that surface. Treat as P0.

BEGIN;
\ir _helpers.sql

SELECT plan(20);

-- ============================================================================
-- refresh_player_standing(uuid[]) — service_role only.
-- ============================================================================

SELECT isnt(
  has_function_privilege('anon', 'public.refresh_player_standing(uuid[])', 'EXECUTE'),
  true,
  'anon cannot execute refresh_player_standing'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.refresh_player_standing(uuid[])', 'EXECUTE'),
  true,
  'authenticated cannot execute refresh_player_standing (cron uses service-role client)'
);

SELECT isnt(
  has_function_privilege('public', 'public.refresh_player_standing(uuid[])', 'EXECUTE'),
  true,
  'PUBLIC cannot execute refresh_player_standing'
);

SELECT ok(
  has_function_privilege('service_role', 'public.refresh_player_standing(uuid[])', 'EXECUTE'),
  'service_role can execute refresh_player_standing'
);

-- ============================================================================
-- refresh_player_standing_round_metrics(uuid[]) — service_role only.
-- ============================================================================

SELECT isnt(
  has_function_privilege('anon', 'public.refresh_player_standing_round_metrics(uuid[])', 'EXECUTE'),
  true,
  'anon cannot execute refresh_player_standing_round_metrics'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.refresh_player_standing_round_metrics(uuid[])', 'EXECUTE'),
  true,
  'authenticated cannot execute refresh_player_standing_round_metrics'
);

SELECT isnt(
  has_function_privilege('public', 'public.refresh_player_standing_round_metrics(uuid[])', 'EXECUTE'),
  true,
  'PUBLIC cannot execute refresh_player_standing_round_metrics'
);

SELECT ok(
  has_function_privilege('service_role', 'public.refresh_player_standing_round_metrics(uuid[])', 'EXECUTE'),
  'service_role can execute refresh_player_standing_round_metrics'
);

-- ============================================================================
-- refresh_player_standing_shot_metrics(uuid[]) — service_role only.
-- ============================================================================

SELECT isnt(
  has_function_privilege('anon', 'public.refresh_player_standing_shot_metrics(uuid[])', 'EXECUTE'),
  true,
  'anon cannot execute refresh_player_standing_shot_metrics'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.refresh_player_standing_shot_metrics(uuid[])', 'EXECUTE'),
  true,
  'authenticated cannot execute refresh_player_standing_shot_metrics'
);

SELECT isnt(
  has_function_privilege('public', 'public.refresh_player_standing_shot_metrics(uuid[])', 'EXECUTE'),
  true,
  'PUBLIC cannot execute refresh_player_standing_shot_metrics'
);

SELECT ok(
  has_function_privilege('service_role', 'public.refresh_player_standing_shot_metrics(uuid[])', 'EXECUTE'),
  'service_role can execute refresh_player_standing_shot_metrics'
);

-- ============================================================================
-- refresh_player_stats_cache(uuid) — service_role only.
-- (App callers run through createAdminClient(); see migration cross-file note.)
-- ============================================================================

SELECT isnt(
  has_function_privilege('anon', 'public.refresh_player_stats_cache(uuid)', 'EXECUTE'),
  true,
  'anon cannot execute refresh_player_stats_cache'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.refresh_player_stats_cache(uuid)', 'EXECUTE'),
  true,
  'authenticated cannot execute refresh_player_stats_cache (prevents cache IDOR)'
);

SELECT isnt(
  has_function_privilege('public', 'public.refresh_player_stats_cache(uuid)', 'EXECUTE'),
  true,
  'PUBLIC cannot execute refresh_player_stats_cache'
);

SELECT ok(
  has_function_privilege('service_role', 'public.refresh_player_stats_cache(uuid)', 'EXECUTE'),
  'service_role can execute refresh_player_stats_cache'
);

-- ============================================================================
-- mark_player_stats_stale(uuid) — service_role only.
-- ============================================================================

SELECT isnt(
  has_function_privilege('anon', 'public.mark_player_stats_stale(uuid)', 'EXECUTE'),
  true,
  'anon cannot execute mark_player_stats_stale'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.mark_player_stats_stale(uuid)', 'EXECUTE'),
  true,
  'authenticated cannot execute mark_player_stats_stale'
);

SELECT isnt(
  has_function_privilege('public', 'public.mark_player_stats_stale(uuid)', 'EXECUTE'),
  true,
  'PUBLIC cannot execute mark_player_stats_stale'
);

SELECT ok(
  has_function_privilege('service_role', 'public.mark_player_stats_stale(uuid)', 'EXECUTE'),
  'service_role can execute mark_player_stats_stale'
);

SELECT * FROM finish();
ROLLBACK;
