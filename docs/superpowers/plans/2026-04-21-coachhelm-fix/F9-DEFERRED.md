# F9 — DEFERRED (Phase 3 mop-up)

**Date:** 2026-04-21
**Status:** `ignoreBuildErrors: true` remains in `next.config.mjs:32`.

## Why deferred

`npm run typecheck` reports **319 errors** across 90 unique files. Scope
breakdown:

| Scope | Error count | Action |
|---|---|---|
| `src/lib/coachhelm/**`, `src/components/golf/coachhelm/**`, `src/app/golf/actions/**` (CoachHelm) | 106 | In scope — most are `TS6133` unused decls and `TS2532` possibly-undefined narrowings |
| `src/lib/calendar/**`, `src/components/golf/calendar/**`, `src/lib/types/calendar.ts` (Calendar infra) | 58 | Out of scope |
| `src/components/baseball/**`, `src/app/baseball/**`, `src/lib/recruiting/**` (Baseball) | 15 | Out of scope |
| `src/test/**` (test files) | 7 | Out of scope — test narrowing gaps |
| Everything else (admin, notifications, offline, storage, auth, middleware, datadog, error-logging, pwa, hooks) | 133 | Out of scope |

**212/319 errors are outside the CoachHelm fix plan's scope.** Flipping the
gate without first addressing those would block every build — including
unrelated work by other teams.

## Error distribution by code

```
 200 error TS6133  (declared but never used — mostly from cross-team
                    refactors that removed callsites but left defs)
  39 error TS2532  (Object is possibly 'undefined')
  24 error TS18048 ('x' is possibly 'undefined')
  20 error TS6196  (interface declared but never used)
  17 error TS2322  (type not assignable)
  10 error TS2345  (argument type mismatch)
   6 error TS2339  (property does not exist)
   1 error TS7006  (implicit any)
   1 error TS2367  (comparison unintentional)
   1 error TS2353  (unknown object literal prop)
```

## Hot spots (files with the most errors)

```
  34 src/lib/coachhelm/v2/shot-analysis/sequence-analysis.ts
  14 src/lib/calendar/premium-utils.ts
  13 src/lib/calendar/timezone.ts
  12 src/lib/coachhelm/v2/trends/streak-detector.ts
  11 src/lib/offline/shot-storage.ts
  11 src/lib/coachhelm/v2/stats/z-score.ts
  10 src/lib/storage/attachments.ts
  10 src/lib/coachhelm/insight-types.ts
   9 src/lib/golf/strokes-gained.ts
   9 src/components/layout/sidebar.tsx
   8 src/hooks/golf/use-auto-save-round.ts
   7 src/lib/offline/indexed-db.ts
   7 src/lib/datadog/index.ts
   7 src/lib/calendar/rsvp.ts
   6 src/lib/coachhelm/v2/trends/multi-window.ts
   6 src/lib/coachhelm/v2/stats/anomaly-detector.ts
   6 src/lib/coachhelm/v2/shot-analysis/shot-level-sg.ts
   6 src/lib/calendar/recurrence.ts
   5 src/lib/error-logging.ts
   5 src/lib/coachhelm/v2/stats/baselines.ts
   5 src/lib/admin-logger.ts
```

## Recommended follow-up path

1. **Single cleanup agent** targeting `TS6133`/`TS6196` unused-decl noise
   first (200 + 20 = 220/319 errors) — these are safe, near-mechanical
   deletions from cross-team refactor churn.
2. **CoachHelm narrowing** (sequence-analysis, streak-detector, z-score,
   shot-level-sg) — 34 + 12 + 11 + 6 = 63 errors. Needs type annotations
   on destructuring / array access.
3. **Calendar infra cleanup** (premium-utils, timezone, recurrence,
   rsvp, conflicts) — 14 + 13 + 6 + 7 + 4 = 44 errors. Owned by the
   calendar team, NOT in the CoachHelm fix plan.
4. **Once under ~50** overall, flip `ignoreBuildErrors: false` in a
   single PR that fixes the last handful by hand.

## Evidence baseline

- `/tmp/typecheck-final.log` on the agent machine at commit time has the
  full output.
- `docs/superpowers/plans/2026-04-21-coachhelm-fix/typecheck-baseline.txt`
  from Team F Phase 1 still has the 333-error baseline for diffing.

## Full file list (sorted by error count)

```
  34 src/lib/coachhelm/v2/shot-analysis/sequence-analysis.ts
  14 src/lib/calendar/premium-utils.ts
  13 src/lib/calendar/timezone.ts
  12 src/lib/coachhelm/v2/trends/streak-detector.ts
  11 src/lib/offline/shot-storage.ts
  11 src/lib/coachhelm/v2/stats/z-score.ts
  10 src/lib/storage/attachments.ts
  10 src/lib/coachhelm/insight-types.ts
   9 src/lib/golf/strokes-gained.ts
   9 src/components/layout/sidebar.tsx
   8 src/hooks/golf/use-auto-save-round.ts
   7 src/lib/offline/indexed-db.ts
   7 src/lib/datadog/index.ts
   7 src/lib/calendar/rsvp.ts
   6 src/lib/coachhelm/v2/trends/multi-window.ts
   6 src/lib/coachhelm/v2/stats/anomaly-detector.ts
   6 src/lib/coachhelm/v2/shot-analysis/shot-level-sg.ts
   6 src/lib/calendar/recurrence.ts
   5 src/lib/error-logging.ts
   5 src/lib/coachhelm/v2/stats/baselines.ts
   5 src/lib/admin-logger.ts
   4 src/lib/types/calendar.ts
   4 src/lib/lazy-components.tsx
   4 src/lib/error-monitoring.ts
   4 src/lib/calendar/conflicts.ts
   4 src/lib/auth/session.ts
   4 src/components/golf/GolfSkeletons.tsx
```

(70 more files each contributing 1-3 errors; see `/tmp/typecheck-final.log`
for the exhaustive list.)
