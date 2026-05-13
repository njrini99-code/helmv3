# Codex Security Multi-Reviewer Report

Date: 2026-05-12
Target: uncommitted change set on `main`
Reviewers: Security, Architecture, Testing, Performance

This preserves the in-conversation review that drove the follow-up fix order.

## Critical

1. `generateTeamInsights` and `triggerPlayerInsightsAfterRound` bypassed the `upsertInsight` evidence contract by inserting directly into `golf_coach_insights`. Required fix: route both creation paths through `upsertInsight`, build evidence/signature inputs in `lib/coachhelm/v2/insights`, and persist team trends with `player_id = null`.
2. CoachHelm insight lifecycle cron paged through all non-terminal insights without a recency bound or run ceiling, risking nightly memory/runtime blowups.

## High

1. Singleton dismiss/resolve actions lacked a defensive `coach_id` filter.
2. Four cron routes had divergent auth contracts and response shapes.
3. `coachhelm-data.ts` re-queried `golf_coaches` after canonical team access verification.
4. `gate.ts` did sequential per-team settings lookups.
5. Lifecycle cron used per-row updates rather than batched updates.
6. Round-review hook fired two queries before generate could arm.
7. New messaging RLS/RPC migration lacked pgTAP coverage.
8. `outcome-validator.ts` lacked tests for the `round_date` to `created_at` fix.
9. Process-sequences and refresh-engagement cron auth tightening lacked route tests.
10. Multi-team gate semantics, prediction performance rewrite, 30-day window, and auto-generate guard lacked coverage.

## Medium / Low Themes

Medium findings covered policy hardening, duplicated round-window query logic, hidden type widening, analytics row-transfer growth, offline-sync backoff, lifecycle-state assertions, stale fixtures, and ownership rewrite coverage.

Low findings covered service-role comments, orphan-null fallback, admin-vs-anon archive client inconsistency, new `supabase as any` casts, recency-decay coverage, delegation contract pinning, offline-sync coverage, latest-per-player cap risk, and caching for ownership lookup.

## Recommended Order

1. CR-001 plus HI-002 first.
2. Phase 1 hotfix: calendar feeds RLS, `error_logs` RLS, `/api/log-error` auth.
3. CR-002 lifecycle cron scan bound.
4. HI-001/003/004/005/006 plus the 30-day count rewrite.
5. Testing debt: HI-007/008/009/010 and medium test gaps.
