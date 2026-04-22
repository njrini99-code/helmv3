# Phase 3 — DONE

**Date:** 2026-04-21
**Owner:** Claude (agent) — Phase 3 mop-up
**Branch:** main (direct commits)

## Task status

| Task | Status | Commit |
|---|---|---|
| 1 — `golf_insight_player_feedback` UPDATE policy | DONE | `a9114335` |
| 2 — migrate 3 remaining `verifyPlayerAccess` duplicates | DONE | `fae16a1b` |
| 3 — TeamForecaster cleanup | SKIPPED (live caller confirmed) | `4831d04e` (TODO added) |
| 4 — `generateAlerts` `as any` cleanup | DONE | `b589102f` |
| 5 — `team-category-insights.ts` dedup | DONE | `545a431e` |
| 6 — F9 flip `ignoreBuildErrors: false` | DEFERRED (319 errors, 212 out-of-scope) | `94430fd0` (F9-DEFERRED.md) |
| 7 — test suite smoke | DONE — 640 pass / 24 fail (24 pre-existing, zero Phase-3 regressions) | this doc |

**Total commits made: 6** (TASK 1-5 + F9-DEFERRED doc).

## TASK 1 — player feedback UPDATE policy
Added `ipf_player_update_own` RLS policy on `golf_insight_player_feedback`
via `execute_sql`. Verified live (4 policies now). Migration file
`supabase/migrations/20260421130000_insight_player_feedback_update_policy.sql`.
Re-rating now works end-to-end.

## TASK 2 — verifyPlayerAccess migration
`shot-analytics.ts`, `round-reviews.ts`, `round-review-system.ts` now
delegate to `@/lib/auth/verify-player-access`. `shot-analytics.ts` uses
the shared `{ allowed, reason }` shape directly; the two review files
keep their local `{ authorized, callerRole?, userId? }` return shape as
thin wrappers so callsites stay untouched. All 3 files typecheck clean.

## TASK 3 — TeamForecaster SKIPPED
`insights.ts:1898` IS a live caller of `generateTeamForecasts` — the
output feeds `allPredictions` on the intelligence dashboard. Not dead
code. Added a `TODO(engine):` comment at the callsite pointing to the
future removal path (fold into
`coachHelmIntelligence.generatePredictions`).

## TASK 4 — generateAlerts `as any` cleanup
Removed the `(supabase as any)` cast at `alerts.ts:495`. Types regen
during Phase 1 added `golf_coach_insights` to the generated types, so
the cast is no longer needed. Typed `newAlerts` as
`Database['public']['Tables']['golf_coach_insights']['Insert'][]`.
`generateAlerts` fan-out logic untouched (future workflow refactor).

## TASK 5 — team-category-insights dedup
`getTeamOverview` and `getTeamCategoryInsights` now accept an optional
`teamId` argument. When provided by the intelligence page, they skip
the redundant internal org→team lookup. `intelligence/page.tsx` passes
its already-resolved `teamId` through. **3 org→team lookups collapsed
to 1**. Backwards-compatible: callers without args still look up the
team internally via session.

## TASK 6 — F9 DEFERRED
`npm run typecheck` reports **319 errors** across 90 files.

- **107 errors** in CoachHelm/golf scope (could fix)
- **212 errors** in out-of-scope modules (baseball, calendar, admin,
  notifications, offline, storage, auth middleware, datadog, error
  logging, PWA, hooks)

Per plan guidance, did NOT flip the gate because 67% of errors are in
unrelated workstreams. `next.config.mjs:32` remains
`ignoreBuildErrors: true`. Full breakdown + hot-spot list + recommended
follow-up path in `F9-DEFERRED.md`.

**Dominant error codes:**
- 200 × TS6133 (unused declarations — cross-team refactor churn)
- 39 × TS2532 / 24 × TS18048 (possibly undefined narrowings)
- 20 × TS6196 (unused interfaces)
- 17 × TS2322 / 10 × TS2345 (actual type mismatches)

## TASK 7 — smoke verification
`npm run test --run`:
- **640 passed, 24 failed** (39 test files, 5 failed)
- All 24 failures are in **pre-existing baseline** issues (verified by
  running the failing files in isolation — same failures reproduce):
  - `travel.test.ts` (13 failures — supabase mock helper missing
    `.maybeSingle()` / `.order()` chain stubs)
  - `dashboard-data.test.ts` (6 failures — mock shape mismatch)
  - `stat-card-sparkline.test.tsx` (4 failures — recharts DOM
    environment)
  - `team-pulse-card.test.tsx` (1 failure — mock shape)
  - `button.test.tsx` (1 failure — loading state mock)
- **Zero Phase-3 regressions.** All CoachHelm + auth + golf-action
  tests (102 tests across 21 files) green.

## Final typecheck error count
**319** (down from Phase 1 baseline of 333). Net delta across
A-F-Phase-3 is -14 errors.

## F9 flipped?
**NO — DEFERRED.** Reason: 212 out-of-scope errors would block every
build. `F9-DEFERRED.md` documents the residuals and recommends a
cleanup-agent path to clear TS6133/TS6196 noise first (220 errors,
near-mechanical).

## Commits (chronological)

```
a9114335  fix(db): allow players to update their own insight feedback (re-rating)
fae16a1b  refactor(auth): migrate 3 remaining verifyPlayerAccess duplicates to shared helper
4831d04e  chore(engine): document TeamForecaster is live (Phase 3 audit confirmed)
b589102f  refactor(coach-actions): remove as-any casts in generateAlerts (post types-regen)
545a431e  perf(intelligence): team-category-insights accepts teamId param (no internal lookup)
94430fd0  docs(plan): F9 deferred — 319 typecheck errors, 212 outside CoachHelm scope
```

Plus this `PHASE-3-DONE.md` commit.
