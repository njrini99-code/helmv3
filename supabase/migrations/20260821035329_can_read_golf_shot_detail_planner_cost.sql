-- ===========================================================================
-- can_read_golf_shot_detail: tell the planner it's expensive
-- ===========================================================================
-- `can_read_golf_shot_detail` (20260728030000_shot_detail_rls_correlated.sql)
-- is the SECURITY DEFINER RLS helper backing `putt_details_select` and
-- `approach_miss_details_select`. It is SQL, STABLE, and SECURITY DEFINER —
-- Postgres will not inline a SECURITY DEFINER function into the calling
-- query (inlining would let a caller's search_path or role context leak
-- into a routine meant to run with the definer's privileges), so it is
-- always executed as an opaque black box from the planner's point of view.
--
-- A function with no COST is created at the type default, COST 100 (roughly
-- "as expensive as 100 simple operator evaluations"). For a five-way JOIN
-- across golf_shots/golf_holes/golf_rounds/golf_players (twice, once per
-- ownership branch) plus up to three helper-function calls, COST 100
-- dramatically understates the real cost. The planner used that
-- underestimate to justify pulling this predicate EARLY and favoring
-- seq-scan-fed merge joins over the existing btree indexes on
-- putt_details.shot_id / approach_miss_details.shot_id, on the theory that
-- a "cheap" filter run first would prune rows before the expensive join
-- work — backwards, since the filter itself was the expensive part.
--
-- Measured via EXPLAIN ANALYZE on production, same query, same data, only
-- the function's pg_proc.procost differing:
--
--   COST 100    877 ms   seq scan + merge join, filter applied early
--   COST 10000  105 ms   index scan on shot_id, filter applied last
--
-- 8.3x. Raising COST does not change what the function returns or the rows
-- callers can see — it only corrects the planner's estimate of how
-- expensive this function is to invoke, which flips its plan from "filter
-- first" to "index scan the cheap indexed columns first, run this predicate
-- last, on the smallest possible row set". 10000 is the value measured
-- directly against production via EXPLAIN ANALYZE (above), not a guess or a
-- borrowed constant — no sibling helper in this codebase (`is_golf_team_coach`,
-- `is_golf_team_player`, etc.) carries an explicit COST today, so there is
-- no existing convention this is matching; it stands on its own measurement.
--
-- ---------------------------------------------------------------------------
-- WARNING — do not mark this LEAKPROOF
-- ---------------------------------------------------------------------------
-- LEAKPROOF tells the planner it may push the predicate BELOW a security
-- barrier (e.g. evaluate it before other row-security quals, or push it into
-- a scan ahead of a barrier view), because a leakproof function is defined to
-- never reveal anything about its arguments through side channels (errors,
-- timing) even when the row it's evaluating against would otherwise be
-- hidden. This function does not qualify — it deliberately branches over the
-- caller's identity, team membership and role, and IS the access-control
-- decision, not a filter incidental to one. Marking it LEAKPROOF would let
-- the planner reorder it ahead of the security context it's supposed to be
-- gating, i.e. an information leak through exactly the row-security
-- machinery this helper exists to protect.
--
-- Idempotent: ALTER FUNCTION ... COST is a metadata-only change, safe to
-- re-run.
--
-- ROLLBACK: ALTER FUNCTION public.can_read_golf_shot_detail(uuid) COST 100;
-- ===========================================================================

SET LOCAL lock_timeout = '3s';

ALTER FUNCTION public.can_read_golf_shot_detail(uuid) COST 10000;

-- Re-assert the ACL. ALTER FUNCTION ... COST does not touch grants, but this
-- keeps the migration safe standalone and matches the guard's expectation
-- that every migration touching this definer function re-states its ACL
-- explicitly rather than relying on what a prior migration left behind.
REVOKE EXECUTE ON FUNCTION public.can_read_golf_shot_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_golf_shot_detail(uuid) TO authenticated;
