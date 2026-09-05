-- =============================================================================
-- Phase 2 / P3 — narrow the
-- `authenticated_security_definer_function_executable` advisor class (142
-- findings / 141 unique names, per get_advisors 2026-09-05).
--
-- HELD.md's "Advisor warnings, classified" section previously recorded "No
-- action" for this ENTIRE class, reasoning that it is "not an anon-exposure
-- list" and that wholesale revocation "would mean revoking `authenticated`
-- EXECUTE from RPCs the application calls as a signed-in user, which breaks
-- the app." That conclusion is correct for the overwhelming majority of the
-- 141 functions and is NOT overridden here — this migration is not a
-- wholesale revoke. It is the per-function classification that paragraph
-- never had, and it changes exactly nine names out of 141.
--
-- CLASSIFICATION METHOD (full table: supabase/migrations/HELD.md, the
-- "Advisor warnings, classified" section this migration's register row
-- amends, and scratchpad/exec/phase2-P3.md for the working detail):
--   1. Every flagged name was checked against every `.rpc(`-shaped call in
--      src/ — not just the literal `.rpc('name'` form the app's own
--      src/test/schema/rpc-functions-tracked.test.ts checks, but the
--      `const rpc = supabase.rpc.bind(supabase)` / `rpcCall(...)` /
--      `fingerprintRpc(...)` / `(supabase.rpc as any)(...)` detachment
--      idioms this codebase repeats at >6 call sites, each with its own
--      comment explaining why `.bind()` or the cast is load-bearing.
--   2. Every flagged name was checked against every `CREATE POLICY` /
--      `CHECK` constraint body across all 364 migration files — RLS
--      predicate helpers (`is_*`/`can_*`/`get_my_*`/`current_*`) are
--      evaluated IN THE QUERYING SESSION, so `authenticated` needs EXECUTE
--      on them even though the app never calls them by name. This is the
--      dominant shape: of the 96 names with no direct `.rpc()` call site,
--      70 turned up inside a POLICY or CHECK_CONSTRAINT body and are
--      unconditionally kept.
--   3. Every remaining name was checked against every `CREATE TRIGGER` and
--      every other function's body (to distinguish a callee reached only
--      from a SECURITY DEFINER caller — which needs no grant, because a
--      DEFINER function executes as its OWNER, and every function touched
--      here is owned by `postgres` per the baseline's "owner-stripped"
--      comments, so the owner's implicit privilege on its own functions is
--      untouched by any REVOKE against `authenticated`/`anon`/`PUBLIC` —
--      from one reached directly by app code or RLS).
--
-- THE NINE FUNCTIONS THIS MIGRATION TOUCHES, AND WHY EACH IS SAFE:
--
--   (a) Eight pure trigger functions. PostgreSQL never checks the
--       triggering session's EXECUTE privilege on a trigger function —
--       trigger invocation is not a SQL-level function call subject to the
--       ACL check, regardless of the function's SECURITY mode or owner.
--       Grep across src/ (excluding tests and generated database.ts) found
--       zero direct call sites for any of the eight; every src/ reference
--       is a comment explaining the trigger's existing behavior, not an
--       invocation:
--         - extract_email_click_from_event()
--           trigger: email_events_extract_click (AFTER INSERT on email_events)
--         - sync_coach_last_email_event()
--           trigger: email_events_sync_coach (AFTER INSERT on email_events)
--         - sync_email_snapshot_from_event()
--           trigger: email_events_sync_snapshot (AFTER INSERT on email_events)
--         - golf_event_documents_assert_same_team()
--           trigger: golf_event_documents_team_consistency
--           (BEFORE INSERT/UPDATE on golf_event_documents)
--         - golf_holes_recompute_round_totals_fn()
--           trigger: golf_holes_recompute_round_totals
--           (AFTER INSERT/DELETE/UPDATE on golf_holes)
--         - set_calendar_feed_token()
--           trigger: trigger_set_calendar_feed_token
--           (BEFORE INSERT on golf_calendar_feeds)
--         - update_round_stats_cache()
--           trigger: trg_update_round_stats_cache
--           (AFTER INSERT/UPDATE on golf_rounds)
--         - log_crm_stage_transition()
--           trigger: on crm_coaches status change
--           (20260720150000_crm_stage_tracking.sql)
--
--       log_crm_stage_transition() already had `anon`/`PUBLIC` revoked by
--       20260825235900_revoke_anon_from_secdef_admin_helpers.sql. Read that
--       file's own text carefully before assuming it settled `authenticated`
--       too: its WHY section is scoped to "the migration-chain-built
--       database did NOT [match production]" — a LOCAL drift fix aligning
--       the migration chain to production's existing anon contract, not a
--       reviewed decision that `authenticated` is needed. It is silent on
--       `authenticated` because that was out of scope, not because it was
--       checked and kept. This migration is the first to actually check it.
--
--   (b) One internal composability gate, not a trigger:
--         - __admin_rollup_b_gate()  returns void, zero arguments.
--       Called only as `PERFORM public.__admin_rollup_b_gate();` from
--       within ~17 sibling admin-rollup SECURITY DEFINER functions
--       (get_admin_dashboard_rollup, get_admin_rounds_rollup,
--       get_admin_event_summary, etc. — see
--       20260602165152_harden_search_path_and_revoke_anon_admin_fns.sql and
--       20260709010100_gate_admin_event_summary.sql, both of which
--       deliberately GRANT `authenticated` on the 17 siblings themselves,
--       because those ARE called directly by the admin dashboard via
--       dynamic `rpc(name)` dispatch and self-gate internally via
--       `is_super_admin() OR users.role = 'admin'`). __admin_rollup_b_gate
--       itself is never called that way: it returns `void`, has no
--       src/ reference of any kind (not even in the generated
--       src/lib/types/database.ts beyond the bare `Args: never; Returns:
--       undefined` signature entry every schema function gets), and its
--       only callers are its 17 siblings — themselves owned by `postgres`
--       — so the nested `PERFORM` call needs no grant to `authenticated`
--       to keep working. The 17 siblings are UNCHANGED by this migration.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES **NOT** TOUCH, WITH THE SPECIFIC
-- REASON EACH WAS PULLED BACK OUT OF AN EARLIER DRAFT OF THIS LIST:
--
--   - recompute_golf_round_totals(uuid): the *only* trigger call site found
--     anywhere in the migration corpus is golf_holes_recompute_round_totals_fn
--     (itself SECURITY DEFINER, owned by postgres — no grant needed for that
--     nested call). But the HELD, unapplied, unreviewed draft
--     20260708141000_gate_secdef_ownership_and_redemption.sql asserts, in its
--     own caller-audit note, that this function "is invoked BY A TRIGGER on
--     golf_shots" and that its proposed ownership guard must keep "owner/
--     coach for direct authenticated/anon .rpc()". Neither claim is
--     corroborated here: the only trigger on golf_shots in the entire
--     migration corpus is update_golf_shots_updated_at, which calls the
--     unrelated update_updated_at_column(), not this function. That draft's
--     claim may itself be a stale confusion of golf_shots with golf_holes —
--     but it is a second, independent, already-written audit disagreeing
--     with this one, and the asymmetry is not close: a left-in-place grant
--     costs one advisor warning, a wrongly-revoked one breaks round-total
--     writes silently. Left granted. Flagged in HELD.md for owner review
--     alongside the draft it overlaps, not resolved by inference here.
--   - is_in_team(uuid), user_is_golf_team_member(uuid): both are
--     zero-caller by the same exhaustive migration+src search as the eight
--     trigger functions above, but neither has a trigger's CATEGORICAL
--     Postgres-level exemption — the absence-of-evidence here is genuinely
--     just absence of evidence, not a structural guarantee. is_in_team's own
--     COMMENT ON FUNCTION calls it a "v3 RLS helper... Use for team-scoped
--     shared-read policies (Pattern 3 in docs/v3-rls-template.md)" —
--     documented for future adoption, not confirmed dead. Left granted.
--   - golf_conversation_has_me(uuid): flagged by the advisor but has NO
--     `CREATE FUNCTION` anywhere in supabase/migrations/ under this name —
--     not even in the 2026-05-27 production baseline dump, which otherwise
--     contains every production function as of that date. It exists in
--     production out of band. A function this migration cannot find the
--     definition for is UNRESOLVED, not dead, and revoking a grant on a
--     signature this file cannot verify is not attempted. Left granted;
--     recorded as a genuine knowledge gap, not a judgment call.
--   - unresolve_admin_event(uuid[]): SECURITY DEFINER, self-gates via
--     is_super_admin() (20260729120000_admin_events_unresolve_rpc.sql), and
--     has zero confirmed src/ call site — but that migration's own header
--     states its purpose as future Bridge-console wiring ("make Bridge's
--     only mutation reversible"), mirroring its already-wired sibling
--     resolve_admin_event(uuid[]) exactly (same signature shape, same gate,
--     deliberately built as the reversible counterpart). Revoking now would
--     silently break that wiring the day it ships, and nothing would notice
--     until an admin hit 42501. Left granted.
--   - Every `get_admin_*_rollup`, `get_users_with_auth`,
--     `get_audit_log_recent`, `get_shot_data_quality`,
--     `get_qualifier_leaderboard`, `get_golf_message_attachments`,
--     `get_baseball_conversations_with_details`,
--     `get_golf_conversations_with_details`,
--     `admin_resolve_error_fingerprint`, and every `is_*`/`can_*`/
--     `get_my_*`/`current_*` RLS predicate: confirmed either as a direct
--     (if indirectly dispatched) app RPC target, or as self-gated
--     (is_super_admin()/team-membership/auth.uid() check inside the
--     function body) with an explicit prior security migration that chose
--     to keep `authenticated` deliberately. Unchanged.
--
-- VERIFICATION AFTER APPLY:
--   select p.proname,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE')
--            as authenticated_can_execute,
--          has_function_privilege('anon', p.oid, 'EXECUTE')
--            as anon_can_execute,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')
--            as service_role_can_execute
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in (
--       'extract_email_click_from_event', 'sync_coach_last_email_event',
--       'sync_email_snapshot_from_event',
--       'golf_event_documents_assert_same_team',
--       'golf_holes_recompute_round_totals_fn', 'set_calendar_feed_token',
--       'update_round_stats_cache', 'log_crm_stage_transition',
--       '__admin_rollup_b_gate'
--     );
--   Expect authenticated_can_execute = false and anon_can_execute = false for
--   all nine rows, service_role_can_execute = true for all nine. Then run the
--   round-submit / round-review / calendar-feed / email-webhook / CRM-dedup
--   smoke paths that exercise these triggers indirectly (never via direct
--   RPC) and confirm they still fire — the whole point of this migration is
--   that trigger-fired behavior is unaffected by a role-EXECUTE revoke.
--
-- ROLLBACK: `GRANT EXECUTE ON FUNCTION <name> TO PUBLIC, anon, authenticated;`
-- per function restores the exact pre-migration baseline grant (all nine
-- carried `GRANT ALL ... TO anon` / `... TO authenticated` in
-- 20260527000000_prod_public_baseline.sql). Re-granting does not restore any
-- state — nothing legitimate exercises this surface, so a rollback undoes
-- the fix, not a break.
--
-- Existence guards: a named REVOKE aborts the transaction if its target does
-- not exist, so every statement here is wrapped exactly the way
-- 20260825235900_revoke_anon_from_secdef_admin_helpers.sql establishes for
-- this repo, making the file safe to run against a partial preview branch or
-- an older restore, not only against the environment it was written against.
-- =============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.extract_email_click_from_event()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.extract_email_click_from_event() FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.sync_coach_last_email_event()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.sync_coach_last_email_event() FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.sync_email_snapshot_from_event()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.sync_email_snapshot_from_event() FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.golf_event_documents_assert_same_team()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.golf_event_documents_assert_same_team() FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.golf_holes_recompute_round_totals_fn()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.golf_holes_recompute_round_totals_fn() FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.set_calendar_feed_token()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.set_calendar_feed_token() FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.update_round_stats_cache()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.update_round_stats_cache() FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.log_crm_stage_transition()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.log_crm_stage_transition() FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.__admin_rollup_b_gate()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.__admin_rollup_b_gate() FROM PUBLIC, anon, authenticated;
  END IF;
END
$$;
