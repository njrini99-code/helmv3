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
--
-- REPO-SIDE NOTE: the `SET search_path` re-assertion below is NOT part of
-- what production recorded for this migration. Production already has
-- search_path pinned from the defining migration
-- (20260728030000_shot_detail_rls_correlated.sql's own
-- `SET search_path TO 'public', 'pg_temp'` on the CREATE OR REPLACE).
-- It's added here only so this file is self-contained for the repo's
-- definer-function search_path lint in .coderabbit/semgrep/helmv3.yml
-- (rule id: helmv3-security-definer-without-search-path), which scans
-- file-by-file and has no way to know the defining migration already
-- covers it — it does not change what this migration does on top of what
-- production already ran.
--
-- The re-assertion below took two earlier wrong shapes, both caught by
-- RLS test 18 of supabase/tests/rls/golf_shot_detail_visibility.sql (this
-- function stays pinned to public+pg_temp), so both are recorded here to
-- save the next person the same two round trips:
--   1. `SET search_path = public;` (public only) NARROWS the defining
--      migration's pin instead of restating it — pg_temp silently drops.
--   2. `SET search_path = 'public, pg_temp';` (one quoted string) is
--      valid Postgres and DOES keep both schemas resolvable, but it
--      stores as a single quoted token, so pg_proc.proconfig renders it
--      `search_path="public, pg_temp"` (with the embedded quote) rather
--      than the defining migration's own unquoted, two-element rendering
--      `search_path=public, pg_temp` — and pgTAP's assertion is exact
--      string equality against the latter, so this shape failed too even
--      though it is functionally equivalent.
-- The form below — `SET ... TO 'public', 'pg_temp'`, byte-identical to
-- the defining migration's own clause — is the only one that reproduces
-- BOTH the correct resolution behavior AND the exact proconfig string
-- pgTAP checks. It needs the inline `-- noqa: PRS` because sqlfluff's
-- postgres dialect cannot PARSE a multi-value `ALTER FUNCTION ... SET
-- x TO 'a', 'b'` clause (a parser gap, not a style violation — verified
-- empirically: the single-value forms above parse fine, only the
-- two-value TO form trips a PRS "unparsable section" error). It is that
-- parser limitation being suppressed, not the semgrep security rule —
-- the search_path IS set, correctly, to the value production actually
-- needs.
-- ===========================================================================

SET LOCAL lock_timeout = '3s';

ALTER FUNCTION public.can_read_golf_shot_detail(uuid) COST 10000;

-- Idempotent re-assertion, byte-identical to the defining migration's own
-- clause (see REPO-SIDE NOTE above for why it must be exactly this form,
-- not a narrower or differently-rendered equivalent, and why the trailing
-- inline suppression below silences a parser gap, not a real finding).
ALTER FUNCTION public.can_read_golf_shot_detail(uuid)
SET search_path TO 'public', 'pg_temp';  -- noqa: PRS

-- Re-assert the ACL. ALTER FUNCTION ... COST does not touch grants, but this
-- keeps the migration safe standalone and matches the guard's expectation
-- that every migration touching this definer function re-states its ACL
-- explicitly rather than relying on what a prior migration left behind.
REVOKE EXECUTE ON FUNCTION public.can_read_golf_shot_detail(uuid)
FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_golf_shot_detail(uuid)
TO authenticated;
