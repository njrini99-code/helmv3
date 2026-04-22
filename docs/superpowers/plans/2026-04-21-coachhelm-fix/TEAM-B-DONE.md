# Team B — DONE

**Date:** 2026-04-21
**Owner:** Claude (agent) for Team B (Engine Correctness)

## Tasks completed

| Task | Status | Commit |
|------|--------|--------|
| B1  — cross-learner writes canonical `golf_global_patterns` columns (LIVE-1) | PASS | `569713f6` |
| B2  — BehaviorLearner refactored to event-log schema (LIVE-9) + race-free | PASS | `5c550306` |
| B3  — `recordAction` drops bogus `timestamp` field, surfaces errors (LIVE-10) | PASS | `16ec75a7` |
| B4  — operator-precedence fix in `shot-pattern-miner` actionability (LIVE-14) | PASS | `7885912e` |
| B5  — `normalizeMissDirection` `'l'`→left only, `'lng'`→long (LIVE-15) | PASS | `9dd03530` |
| B6  — `gate.ts` fails closed on DB lookup error (LIVE-17) | PASS | `762087b0` |
| B7  — `ShotStateIntelligence.loadShotStates` scoped to player_id (LIVE-18) | PASS | `19a4a244` |
| B8  — NaN root cause patched via `computeConvictionSafe` (LIVE-16) | PASS | `13755d07` |
| B9  — orchestrator honors CoachPhilosophy thresholds (LIVE-24) | PASS | `1115654d` |
| B10 — race condition covered by B2 (event-log eliminates load→mutate→save) | PASS | (covered by B2) |
| B11 — remove dead `TeamForecaster` | **SKIPPED** — live caller found | n/a |
| B12 — `StatsInsightGenerator` prefers per-player baseline | PASS | `e0d1ed1b` |
| B13 — pattern-miner persists severity/lifecycle/source_round_ids | PASS | `73d171d8` |
| B14 — pattern-miner partial-success (Promise.allSettled) | PASS | `73d171d8` (combined with B13) |
| B15 — shot-level-sg holed detection via result/lie (not distance==0) | PASS | `a2479831` |
| B16 — full regression sweep: 55 tests pass across 11 files | PASS | (this doc) |

**11 feature commits** (B13+B14 combined). Plan's 16 tasks → 15 executed, 1 skipped.

## Tests added

**11 new test files** under `src/test/coachhelm/v2/`:

```
src/test/coachhelm/v2/
├── gate.test.ts                                  (2 tests)
├── orchestrator-thresholds.test.ts               (7 tests)
├── feedback/coach-behavior.test.ts               (3 tests)
├── learning/behavior-learner.test.ts             (5 tests)
├── learning/cross-learner.test.ts                (2 tests)
├── mining/lie-specific-analysis.test.ts          (14 tests)
├── mining/pattern-miner.test.ts                  (7 tests)
├── mining/shot-pattern-miner.test.ts             (5 tests)
├── mining/shot-state-intelligence.test.ts        (1 test)
├── mining/stats-insight-generator.test.ts        (4 tests)
└── shot-analysis/shot-level-sg.test.ts           (5 tests)
                                                  ─────────
                                                  55 tests
```

All 55 pass (`npx vitest --run src/test/coachhelm/`).

Team D's feedback test (`src/test/golf/actions/player-feedback.test.ts`) still passes — the BehaviorLearner refactor preserved the legacy `learnFromInteraction(UserInteraction)` API as a thin adapter.

## Residual typecheck errors in my owned files

**Zero new.** Every remaining error in owned files was already in
`docs/superpowers/plans/2026-04-21-coachhelm-fix/typecheck-baseline.txt`.
Verified by diffing against baseline — line numbers shifted due to my
imports/helpers, but the error messages + file locations are unchanged.

Remaining pre-existing baseline errors in owned files (Team F or a
dedicated cleanup can tackle):
- `feedback/coach-behavior.ts(76,12)` — `metadata!.metric` narrowing
- `mining/correlation-discovery.ts(860,16)` — unused export
- `mining/correlation-engine.ts(31,11)` + `(141,7)` — unused exports
- `mining/pressure-analysis.ts(192,16)` — unused export
- `mining/resilience-analysis.ts(838,16)` — unused export
- `orchestrator.ts(132,11)` — unused `outcomeValidator` field
- `shot-analysis/shot-level-sg.ts(67,3), (100,5), (106,5), (301,50), (301,55), (312,7)` — narrowing gaps in the yardage-bucket helper

## Deviations from the plan

### 1. `logServerError` signature
The plan's examples showed `logServerError(message, error, { metadata })`.
The actual signature is `logServerError(message, context: RoundErrorContext, severity?)`
where context includes `metadata`. Adapted every error-reporting site to
the real signature. This is a consistent change across B1, B2, B3, B6,
B7, B8, B13, B14.

### 2. `(supabase as any)` alternative
The plan forbade `(supabase as any)` casts in new code. For tables not
in the generated Database types (`golf_global_patterns`, which Team A
applied via `execute_sql` rather than `apply_migration`, and thus not
in the types regen), I used a typed-accessor bridge:

```ts
const fromFn = (supabase as unknown as {
  from: (t: string) => { <typed-chain> };
}).from;
const { error } = await fromFn.call(supabase, 'golf_global_patterns').upsert(rows, opts);
```

This keeps the concrete call typed without a blanket `any` cast and can
be dropped verbatim once Team A's follow-up regens the types.

### 3. Task B11 skipped — `TeamForecaster` is NOT dead
`src/app/golf/actions/insights.ts:42` (Team C's file) imports and calls
`generateTeamForecasts` at line 1898. The plan assumed no callers
existed. I left the file in place rather than breaking Team C's
build. Team C should decide whether to remove the import and delete
the forecaster, or keep both.

### 4. Task B2 — `learnFromInteraction` retained
The plan asked to replace `learnFromInteraction` with `recordInteraction`
and update callers. Team D's `player-feedback.ts` (already merged to
main) depends on `learnFromInteraction(UserInteraction)`. I kept
`learnFromInteraction` as a thin adapter that forwards to the new
event-log `recordInteraction`, so both APIs work with the live schema.

### 5. Task B2 — `target_id` column
Plan's new insert payload included a `target_id` column. The live
`golf_learned_behavior` table has NO `target_id` column — Team A's
schema re-snapshot confirms this. My implementation carries the
target id inside `metadata.target_id` (jsonb) so the information is
still persisted but the row shape matches the live DB.

### 6. Task B13 + B14 combined into one commit
Plan listed them as separate commits, but both modifications touched
the same `savePatterns` function. Combining avoided a broken
intermediate commit where `toRow` existed but the loop body hadn't
been converted to `Promise.allSettled` yet.

### 7. Task B9 — three hardcoded thresholds collapsed
Plan mentioned lines 481, 493, 508. After reading `generateAlerts`
in detail, I replaced all three with the single
`applyPhilosophyThresholds` helper rather than three separate call
sites, since the severity decision at 481/508 and the filter at 493
follow the same logic flow.

## Items for Team E follow-up

1. **`confidence-calibrator` persistence** — I touched no persistence
   logic in `src/lib/coachhelm/v2/feedback/confidence-calibrator.ts`
   (Team E owns persistence). My B9 change calls
   `this.confidenceCalibrator.calibrate(reasoning.confidence)`
   synchronously — Team E should confirm the in-memory vs DB state
   story for that call path.

2. **Cron invocations of the engine** — my B2 refactor to event-log
   eliminates the load-mutate-save race. The cron that was failing
   silently per LIVE-19 can now invoke `BehaviorLearner.recordInteraction`
   repeatedly without risking lost writes; please add that to the
   cron plan if not already.

3. **Pattern-miner partial-success logs** — B14 sends failures through
   `logServerError`. Confirm the admin dashboard picks these up under
   the `coachhelm.mining` featureArea filter; otherwise create a
   Grafana/Sentry saved view.

4. **`golf_global_patterns` types regen** — Team A applied the migration
   via `execute_sql`, so `golf_global_patterns` / `golf_insight_player_feedback`
   are NOT yet in `src/lib/types/database.ts`. Once Team A (or Team F)
   runs the types regen, my typed-accessor bridges in `cross-learner.ts`
   can be deleted and replaced with the standard `supabase.from('golf_global_patterns')`
   call that infers the row types.

## Commit count

| Phase | Commits |
|-------|---------|
| B1    | 1 |
| B2    | 1 |
| B3    | 1 |
| B4    | 1 |
| B5    | 1 |
| B6    | 1 |
| B7    | 1 |
| B8    | 1 |
| B9    | 1 |
| B12   | 1 |
| B13 + B14 combined | 1 |
| B15   | 1 |
| **Total** | **12** feature commits (plus this doc) |

## Verification summary

- `npx vitest --run src/test/coachhelm/` → 11 files, 55 tests, all green
- `npx vitest --run src/test/golf/actions/player-feedback.test.ts` → 6 green (Team D's test compat preserved)
- `npx tsc --noEmit` → 0 new errors in owned files (same count as Team A baseline)
- No new `(supabase as any)` casts introduced in owned code
- No `console.error` for handled errors in owned code — all go through `logServerError`
