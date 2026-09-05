-- pgTAP contracts for 20260905100000_revoke_secdef_execute_from_authenticated.sql
-- (Phase 2 / P3 — narrowing the `authenticated_security_definer_function_executable`
-- advisor class).
--
-- Two things must both be true after this migration applies, and this suite
-- checks both, because the regression half matters MORE than the revoke half:
-- a revoke that also strips a function the app actually needs breaks
-- production silently (PostgREST returns 42501, not a build failure), while
-- a left-in-place grant is just one more advisor warning.
--
--   1. The nine functions this migration targets — eight pure trigger
--      functions plus the internal __admin_rollup_b_gate() composability
--      helper — are no longer directly EXECUTE-able by anon or
--      authenticated, but remain EXECUTE-able by service_role (unchanged).
--   2. A representative sample of functions this migration DELIBERATELY did
--      NOT touch — an RLS predicate helper, a self-gated admin rollup, a
--      directly app-called round RPC, and the one function (
--      recompute_golf_round_totals) that a HELD, unreviewed draft migration
--      claims has a direct-RPC caller this suite could not corroborate —
--      still grant `authenticated` EXECUTE exactly as before. If a future
--      migration revokes any of these by mistake (e.g. by copying this
--      file's pattern too broadly), this half of the suite is what catches
--      it.

BEGIN;
\ir _helpers.sql

SELECT plan(27);

-- ============================================================================
-- Part 1 — the nine functions this migration revokes `authenticated`/`anon`
-- EXECUTE from. Trigger invocation itself is unaffected by any of this (Postgres
-- never checks the triggering session's EXECUTE privilege on a trigger
-- function), so these assertions are only about the *direct RPC* surface,
-- which is what the advisor lint actually measures.
-- ============================================================================

SELECT isnt(
  has_function_privilege('authenticated', 'public.extract_email_click_from_event()', 'EXECUTE'),
  true,
  'authenticated cannot directly execute extract_email_click_from_event (trigger-only)'
);
SELECT isnt(
  has_function_privilege('anon', 'public.extract_email_click_from_event()', 'EXECUTE'),
  true,
  'anon cannot directly execute extract_email_click_from_event'
);
SELECT ok(
  has_function_privilege('service_role', 'public.extract_email_click_from_event()', 'EXECUTE'),
  'service_role retains EXECUTE on extract_email_click_from_event'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.sync_coach_last_email_event()', 'EXECUTE'),
  true,
  'authenticated cannot directly execute sync_coach_last_email_event (trigger-only)'
);
SELECT isnt(
  has_function_privilege('anon', 'public.sync_coach_last_email_event()', 'EXECUTE'),
  true,
  'anon cannot directly execute sync_coach_last_email_event'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.sync_email_snapshot_from_event()', 'EXECUTE'),
  true,
  'authenticated cannot directly execute sync_email_snapshot_from_event (trigger-only)'
);
SELECT isnt(
  has_function_privilege('anon', 'public.sync_email_snapshot_from_event()', 'EXECUTE'),
  true,
  'anon cannot directly execute sync_email_snapshot_from_event'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.golf_event_documents_assert_same_team()', 'EXECUTE'),
  true,
  'authenticated cannot directly execute golf_event_documents_assert_same_team (trigger-only)'
);
SELECT isnt(
  has_function_privilege('anon', 'public.golf_event_documents_assert_same_team()', 'EXECUTE'),
  true,
  'anon cannot directly execute golf_event_documents_assert_same_team'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.golf_holes_recompute_round_totals_fn()', 'EXECUTE'),
  true,
  'authenticated cannot directly execute golf_holes_recompute_round_totals_fn (trigger-only)'
);
SELECT isnt(
  has_function_privilege('anon', 'public.golf_holes_recompute_round_totals_fn()', 'EXECUTE'),
  true,
  'anon cannot directly execute golf_holes_recompute_round_totals_fn'
);
SELECT ok(
  has_function_privilege('service_role', 'public.golf_holes_recompute_round_totals_fn()', 'EXECUTE'),
  'service_role retains EXECUTE on golf_holes_recompute_round_totals_fn'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.set_calendar_feed_token()', 'EXECUTE'),
  true,
  'authenticated cannot directly execute set_calendar_feed_token (trigger-only)'
);
SELECT isnt(
  has_function_privilege('anon', 'public.set_calendar_feed_token()', 'EXECUTE'),
  true,
  'anon cannot directly execute set_calendar_feed_token'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.update_round_stats_cache()', 'EXECUTE'),
  true,
  'authenticated cannot directly execute update_round_stats_cache (trigger-only)'
);
SELECT isnt(
  has_function_privilege('anon', 'public.update_round_stats_cache()', 'EXECUTE'),
  true,
  'anon cannot directly execute update_round_stats_cache'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.log_crm_stage_transition()', 'EXECUTE'),
  true,
  'authenticated cannot directly execute log_crm_stage_transition (trigger-only)'
);
SELECT isnt(
  has_function_privilege('anon', 'public.log_crm_stage_transition()', 'EXECUTE'),
  true,
  'anon cannot directly execute log_crm_stage_transition (already true pre-migration; re-asserted)'
);

SELECT isnt(
  has_function_privilege('authenticated', 'public.__admin_rollup_b_gate()', 'EXECUTE'),
  true,
  'authenticated cannot directly execute __admin_rollup_b_gate (internal composability helper only)'
);
SELECT isnt(
  has_function_privilege('anon', 'public.__admin_rollup_b_gate()', 'EXECUTE'),
  true,
  'anon cannot directly execute __admin_rollup_b_gate'
);
SELECT ok(
  has_function_privilege('service_role', 'public.__admin_rollup_b_gate()', 'EXECUTE'),
  'service_role retains EXECUTE on __admin_rollup_b_gate'
);

-- ============================================================================
-- Part 2 — regression guard. These are NOT touched by this migration and
-- must still grant `authenticated` EXECUTE. Each represents a different
-- reason a flagged function was kept (RLS predicate, self-gated admin
-- rollup, directly app-called round RPC, and the one genuinely ambiguous
-- case this migration deliberately declined to resolve).
-- ============================================================================

-- RLS predicate helper: evaluated inside CREATE POLICY USING/WITH CHECK
-- clauses in the querying session, so authenticated needs EXECUTE even
-- though the app never calls it by name via .rpc().
SELECT ok(
  has_function_privilege('authenticated', 'public.is_golf_team_coach(uuid)', 'EXECUTE'),
  'authenticated still executes is_golf_team_coach (RLS predicate helper, untouched)'
);

-- Self-gated admin rollup: app calls it via a dynamic rpc(name) dispatcher
-- (src/app/golf/actions/admin-data.ts), and it self-gates internally via
-- __admin_rollup_b_gate()'s is_super_admin()/users.role='admin' check —
-- revoking authenticated here would lock out every real admin, not just
-- unauthorized callers.
SELECT ok(
  has_function_privilege('authenticated', 'public.get_admin_dashboard_rollup()', 'EXECUTE'),
  'authenticated still executes get_admin_dashboard_rollup (self-gated admin RPC, untouched)'
);

-- Directly app-called round-submit RPC.
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.submit_round_atomic(uuid,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated still executes submit_round_atomic (direct app RPC, untouched)'
);

-- Directly app-called admin console RPC (src/app/admin/actions/triage.ts).
SELECT ok(
  has_function_privilege('authenticated', 'public.resolve_admin_event(uuid[])', 'EXECUTE'),
  'authenticated still executes resolve_admin_event (direct app RPC, untouched)'
);

-- The deliberately-not-revoked ambiguous case: only confirmed trigger caller
-- found is a SECURITY DEFINER sibling (golf_holes_recompute_round_totals_fn,
-- which needs no grant of its own for that nested call either), but a HELD
-- unreviewed draft (20260708141000_gate_secdef_ownership_and_redemption.sql)
-- asserts a direct authenticated/anon .rpc() caller exists. This migration
-- did not resolve that conflict by inference, so authenticated must still be
-- able to execute this one. If a future change revokes it based on this
-- migration's own trigger-only reasoning without first resolving that
-- conflict, this assertion is what catches it.
SELECT ok(
  has_function_privilege('authenticated', 'public.recompute_golf_round_totals(uuid)', 'EXECUTE'),
  'authenticated still executes recompute_golf_round_totals (deliberately left unresolved, see migration header)'
);

-- unresolve_admin_event: self-gated, no confirmed src/ call site today, but
-- its own migration documents it as the not-yet-wired reversible counterpart
-- to resolve_admin_event. Left granted so that future wiring does not break
-- silently.
SELECT ok(
  has_function_privilege('authenticated', 'public.unresolve_admin_event(uuid[])', 'EXECUTE'),
  'authenticated still executes unresolve_admin_event (documented future admin-console wiring, untouched)'
);

SELECT * FROM finish();
ROLLBACK;
