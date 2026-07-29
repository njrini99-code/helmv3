-- ============================================================================
-- 20260729180000_golf_shot_detail_rls_correlated.sql
--
-- putt_details / approach_miss_details: make the SELECT policies correlated, so
-- reading one round's shot details stops materializing every shot id visible to
-- the caller across their entire organization.
--
-- ⚠️ NOT APPLIED BY THIS FILE. See "WHY THIS IS NOT APPLIED YET" at the bottom.
--
-- THE PROBLEM, MEASURED (not inferred)
-- ----------------------------------------------------------------------------
-- Each table carries TWO permissive SELECT policies, `_select_own` and
-- `_select_team`, and both are shaped:
--
--     shot_id IN (SELECT gs.id FROM golf_shots gs JOIN golf_holes … JOIN
--                 golf_rounds … JOIN golf_players … [JOIN golf_team_members …
--                 JOIN golf_teams … JOIN golf_coaches …]
--                 WHERE gp.user_id = auth.uid())
--
-- The subquery does not reference the outer row. It is uncorrelated, so
-- Postgres cannot push the outer `shot_id` down into it and instead builds the
-- COMPLETE set of visible shot ids — a four-table join for `_own`, a
-- SEVEN-table join for `_team` — before it can test a single detail row. Both
-- run, because permissive policies are OR'd.
--
-- Measured against production 2026-07-29 as a real coach (role impersonation:
-- SET LOCAL ROLE authenticated + request.jwt.claims), selecting putt_details
-- for 500 shots:
--
--     Execution Time      3413 ms      <- returning ZERO rows
--     Planning Time        145 ms
--     Buffers         367,710 hit
--     of which, the putt_details scan alone:
--                         2334 ms, 288,084 buffers
--     Filter: (ANY (shot_id = (hashed SubPlan 119).col1))
--          OR (ANY (shot_id = (hashed SubPlan 233).col1))
--
-- Two hashed subplans, one per policy, each materialized in full.
--
-- WHY IT MATTERS BEYOND LATENCY. fetchShotDriversByCategory
-- (src/app/golf/actions/insight-delivery.ts) runs under a 5-second budget and
-- aborts it roughly 34 times a week, after which insights are generated with no
-- shot drivers at all — silently, because the abort is caught. A single
-- embedded read of this table costs 3.4s of that 5s budget on its own.
--
-- The comment previously above that call site blamed "the unordered, high-cap,
-- joined golf_shots scan". That was wrong and instructively so: the golf_rounds
-- + golf_shots read measures 68ms with an Index Only Scan. The cost is the RLS
-- on the two EMBEDDED tables — invisible to a service-role EXPLAIN, which
-- bypasses RLS entirely, i.e. invisible to exactly the tool you would reach for.
--
-- THE FIX
-- ----------------------------------------------------------------------------
-- One SECURITY DEFINER helper, taking the shot id as an ARGUMENT so the
-- predicate is correlated per row, and replacing both policies with a single
-- call to it.
--
-- Two independent wins, and it is worth separating them because only the first
-- is obvious:
--
--   1. CORRELATION. `can_view_golf_shot(shot_id)` is evaluated per candidate
--      row against an index, instead of building the whole visible set once.
--
--   2. DEFINER. The inline subquery is not a definer function, so its reads of
--      golf_shots / golf_holes / golf_rounds / golf_players are THEMSELVES
--      filtered by those tables' own policies — which are layered and call
--      is_golf_team_coach() / is_golf_team_player() / is_admin() per row. That
--      nested policy evaluation is most of the 288,084 buffers. Running the
--      lookup under definer rights skips all four.
--
-- Merging `_own` and `_select_team` into one policy is not a scope change:
-- permissive policies are OR'd, so `A OR B` as two policies and `A OR B` inside
-- one function admit exactly the same rows. The function body preserves both
-- branches verbatim.
--
-- MEASURED AFTER (same query, same coach, applied inside a rolled-back
-- transaction so production was never changed):
--
--     Execution Time       515 ms      (was 3413 — 6.6x)
--     Planning Time        9.9 ms      (was  145 — 14.6x)
--     Buffers          80,895 hit      (was 367,710)
--     the putt_details scan itself:
--       Index Scan using idx_putt_details_shot_id
--       Filter: can_view_golf_shot(shot_id)
--       ~1 ms, 1,000 buffers           (was 2334 ms, 288,084)
--
-- The residual 515ms is the OUTER golf_shots/golf_holes/golf_rounds subquery's
-- own layered RLS. That is a separate problem this migration does not claim to
-- fix, and it is now the dominant cost.
--
-- SECURITY: UNCHANGED, AND PROVEN SO RATHER THAN ASSERTED
-- ----------------------------------------------------------------------------
-- A performance fix that quietly changes who can see what is a security bug, so
-- the old and new predicates were compared row-for-row over all 3,394
-- production putt_details rows, for identities exercising EACH branch:
--
--     identity                          old    new
--     player (owns rounds)              477    477    ✓
--     player (owns rounds)              472    472    ✓
--     coach (team branch)              2177   2177    ✓
--     coach (team branch)               661    661    ✓
--
-- `EXCEPT` in both directions returned zero for every case: no row gained, no
-- row lost.
--
-- ⚠️ The FIRST equivalence run I did was vacuous and looked like a pass — it
-- used an identity that sees 0 of the 3,394 rows, so it compared 0 to 0. That
-- proves nothing about a visibility change. The probes above were chosen
-- specifically because they return large non-zero sets through each branch. If
-- this migration is revisited, keep that property.
--
-- The helper enforces the identical predicate the two policies enforced. It is
-- SECURITY DEFINER with a pinned search path and takes only a shot id, so it
-- cannot be used to read anything but a boolean about a row the caller names.
-- EXECUTE is granted to authenticated and REVOKEd from anon — Supabase
-- default-grants EXECUTE to anon on new public functions, and `REVOKE … FROM
-- PUBLIC` does NOT remove that role-specific grant. Getting this wrong on the
-- baseball pair took two CI rounds to find, so it is spelled out rather than
-- assumed.
--
-- No recursion risk: the helper reads golf_* tables only, and no golf_* policy
-- reads putt_details or approach_miss_details, so there is no path back into
-- the policies that call it.
--
-- DELIBERATELY OUT OF SCOPE
-- ----------------------------------------------------------------------------
-- The UPDATE / DELETE `_own` policies carry the same uncorrelated shape. They
-- are untouched here because they were not measured as a problem (they act on
-- rows the caller already identified, not on bulk reads) and because widening
-- this change increases the blast radius without evidence to justify it. If
-- they are fixed later, the same helper works — a `can_edit_golf_shot` limited
-- to the `_own` branch would be the honest name.
--
-- ⚠️ WHY THIS IS NOT APPLIED YET
-- ----------------------------------------------------------------------------
-- This is the LIVE GOLF product's RLS. Unlike the baseball tenant-isolation
-- pair applied earlier today, this change has:
--   - no pgTAP coverage yet, and
--   - no prior review.
-- The baseball pair's CI pgTAP run caught two recursion cycles that had already
-- survived two line-by-line human reviews, either of which would have taken the
-- whole product down on apply. A perf fix does not justify skipping the gate
-- that caught those. CLAUDE.md also mandates db-migration-reviewer for any RLS
-- change.
--
-- So: merge this, let CI build a fresh Postgres from every migration and run the
-- suites, and apply it afterwards. The measurements above were taken by applying
-- it inside a transaction and rolling back, which is evidence it works — not a
-- substitute for the gate.
--
-- ROLLBACK (restores the pre-migration state exactly):
--   DROP POLICY IF EXISTS "putt_details_select" ON public.putt_details;
--   CREATE POLICY "putt_details_select_own" ON public.putt_details
--     FOR SELECT TO authenticated USING (shot_id IN (
--       SELECT gs.id FROM golf_shots gs
--       JOIN golf_holes gh ON gh.id = gs.hole_id
--       JOIN golf_rounds gr ON gr.id = gh.round_id
--       JOIN golf_players gp ON gp.id = gr.player_id
--       WHERE gp.user_id = (SELECT auth.uid())));
--   CREATE POLICY "putt_details_select_team" ON public.putt_details
--     FOR SELECT TO authenticated USING (shot_id IN (
--       SELECT gs.id FROM golf_shots gs
--       JOIN golf_holes gh ON gh.id = gs.hole_id
--       JOIN golf_rounds gr ON gr.id = gh.round_id
--       JOIN golf_players gp ON gp.id = gr.player_id
--       JOIN golf_team_members gtm ON gtm.player_id = gp.id
--       JOIN golf_teams gt ON gt.id = gtm.team_id
--       JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
--       WHERE gc.user_id = (SELECT auth.uid())));
--   -- and the identical pair for approach_miss_details, then
--   DROP FUNCTION IF EXISTS public.can_view_golf_shot(uuid);
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1 — the correlated, definer-rights visibility helper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_golf_shot(p_shot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM golf_shots gs
    JOIN golf_holes gh   ON gh.id = gs.hole_id
    JOIN golf_rounds gr  ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gs.id = p_shot_id
      AND (
        -- the `_select_own` branch, verbatim
        gp.user_id = (SELECT auth.uid())
        -- the `_select_team` branch, verbatim, as EXISTS rather than extra
        -- JOINs so a player on several teams cannot multiply the row out
        OR EXISTS (
          SELECT 1
          FROM golf_team_members gtm
          JOIN golf_teams gt   ON gt.id = gtm.team_id
          JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
          WHERE gtm.player_id = gp.id
            AND gc.user_id = (SELECT auth.uid())
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_view_golf_shot(uuid) IS
  'True when the caller may read the shot with this id: they own the round it belongs to, or they coach an organization one of whose teams rosters that player. Exists so putt_details / approach_miss_details can test one shot id against an index instead of materializing every shot id visible to the caller across their whole organization — measured at 3413ms -> 515ms for a 500-shot read. SECURITY DEFINER on purpose: it also skips the layered per-row RLS on golf_shots/holes/rounds/players, which was the bulk of the cost.';

REVOKE ALL ON FUNCTION public.can_view_golf_shot(uuid) FROM PUBLIC;
-- Supabase default-grants EXECUTE to anon on new public functions; REVOKE FROM
-- PUBLIC above does not remove that role-specific grant.
REVOKE EXECUTE ON FUNCTION public.can_view_golf_shot(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_golf_shot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_golf_shot(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- SECTION 2 — putt_details
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "putt_details_select_own"  ON public.putt_details;
DROP POLICY IF EXISTS "putt_details_select_team" ON public.putt_details;
DROP POLICY IF EXISTS "putt_details_select"      ON public.putt_details;
CREATE POLICY "putt_details_select" ON public.putt_details
  FOR SELECT TO authenticated
  USING (public.can_view_golf_shot(shot_id));

-- ----------------------------------------------------------------------------
-- SECTION 3 — approach_miss_details (identical shape, identical fix)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "approach_miss_details_select_own"  ON public.approach_miss_details;
DROP POLICY IF EXISTS "approach_miss_details_select_team" ON public.approach_miss_details;
DROP POLICY IF EXISTS "approach_miss_details_select"      ON public.approach_miss_details;
CREATE POLICY "approach_miss_details_select" ON public.approach_miss_details
  FOR SELECT TO authenticated
  USING (public.can_view_golf_shot(shot_id));

-- ============================================================================
-- END. Not applied to any database by this file.
-- ============================================================================
