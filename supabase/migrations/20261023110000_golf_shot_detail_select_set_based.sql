-- STATUS: WRITTEN, NOT APPLIED.
-- Apply: npm run db:apply --
-- supabase/migrations/20261023110000_golf_shot_detail_select_set_based.sql
-- Risk: MEDIUM (SELECT RLS on putt_details and approach_miss_details). The
-- local-stack proof is supabase/tests/rls/golf_shot_detail_visibility.sql.
-- Independent of 20261023100000 (permissions tightening): neither file
-- touches the other's objects.
--
-- Why: putt_details_select and approach_miss_details_select call
-- can_read_golf_shot_detail(shot_id) per row. PostgREST embeds the two
-- tables as a LEFT JOIN LATERAL per shot, BEFORE the page's ORDER BY/LIMIT,
-- and fetchAllRowsResult re-runs the statement for every page, so each page
-- pays one function call per detail row of every matched shot. Each call
-- starts a fresh executor and rebuilds the helper lookups (~150-300 us).
-- Measured on production 2026-10-23 (EXPLAIN ANALYZE as a coach, whole
-- team, 24.6k shots, 10.4k putt rows): 5.9 s for one page, against 187 ms
-- without RLS.
--
-- What: each SELECT policy gains a set-based fast branch in front of the
-- unchanged function:
--
--   (shot's round, when its hole is in that same round)
--     IN (SELECT golf_shot_detail_round_ids())
--   OR can_read_golf_shot_detail(shot_id)
--
-- The fast branch reads golf_shots and golf_holes under the CALLER's RLS
-- (round_id IN golf_readable_round_ids(), or admin for golf_shots), and the
-- new set is computed once per statement and probed as a hash. Postgres
-- short-circuits the OR, so the per-row function only runs for rows the
-- fast branch does not grant.
--
-- Same access, by construction:
--   can_read_golf_shot_detail = A AND B, with
--   A: the shot's round is readable (own / coached team / active member),
--      or the hole's round is own or coached, or admin;
--   B: the hole's round belongs to my player, or to a player on a team in
--      an organization I coach in (any membership status).
--   golf_shot_detail_round_ids() is the rounds satisfying B that are also
--   readable to me (golf_readable_round_ids()), so calling it directly
--   reveals no round id the caller could not already read.
--   When the shot and its hole share round r, the fast branch needs the
--   shot visible to me (A for r) and r in B, so it grants nothing the
--   function would refuse. Every other row still goes to the function. The
--   policy is therefore fast OR function = function.
--   Legacy rows whose shot and hole rounds differ (production: 0 on
--   2026-10-23) and admins outside B keep exactly today's behaviour through
--   the function.
--
-- Everything runs in one DO block: the pre-flight check refuses an
-- unexpected policy set before anything changes, and the migration tool
-- already wraps the file in one transaction (no BEGIN/COMMIT here).
--
-- ROLLBACK: policy and function only, no data. Full capture with the live
-- ROLLBACK: prior definitions is in supabase/rollbacks/
-- ROLLBACK: 20261023110000_golf_shot_detail_select_set_based.rollback.sql.
-- ROLLBACK: In one transaction:
-- ROLLBACK:   ALTER POLICY putt_details_select ON public.putt_details
-- ROLLBACK:     USING (public.can_read_golf_shot_detail(shot_id));
-- ROLLBACK:   ALTER POLICY approach_miss_details_select
-- ROLLBACK:     ON public.approach_miss_details
-- ROLLBACK:     USING (public.can_read_golf_shot_detail(shot_id));
-- ROLLBACK:   DROP FUNCTION IF EXISTS public.golf_shot_detail_round_ids();
--
-- VERIFY: select 1 from pg_proc where oid =
-- VERIFY: 'public.golf_shot_detail_round_ids()'::regprocedure and prosecdef
-- VERIFY: and provolatile = 's' and proconfig =
-- VERIFY: array['search_path=pg_catalog, public, pg_temp'];
-- VERIFY: select 1 where has_function_privilege('authenticated',
-- VERIFY: 'public.golf_shot_detail_round_ids()', 'EXECUTE') and not
-- VERIFY: has_function_privilege('anon',
-- VERIFY: 'public.golf_shot_detail_round_ids()', 'EXECUTE');
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and
-- VERIFY: tablename = 'putt_details' and policyname = 'putt_details_select'
-- VERIFY: and qual like '%golf_shot_detail_round_ids()%' and qual like
-- VERIFY: '%can_read_golf_shot_detail(shot_id)%';
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and
-- VERIFY: tablename = 'approach_miss_details' and policyname =
-- VERIFY: 'approach_miss_details_select' and qual like
-- VERIFY: '%golf_shot_detail_round_ids()%' and qual like
-- VERIFY: '%can_read_golf_shot_detail(shot_id)%';
-- VERIFY: select 1 from pg_proc where oid =
-- VERIFY: 'public.can_read_golf_shot_detail(uuid)'::regprocedure and
-- VERIFY: procost = 10000;

DO $migration$
BEGIN
  -- Pre-flight: refuse to run against SELECT policies other than the ones
  -- this file was written for (production, read 2026-10-23).
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('putt_details', 'approach_miss_details')
        AND cmd = 'SELECT') <> 2
     OR EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('putt_details', 'approach_miss_details')
         AND cmd = 'SELECT'
         AND (policyname NOT IN ('putt_details_select',
                                 'approach_miss_details_select')
              OR qual IS DISTINCT FROM 'can_read_golf_shot_detail(shot_id)')
     )
  THEN
    RAISE EXCEPTION 'putt_details/approach_miss_details SELECT policies '
      'differ from the expected set; refusing to rewrite';
  END IF;

  -- COUPLING: this function restates conjunct B of
  -- can_read_golf_shot_detail (the hole round's player is mine, or is on a
  -- team in an organization I coach in). Change both together;
  -- golf_shot_detail_visibility.sql fails if they disagree for its
  -- personas. It is limited to rounds the caller can already read, because
  -- PostgREST exposes it as an RPC: B alone would list round ids of an
  -- organization's players to a coach who does not staff their team.
  CREATE OR REPLACE FUNCTION public.golf_shot_detail_round_ids()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  -- Unindented on purpose: the semgrep search_path rule only pairs a
  -- SECURITY DEFINER line with its SET search_path when the line starts
  -- with it.
SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $function$
    SELECT gr.id
    FROM public.golf_rounds gr
    WHERE gr.id IN (SELECT public.golf_readable_round_ids())
      AND (
        gr.player_id IN (
          SELECT gp.id
          FROM public.golf_players gp
          WHERE gp.user_id = (SELECT auth.uid())
        )
        OR gr.player_id IN (
          SELECT gtm.player_id
          FROM public.golf_team_members gtm
          JOIN public.golf_teams gt ON gt.id = gtm.team_id
          JOIN public.golf_coaches gc
            ON gc.organization_id = gt.organization_id
          WHERE gc.user_id = (SELECT auth.uid())
        )
      );
  $function$;

  COMMENT ON FUNCTION public.golf_shot_detail_round_ids() IS
    'Readable rounds whose shot details I may read on the coach/owner '
    'side (conjunct B of can_read_golf_shot_detail). Used once per '
    'statement by the putt_details and approach_miss_details SELECT '
    'policies.';

  REVOKE ALL ON FUNCTION public.golf_shot_detail_round_ids()
    FROM public, anon;
  GRANT EXECUTE ON FUNCTION public.golf_shot_detail_round_ids()
    TO authenticated, service_role;

  -- The scalar subquery under an OR keeps the planner from turning the IN
  -- into a per-row semi-join: it becomes one hashed SubPlan per statement.
  ALTER POLICY putt_details_select ON public.putt_details
  USING (
    (
      SELECT gs.round_id
      FROM public.golf_shots gs
      JOIN public.golf_holes gh
        ON gh.id = gs.hole_id AND gh.round_id = gs.round_id
      WHERE gs.id = putt_details.shot_id
    ) IN (SELECT public.golf_shot_detail_round_ids())
    OR public.can_read_golf_shot_detail(shot_id)
  );

  ALTER POLICY approach_miss_details_select ON public.approach_miss_details
  USING (
    (
      SELECT gs.round_id
      FROM public.golf_shots gs
      JOIN public.golf_holes gh
        ON gh.id = gs.hole_id AND gh.round_id = gs.round_id
      WHERE gs.id = approach_miss_details.shot_id
    ) IN (SELECT public.golf_shot_detail_round_ids())
    OR public.can_read_golf_shot_detail(shot_id)
  );
END
$migration$;
