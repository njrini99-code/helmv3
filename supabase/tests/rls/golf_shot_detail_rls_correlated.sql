-- pgTAP contracts for putt_details / approach_miss_details — the correlated
-- SELECT policies from 20260729180000.
--
-- Unusually for this directory, the finding here was a PERFORMANCE problem that
-- turned out to have a correctness consequence.
--
-- THE BUG. Each table carried TWO permissive SELECT policies, `_select_own` and
-- `_select_team`, both shaped:
--
--     shot_id IN (SELECT gs.id FROM golf_shots gs
--                   JOIN golf_holes … JOIN golf_rounds … JOIN golf_players …
--                   [JOIN golf_team_members … JOIN golf_teams … JOIN golf_coaches …]
--                 WHERE gp.user_id = auth.uid())
--
-- The subquery never references the outer row. Being uncorrelated, Postgres
-- cannot push `shot_id` into it and instead materializes the COMPLETE set of
-- shot ids visible to the caller across their whole organization — a four-table
-- join for `_own`, a SEVEN-table join for `_team` — before testing a single
-- detail row. Both ran, because permissive policies OR together.
--
-- Measured against production as a real coach, 500 shots:
--     Execution Time      3413 ms   <- returning ZERO rows
--     Buffers         367,710 hit
--     putt_details scan alone: 2334 ms, 288,084 buffers
--
-- THE CORRECTNESS CONSEQUENCE. fetchShotDriversByCategory runs under a 5-second
-- budget and aborts it ~34 times a week, after which insights are generated with
-- NO shot drivers at all — silently, because the abort is caught. A single
-- embedded read spent 3.4s of the 5s. So this was not "a slow query"; it was a
-- feature quietly degrading in production on a schedule.
--
-- WHY THE ORIGINAL DIAGNOSIS WAS WRONG, which is the transferable part. The
-- comment above that call site blamed "the unordered, high-cap, joined
-- golf_shots scan". The golf_rounds + golf_shots read measures 68ms on an Index
-- Only Scan. The cost was the RLS on the two EMBEDDED tables — and a
-- service-role EXPLAIN bypasses RLS entirely, so the expensive half is invisible
-- to exactly the tool you would reach for. The fix was found by measuring as a
-- real user via role impersonation, not by reading the query.
--
-- AFTER: 515 ms, 80,895 buffers; the putt_details scan itself ~1 ms / 1,000
-- buffers. Row-for-row equivalence was proven across all 3,394 production rows
-- on both the player branch (477->477, 472->472) and the coach branch
-- (2177->2177, 661->661).
--
-- ASSERTS THE POST-20260729180000 STATE. Against a database without that
-- migration, GROUPS 1 and 2 fail — correctly.
--
-- Plan arithmetic: 5 per table x 2 tables (shape) + 3 (the helper)
--                  + 1 (writes untouched) = 14.
-- Counted rather than eyeballed — a miscounted plan aborts the runner's
-- `set -euo pipefail` loop and SILENTLY SKIPS every alphabetically later suite.
--
-- HOW THIS SUITE WAS VERIFIED, both directions, before being committed:
--   * With 20260729180000 applied inside a rolled-back transaction against
--     production: all 14 predicates evaluate TRUE.
--   * Against production as it is (migration NOT applied): assertions 1, 5, 6,
--     10, 11, 12, 13 evaluate FALSE — so the suite genuinely fails on an
--     unmigrated database rather than passing on anything.
--   * Assertions 4 and 9 (no inline ` FROM `) are GENUINE regression detectors
--     here, not merely forward guards: the old `_select_team` policies do
--     contain an inline join, verified FALSE against the live pre-migration
--     policy. (Contrast the sibling suite baseball_coaches_org_scope.sql, where
--     the equivalent assertion passes both ways and is therefore only a forward
--     guard — stated there.)
--   * Assertion 14 is an INVARIANT, not a detector: 6 write policies is true
--     before and after, by design. It exists to fail if a later edit widens
--     this migration's scope into writes.

BEGIN;
\ir _helpers.sql

SELECT plan(14);

-- ============================================================================
-- GROUP 1 — putt_details policy shape. 5 assertions.
-- ============================================================================

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'putt_details'
      AND p.polname IN ('putt_details_select_own', 'putt_details_select_team')
  ),
  'both uncorrelated putt_details SELECT policies are GONE'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'putt_details'
      AND p.polname = 'putt_details_select'
      AND p.polcmd = 'r'
  ),
  'putt_details_select exists as a SELECT policy'
);

SELECT ok(
  position('can_view_golf_shot' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'putt_details'
        AND p.polname = 'putt_details_select'
  ), '')) > 0,
  'putt_details_select delegates to can_view_golf_shot()'
);

-- THE INVARIANT THAT IS THE WHOLE POINT. An inline ` FROM ` in this USING clause
-- is the uncorrelated shape regressing. It would not fail any behavioural test
-- and it would not fail a review — it returns the RIGHT ROWS. It just costs
-- 3.4 seconds and silently starves the insight generator's budget. Correctness
-- tests cannot catch this; only the structural assertion can.
SELECT ok(
  position(' FROM ' IN upper(COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'putt_details'
        AND p.polname = 'putt_details_select'
  ), ''))) = 0,
  'putt_details_select contains NO inline table read — the uncorrelated shape cannot come back'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'putt_details' AND p.polcmd = 'r'),
  1,
  'exactly ONE SELECT policy on putt_details — two is what made both subplans run'
);

-- ============================================================================
-- GROUP 2 — approach_miss_details, identical shape and identical fix.
-- 5 assertions.
-- ============================================================================

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'approach_miss_details'
      AND p.polname IN ('approach_miss_details_select_own', 'approach_miss_details_select_team')
  ),
  'both uncorrelated approach_miss_details SELECT policies are GONE'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'approach_miss_details'
      AND p.polname = 'approach_miss_details_select'
      AND p.polcmd = 'r'
  ),
  'approach_miss_details_select exists as a SELECT policy'
);

SELECT ok(
  position('can_view_golf_shot' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'approach_miss_details'
        AND p.polname = 'approach_miss_details_select'
  ), '')) > 0,
  'approach_miss_details_select delegates to can_view_golf_shot()'
);

SELECT ok(
  position(' FROM ' IN upper(COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'approach_miss_details'
        AND p.polname = 'approach_miss_details_select'
  ), ''))) = 0,
  'approach_miss_details_select contains NO inline table read'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'approach_miss_details' AND p.polcmd = 'r'),
  1,
  'exactly ONE SELECT policy on approach_miss_details'
);

-- ============================================================================
-- GROUP 3 — the definer helper. 3 assertions.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'can_view_golf_shot'
      AND p.prosecdef
  ),
  'can_view_golf_shot exists and is SECURITY DEFINER'
);

-- Definer is not incidental here: it is HALF the performance fix. The inline
-- subquery was not a definer function, so its reads of golf_shots / golf_holes /
-- golf_rounds / golf_players were themselves filtered by those tables' own
-- layered policies, which call is_golf_team_coach() / is_golf_team_player() /
-- is_admin() per row. That nested policy evaluation was most of the 288,084
-- buffers. Downgrade this to INVOKER and the correlation win largely evaporates
-- while every behavioural test still passes.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'can_view_golf_shot'
      AND p.proconfig IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
      )
  ),
  'can_view_golf_shot pins its search path'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'can_view_golf_shot'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'anon CANNOT execute can_view_golf_shot'
);

-- ============================================================================
-- GROUP 4 — writes untouched. 1 assertion.
-- ============================================================================
-- 20260729180000 deliberately leaves the UPDATE/DELETE `_own` policies alone:
-- they share the uncorrelated shape but were not measured as a problem, and
-- widening the blast radius without evidence is how the recursion cycles in the
-- tenant-isolation pair got written. 3 write policies per table x 2 tables = 6.
SELECT is(
  (SELECT count(*)::int FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('putt_details', 'approach_miss_details')
       AND p.polcmd <> 'r'),
  6,
  'all 6 write policies across both tables are untouched'
);

SELECT * FROM finish();
ROLLBACK;
