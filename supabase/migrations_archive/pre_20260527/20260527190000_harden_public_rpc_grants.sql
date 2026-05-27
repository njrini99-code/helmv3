-- 20260527190000_harden_public_rpc_grants.sql
--
-- Codex Security finding (2026-05-27): four public SECURITY DEFINER RPCs ship
-- without explicit EXECUTE grants, so they default to PUBLIC — which in
-- Supabase means `anon` can call them over the PostgREST RPC endpoint using
-- the public anon key. None of them have a `search_path` lock, which leaves
-- room for schema-shadowing attacks via temp tables.
--
-- Functions affected:
--   - public.get_crm_coach_email_events(uuid)         -- CRM email metadata leak
--   - public.get_crm_email_stats_detailed()           -- CRM email metadata leak
--   - public.recalculate_baseball_season_stats(uuid,uuid,integer)  -- unauth stat writes
--   - public.recalculate_team_baseball_season_stats(uuid,integer)  -- unauth stat writes
--
-- Mitigations applied in this migration:
--   1. SET search_path = public, pg_temp on all 4 (defense-in-depth against
--      definer-context schema shadowing).
--   2. REVOKE EXECUTE FROM public, anon on all 4 (closes the anon attack
--      vector — the actual reachable threat).
--   3. CRM functions: REVOKE from authenticated too (no callers in src/);
--      GRANT only to service_role. Any admin UI calling these must use the
--      service-role client and gate at the API route level.
--   4. Baseball recalc functions: keep authenticated grant. They ARE called
--      from authenticated server actions (src/app/baseball/actions/games.ts
--      lines 558 and 1031), each behind a `verifyTeamAccess` app-layer check.
--      Adding a body-level `is_baseball_team_coach_v2` guard is the proper
--      follow-up (defense-in-depth), but rewriting the function body is
--      deferred to a separate PR with focused review.
--
-- References:
--   docs/security/CODEX_SECURITY_RELEASE_RESCUE_PLAN_2026-05-27.md  (Findings 2 + 3)
--   supabase/migrations/20260313000000_crm_enhancements.sql:93-155  (CRM RPC defs)
--   supabase/migrations/20260222200000_baseball_box_score_system.sql:314,491 (baseball RPC defs)
--
-- This migration is idempotent. Re-running it is a no-op.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '300s';

-- =========================================================================
-- 1. CRM RPCs — no callers in src/; lock down to service_role only.
-- =========================================================================

alter function public.get_crm_coach_email_events(uuid)
  set search_path = public, pg_temp;
revoke execute on function public.get_crm_coach_email_events(uuid) from public;
revoke execute on function public.get_crm_coach_email_events(uuid) from anon;
revoke execute on function public.get_crm_coach_email_events(uuid) from authenticated;
grant execute on function public.get_crm_coach_email_events(uuid) to service_role;

alter function public.get_crm_email_stats_detailed()
  set search_path = public, pg_temp;
revoke execute on function public.get_crm_email_stats_detailed() from public;
revoke execute on function public.get_crm_email_stats_detailed() from anon;
revoke execute on function public.get_crm_email_stats_detailed() from authenticated;
grant execute on function public.get_crm_email_stats_detailed() to service_role;

-- =========================================================================
-- 2. Baseball recalc RPCs — keep authenticated grant for existing callers;
--    revoke public/anon and set search_path.
-- =========================================================================

alter function public.recalculate_baseball_season_stats(uuid, uuid, integer)
  set search_path = public, pg_temp;
revoke execute on function public.recalculate_baseball_season_stats(uuid, uuid, integer) from public;
revoke execute on function public.recalculate_baseball_season_stats(uuid, uuid, integer) from anon;
-- Keep grant to authenticated; existing server-action callers run as authenticated.
-- TODO follow-up: add body-level is_baseball_team_coach_v2(p_team_id) guard.

alter function public.recalculate_team_baseball_season_stats(uuid, integer)
  set search_path = public, pg_temp;
revoke execute on function public.recalculate_team_baseball_season_stats(uuid, integer) from public;
revoke execute on function public.recalculate_team_baseball_season_stats(uuid, integer) from anon;
-- Keep grant to authenticated; same rationale.
-- TODO follow-up: add body-level is_baseball_team_coach_v2(p_team_id) guard.

commit;
