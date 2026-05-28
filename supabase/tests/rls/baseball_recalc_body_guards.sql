-- pgTAP contracts for the baseball-recalc body-guard migration
-- (20260528000000_baseball_recalc_body_guards.sql).
--
-- Asserts that the two recalculate_*_baseball_season_stats RPCs:
--   1. still exist with SECURITY DEFINER + pinned search_path (PR #115 invariants)
--   2. reject non-coach authenticated callers at the body layer (this PR)
--   3. accept service_role for cron paths
--
-- Source: docs/operations/2026-05-27-baseball-tables-scope.md

BEGIN;
\i supabase/tests/rls/_helpers.sql

SELECT plan(8);

-- ============================================================================
-- Invariants from PR #115 — still in place after this migration.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'recalculate_baseball_season_stats'
      AND p.prosecdef = true
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ),
  'recalculate_baseball_season_stats is SECURITY DEFINER with pinned search_path'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'recalculate_team_baseball_season_stats'
      AND p.prosecdef = true
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ),
  'recalculate_team_baseball_season_stats is SECURITY DEFINER with pinned search_path'
);

SELECT isnt(
  has_function_privilege('anon', 'public.recalculate_baseball_season_stats(uuid,uuid,integer)', 'EXECUTE'),
  true,
  'anon still cannot execute recalculate_baseball_season_stats (PR #115 invariant)'
);

SELECT isnt(
  has_function_privilege('anon', 'public.recalculate_team_baseball_season_stats(uuid,integer)', 'EXECUTE'),
  true,
  'anon still cannot execute recalculate_team_baseball_season_stats (PR #115 invariant)'
);

-- ============================================================================
-- Body-guard behavior — non-coach authenticated caller rejected with 42501.
-- ============================================================================

-- Seed minimal data
DO $$
DECLARE
  v_user_id uuid := '00000000-0000-0000-0000-000000000aaa';
  v_team_id uuid := '00000000-0000-0000-0000-000000000bbb';
BEGIN
  INSERT INTO public.users (id, email)
    VALUES (v_user_id, 'noncoach@helm.test')
    ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, name, team_type, organization_id)
    VALUES (v_team_id, 'pgtap-team', 'college', NULL)
    ON CONFLICT DO NOTHING;
END $$;

-- Impersonate non-coach authenticated user
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000000aaa", "role": "authenticated"}';

SELECT throws_ok(
  $$ SELECT public.recalculate_baseball_season_stats(
       '00000000-0000-0000-0000-000000000ccc'::uuid,
       '00000000-0000-0000-0000-000000000bbb'::uuid,
       2026
     ) $$,
  '42501',
  'forbidden: caller is not a coach of team 00000000-0000-0000-0000-000000000bbb',
  'non-coach authenticated caller rejected with 42501 (per-player RPC)'
);

SELECT throws_ok(
  $$ SELECT public.recalculate_team_baseball_season_stats(
       '00000000-0000-0000-0000-000000000bbb'::uuid,
       2026
     ) $$,
  '42501',
  'forbidden: caller is not a coach of team 00000000-0000-0000-0000-000000000bbb',
  'non-coach authenticated caller rejected with 42501 (per-team RPC)'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- service_role still works (cron / admin paths).
-- ============================================================================

SET LOCAL role TO service_role;

SELECT lives_ok(
  $$ SELECT public.recalculate_team_baseball_season_stats(
       '00000000-0000-0000-0000-000000000bbb'::uuid,
       2026
     ) $$,
  'service_role can still execute per-team RPC (no completed games → no rows mutated)'
);

-- Confirm no rows were written for the synthetic team — the call should be a no-op
-- because baseball_team_members is empty for this team.
SELECT is(
  (SELECT COUNT(*)::int FROM public.baseball_player_season_stats WHERE team_id = '00000000-0000-0000-0000-000000000bbb'),
  0,
  'no aggregate rows written for empty synthetic team'
);

RESET role;

SELECT * FROM finish();
ROLLBACK;
