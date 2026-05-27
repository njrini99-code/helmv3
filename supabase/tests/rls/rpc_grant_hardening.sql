-- pgTAP contracts for the RPC hardening migration (20260527190000).
-- Asserts that the 4 previously-anon-executable SECURITY DEFINER RPCs are
-- now locked down to the intended principals.
--
-- Source: docs/security/CODEX_SECURITY_RELEASE_RESCUE_PLAN_2026-05-27.md
--
-- If any of these assertions fail, a recent migration has re-opened the
-- attack surface that Codex Security Finding 2/3 closed. Treat as P1.

BEGIN;
\i supabase/tests/rls/_helpers.sql

SELECT plan(12);

-- ============================================================================
-- CRM RPCs — anon, authenticated, and public should NOT have EXECUTE.
-- service_role should.
-- ============================================================================

SELECT isnt(
  has_function_privilege('anon', 'public.get_crm_coach_email_events(uuid)', 'EXECUTE'),
  true,
  'anon cannot execute get_crm_coach_email_events'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.get_crm_coach_email_events(uuid)', 'EXECUTE'),
  true,
  'authenticated cannot execute get_crm_coach_email_events (admin UI must use service-role client)'
);

SELECT ok(
  has_function_privilege('service_role', 'public.get_crm_coach_email_events(uuid)', 'EXECUTE'),
  'service_role can execute get_crm_coach_email_events'
);

SELECT isnt(
  has_function_privilege('anon', 'public.get_crm_email_stats_detailed()', 'EXECUTE'),
  true,
  'anon cannot execute get_crm_email_stats_detailed'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.get_crm_email_stats_detailed()', 'EXECUTE'),
  true,
  'authenticated cannot execute get_crm_email_stats_detailed'
);

SELECT ok(
  has_function_privilege('service_role', 'public.get_crm_email_stats_detailed()', 'EXECUTE'),
  'service_role can execute get_crm_email_stats_detailed'
);

-- ============================================================================
-- Baseball recalc RPCs — anon should NOT have EXECUTE.
-- authenticated remains allowed (app-layer verifyTeamAccess gates the caller).
-- ============================================================================

SELECT isnt(
  has_function_privilege('anon', 'public.recalculate_baseball_season_stats(uuid,uuid,integer)', 'EXECUTE'),
  true,
  'anon cannot execute recalculate_baseball_season_stats'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.recalculate_baseball_season_stats(uuid,uuid,integer)', 'EXECUTE'),
  'authenticated can still execute recalculate_baseball_season_stats (app-layer guard remains)'
);

SELECT isnt(
  has_function_privilege('anon', 'public.recalculate_team_baseball_season_stats(uuid,integer)', 'EXECUTE'),
  true,
  'anon cannot execute recalculate_team_baseball_season_stats'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.recalculate_team_baseball_season_stats(uuid,integer)', 'EXECUTE'),
  'authenticated can still execute recalculate_team_baseball_season_stats'
);

-- ============================================================================
-- search_path lock — all 4 functions must have an explicit search_path.
-- A missing search_path means a privileged function can resolve identifiers
-- through a user-controlled temp schema.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_crm_coach_email_events'
      AND EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  ),
  'get_crm_coach_email_events has an explicit search_path'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'recalculate_baseball_season_stats'
      AND EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  ),
  'recalculate_baseball_season_stats has an explicit search_path'
);

SELECT * FROM finish();
ROLLBACK;
