# CoachHelm Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loops CoachHelm already builds but never reads, stop it reporting numbers it did not compute, and surface intelligence that exists in prod but reaches no human.

**Architecture:** Every task here is a *wiring* fix, not new intelligence. The signals are already computed correctly and sitting in real production tables; the defects are dead read paths, hardcoded literals that bypass an existing honesty guarantee, a cron schedule that contradicts its own dependency chain, and one fully-built component imported nowhere. Tasks are ordered so each ships independently — no task depends on a later one.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (Postgres + RLS), Vitest, Vercel Cron.

## Global Constraints

- Types come from `@/lib/types` only. Never `@/types/database` or `@/types/supabase` — they do not exist.
- Server code uses `await createClient()` from `@/lib/supabase/server`; admin/cron code uses `createAdminClient()` from `@/lib/supabase/admin`.
- All golf tables are sport-prefixed: `golf_*`. A bare `insights`/`predictions` table name is always wrong.
- No `any` types. No `console.log`.
- Destructive DELETE-then-INSERT in a save/submit/sync path is banned by the repo's semgrep gate. Migrations that delete rows must be scoped and justified in a comment.
- Never add `GRANT ... TO anon` on any RPC. This repo has a recurring regression where agents do; the Review Gate will fail the PR.
- Migrations are additive and forward-only. Apply against prod only with explicit owner approval.
- Run `npm run typecheck` and `npm run lint` before every commit. Both must exit 0.
- Vitest: `npm test` runs the unit project only. Use `npx vitest run <path>` for a single file.

**Verified prod state at plan time (2026-07-25 03:30 UTC), for reference in assertions:**
- `golf_coach_insights`: 548 rows, 30 players, 191 archived, 0 duplicate signatures
- `golf_confidence_calibration`: 7 rows — `score_to_par` live (buckets 0.4=1/1, 0.6=5/4, 0.8=11/11); `general` and `round_score` frozen at **0% accuracy since 2026-03-14**
- `golf_coachhelm_coach_weights`: 4 rows, one coach, weights 0.77/0.99/1.60/0.93
- `golf_learned_behavior`: 24 rows, last write 2026-07-10
- `golf_player_genome`: 52 rows, last computed 2026-07-07

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `src/lib/coachhelm/v2/__tests__/calibration-type-filter.test.ts` | Guard the bootstrap type filter | 1 |
| `src/lib/coachhelm/v2/orchestrator.ts` | Bootstrap calibration; stop discarding behavior prefs | 2, 9 |
| `src/lib/coachhelm/v2/reasoning/confidence-calibrator.ts` | Already correct — read only | 2 |
| `src/lib/coachhelm/v3/composite/rules/short-approach-proximity-gap.ts` | Real `sample_n` from sources | 3 |
| `src/lib/coachhelm/v3/composite/rules/bunker-miss-side-amplifier.ts` | Real `sample_n` from sources | 3 |
| `src/lib/coachhelm/v3/composite/rules/long-approach-3putt-cascade.ts` | Real `sample_n` from sources | 3 |
| `src/lib/coachhelm/v3/composite/__tests__/no-hardcoded-sample-n.test.ts` | Guard the whole rules dir | 3 |
| `src/lib/coachhelm/v3/generators/pressure-gap.ts` | Cohort-anchored priority | 4 |
| `src/components/fairway/pages/coachhelm/InsightCard.tsx` | Render trust chips | 5 |
| `vercel.json` | Cron order matching the dependency chain | 6 |
| `src/app/api/cron/v3/causality-attribute/route.ts` | Persist the run summary | 7 |
| `supabase/migrations/<ts>_goal_suggestions_dedup.sql` | Partial UNIQUE index | 8 |
| `src/lib/coachhelm/v3/goals/suggestion-writer.ts` | Upsert instead of insert | 8 |
| `src/lib/coachhelm/v3/engine/generator-base.ts` | Volume-scaled sample floor (`minSampleN`, line 308/476) | 11 |

---

### Task 1: Pin the calibration bootstrap's type filter with a test

**REVISED 2026-07-25 — the original Task 1 was wrong and has been withdrawn.**

It specified a production `DELETE FROM golf_confidence_calibration` to remove the
two prediction types frozen at 0% accuracy since 2026-03-14, on the stated
grounds that Task 2 would otherwise load them as live calibration data. That
premise is false: `bootstrapFromDb()` (`confidence-calibrator.ts:218`) already
does `rows.filter((r) => r.prediction_type === predictionType)`, and Task 2
passes `'score_to_par'`. The stale rows are unreachable by construction — no
delete is needed, and a destructive write against shared prod to fix a
non-problem is not acceptable.

What IS worth doing: that safety is currently incidental. Nothing stops a future
change from bootstrapping without a type filter, or passing a type that happens
to match a dead bucket. Make the invariant explicit and enforced.

**Files:**
- Test: `src/lib/coachhelm/v2/__tests__/calibration-type-filter.test.ts`

**Interfaces:**
- Consumes: `bootstrapFromDb(supabase, predictionType)` — existing, unchanged
- Produces: no exports — a regression guard only

- [ ] **Step 1: Write the test**

Create `src/lib/coachhelm/v2/__tests__/calibration-type-filter.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { bootstrapFromDb, invalidateCalibrationCache } from '../reasoning/confidence-calibrator';

/**
 * Prod contains buckets for prediction types no code produces any more
 * (`general` and `round_score`, frozen 2026-03-14 at 0/61 correct). They are
 * harmless ONLY because bootstrap filters by prediction_type. This test makes
 * that load-bearing filter explicit: without it, a 0%-accuracy bucket would
 * become live calibration and crush every high-confidence prediction.
 */
function supabaseReturning(rows: unknown[]) {
  return {
    from: () => ({ select: () => Promise.resolve({ data: rows, error: null }) }),
  } as never;
}

const STALE_AND_LIVE = [
  { bucket: 0.8, prediction_type: 'general', predictions_count: 30, correct_count: 0, actual_accuracy: 0, calibration_error: 0.8 },
  { bucket: 0.8, prediction_type: 'round_score', predictions_count: 30, correct_count: 0, actual_accuracy: 0, calibration_error: 0.8 },
  { bucket: 0.8, prediction_type: 'score_to_par', predictions_count: 11, correct_count: 11, actual_accuracy: 1, calibration_error: 0.2 },
];

describe('calibration bootstrap type filter', () => {
  it('loads only the requested prediction type, never a dead one', async () => {
    invalidateCalibrationCache();
    const record = await bootstrapFromDb(supabaseReturning(STALE_AND_LIVE), 'score_to_par');
    // 11 from score_to_par only — NOT 71 (which would mean the two
    // 0%-accuracy types leaked in).
    expect(record.totalPredictions).toBe(11);
    const top = record.buckets.find((b) => b.rangeStart >= 0.8 - 1e-9)!;
    expect(top.actualCorrect).toBe(11);
  });

  it('returns an empty record for a type with no rows rather than falling back', async () => {
    invalidateCalibrationCache();
    const record = await bootstrapFromDb(supabaseReturning(STALE_AND_LIVE), 'nonexistent_type');
    expect(record.totalPredictions).toBe(0);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/lib/coachhelm/v2/__tests__/calibration-type-filter.test.ts`

Expected: 2 passed. These pass against today's code — the filter already
exists. This test exists to keep it there. If either fails, the filter has
regressed and Task 2 must not ship until it is restored.

If the mock shape does not satisfy `loadBuckets`, read that function and adapt
the mock to whatever it actually calls — do not weaken the assertions.

- [ ] **Step 3: Commit**

```bash
git add src/lib/coachhelm/v2/__tests__/calibration-type-filter.test.ts
git commit -m "test(coachhelm): pin the calibration bootstrap type filter"
```

**Note for whoever cleans up later:** the `general`/`round_score` rows can be
removed as ordinary housekeeping whenever convenient, but that is unrelated to
this remediation and must not be bundled with it.

### Task 2: Bootstrap confidence calibration (P0)

**Precondition:** Task 1's type-filter test passes. Task 2 relies on
`bootstrapFromDb` filtering by `prediction_type` — that is what makes the dead
0%-accuracy buckets in prod unreachable.

`ConfidenceCalibrator` is constructed empty and never populated. `.calibrate()` has 7 call sites; `.update()` has zero. Every call hits the `predictedCount < 5` guard in `calibrateConfidence()` (`confidence-calibrator.ts:60`) and returns the raw value unchanged. The number rendered to coaches and players as "calibrated confidence" (`PlayerCoachHelmHome.tsx:290`, `FairwayPlayerCoachHelm.tsx:1203`, `PerformancePrediction.tsx:51`) is raw model confidence wearing a label.

`bootstrapFromDb()` and `setRecord()` already exist and nothing calls them
outside their own file. `setRecord()` is correct. **`bootstrapFromDb()` is
not** — Task 1 surfaced a bucket-mapping bug in it, verified in source on
2026-07-24, and it must be fixed FIRST (Step 0 below) or this task makes
things worse rather than better.

The bug: `computeBucketRows` (same file, ~line 247) documents that "the
stored `bucket` column is the range start", so `bucket` is always one of
0, 0.2, 0.4, 0.6, 0.8. But `bootstrapFromDb` maps it with
`row.bucket >= b.rangeStart && row.bucket < b.rangeEnd + 1e-9` — the
epsilon is applied to EVERY bucket's `rangeEnd`, not just the last, so each
stored start also satisfies the range *below* it and `findIndex` returns
that earlier, wrong one. Four of the five buckets misfile one band low;
only `0` maps correctly.

Against prod's live rows (`0.4=1/1`, `0.6=5/4`, `0.8=11/11`) that means
wiring calibration on without the fix loads the 11/11 bucket into the
0.6–0.8 band, so a raw confidence of 0.65 renders as **100%** instead of
80% — a confidently wrong number shown to coaches and players. Today's
un-bootstrapped behaviour at least degrades to an honest raw value.

**Files:**
- Modify: `src/lib/coachhelm/v2/reasoning/confidence-calibrator.ts` (the range predicate in `bootstrapFromDb`)
- Modify: `src/lib/coachhelm/v2/orchestrator.ts:238-242` (constructor), plus a new private method
- Modify: `src/lib/coachhelm/v2/__tests__/calibration-type-filter.test.ts` (restore its fixture to a prod-legal value)
- Test: `src/lib/coachhelm/v2/__tests__/calibration-bucket-mapping.test.ts`
- Test: `src/lib/coachhelm/v2/__tests__/calibration-bootstrap.test.ts`

**Interfaces:**
- Consumes: `bootstrapFromDb(supabase: AdminSupabase, predictionType: string): Promise<CalibrationRecord>` and `ConfidenceCalibrator.setRecord(record: CalibrationRecord): this`, both from `./reasoning` — existing, unchanged
- Produces: `CoachHelmOrchestrator.ensureCalibrationBootstrapped(): Promise<void>` — idempotent, safe to call on every analysis entry point

#### Step 0 — PREREQUISITE: fix the bucket mapping (added 2026-07-24, after Task 1)

Do this before Step 1. Steps 0.1–0.5 are one commit; the rest of the task is a second commit.

- [ ] **Step 0.1: Write the failing test**

Create `src/lib/coachhelm/v2/__tests__/calibration-bucket-mapping.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  bootstrapFromDb,
  calibrateConfidence,
  invalidateCalibrationCache,
} from '../reasoning/confidence-calibrator';

function supabaseReturning(rows: unknown[]) {
  return {
    from: () => ({ select: () => Promise.resolve({ data: rows, error: null }) }),
  } as never;
}

/** Prod's live score_to_par rows, verbatim: 0.4=1/1, 0.6=5/4, 0.8=11/11. */
const PROD_ROWS = [
  { bucket: 0.4, prediction_type: 'score_to_par', predictions_count: 1, correct_count: 1, actual_accuracy: 1, calibration_error: 0.5 },
  { bucket: 0.6, prediction_type: 'score_to_par', predictions_count: 5, correct_count: 4, actual_accuracy: 0.8, calibration_error: 0.1 },
  { bucket: 0.8, prediction_type: 'score_to_par', predictions_count: 11, correct_count: 11, actual_accuracy: 1, calibration_error: 0.1 },
];

const at = (record: { buckets: Array<{ rangeStart: number }> }, start: number) =>
  record.buckets.find((b) => Math.abs(b.rangeStart - start) < 1e-9)!;

describe('bootstrapFromDb bucket mapping', () => {
  it('files each stored range-start into its OWN range, not the band below', async () => {
    invalidateCalibrationCache();
    const record = await bootstrapFromDb(supabaseReturning(PROD_ROWS), 'score_to_par');
    expect(at(record, 0.4).predictedCount).toBe(1);
    expect(at(record, 0.6).predictedCount).toBe(5);
    expect(at(record, 0.8).predictedCount).toBe(11);
    // Bands with no stored row stay empty.
    expect(at(record, 0).predictedCount).toBe(0);
    expect(at(record, 0.2).predictedCount).toBe(0);
    expect(record.totalPredictions).toBe(17);
  });

  it('calibrates 0.65 from the 0.6 band (4/5), not the 0.8 band (11/11)', async () => {
    invalidateCalibrationCache();
    const record = await bootstrapFromDb(supabaseReturning(PROD_ROWS), 'score_to_par');
    // The 0.6 band is 4/5 = 0.80 and clears the 5-sample floor exactly.
    // Pre-fix this returned 1.0 — the 11/11 bucket misfiled one band low.
    expect(calibrateConfidence(0.65, record)).toBeCloseTo(0.8, 5);
  });
});
```

- [ ] **Step 0.2: Run it to confirm both tests fail**

Run: `npx vitest run src/lib/coachhelm/v2/__tests__/calibration-bucket-mapping.test.ts`

Expected: both FAIL. Test 1 reports `0.6` band count 1 and `0.8` band count 5 (everything shifted one band low, and 11 landed outside any asserted band). Test 2 reports `expected 1 to be close to 0.8`. Those two failures ARE the bug.

- [ ] **Step 0.3: Fix the predicate**

In `src/lib/coachhelm/v2/reasoning/confidence-calibrator.ts`, inside `bootstrapFromDb`, replace the range-mapping comment and `findIndex` (currently `// Map persisted buckets onto the 5 [0,0.2)…[0.8,1.0] ranges.` through the `findIndex` call) with:

```typescript
  // The stored `bucket` column IS the range start — see computeBucketRows
  // below, which derives it from BUCKET_STARTS. So match it by identity, not
  // by containment. The previous predicate (`row.bucket < b.rangeEnd + 1e-9`)
  // applied its epsilon to EVERY bucket's rangeEnd, so each stored start also
  // satisfied the range below it and findIndex returned that earlier, wrong
  // one: 0.2/0.4/0.6/0.8 all misfiled one band low, and only 0 was correct.
  for (const row of forType) {
    const rangeIdx = record.buckets.findIndex(
      (b) => Math.abs(row.bucket - b.rangeStart) < 1e-9,
    );
```

Leave the `if (rangeIdx === -1) continue;` line and everything after it as-is — it now correctly skips a stored value that is not one of the five canonical starts.

Do NOT touch `calibrateConfidence` (line ~58) or `updateCalibrationRecord` (line ~70). Both take a raw confidence and correctly use half-open containment; only `bootstrapFromDb` consumes a stored bucket key.

- [ ] **Step 0.4: Restore Task 1's fixture to a prod-legal value**

Task 1's test worked around this bug with a fixture value prod can never store. In `src/lib/coachhelm/v2/__tests__/calibration-type-filter.test.ts`: change the `score_to_par` row's `bucket` from `0.85` to `0.8`, and delete the `// NOTE: score_to_par uses bucket 0.85 …` comment block above `STALE_AND_LIVE` (it documents the bug you just fixed). Leave every assertion unchanged.

- [ ] **Step 0.5: Verify both files pass, then commit**

Run: `npx vitest run src/lib/coachhelm/v2/__tests__/calibration-bucket-mapping.test.ts src/lib/coachhelm/v2/__tests__/calibration-type-filter.test.ts`

Expected: 4 passed. Then `npm run typecheck` and `npm run lint`, both exit 0.

```bash
git add src/lib/coachhelm/v2/reasoning/confidence-calibrator.ts \
        src/lib/coachhelm/v2/__tests__/calibration-bucket-mapping.test.ts \
        src/lib/coachhelm/v2/__tests__/calibration-type-filter.test.ts
git commit -m "fix(coachhelm): map persisted calibration buckets by range start, not containment"
```

#### The original task continues here

- [ ] **Step 1: Write the failing test**

Create `src/lib/coachhelm/v2/__tests__/calibration-bootstrap.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  ConfidenceCalibrator,
  calibrateConfidence,
  createEmptyCalibrationRecord,
} from '../reasoning/confidence-calibrator';
import type { CalibrationRecord } from '../reasoning/confidence-calibrator';

/** Mirrors prod: score_to_par bucket 0.8 is 11/11 correct. */
function recordWithLiveBucket(): CalibrationRecord {
  const record = createEmptyCalibrationRecord();
  const idx = record.buckets.findIndex((b) => b.rangeStart >= 0.8 - 1e-9);
  record.buckets[idx] = {
    ...record.buckets[idx]!,
    predictedCount: 11,
    actualCorrect: 11,
    actualAccuracy: 1.0,
    calibrationError: 0,
  };
  record.totalPredictions = 11;
  return record;
}

describe('confidence calibration bootstrap', () => {
  it('an un-bootstrapped calibrator is a no-op (the bug)', () => {
    const cal = new ConfidenceCalibrator();
    expect(cal.calibrate(0.85)).toBeCloseTo(0.85, 5);
  });

  it('a bootstrapped calibrator actually moves the number', () => {
    const cal = new ConfidenceCalibrator().setRecord(recordWithLiveBucket());
    const calibrated = cal.calibrate(0.85);
    expect(calibrated).not.toBeCloseTo(0.85, 5);
  });

  it('buckets under the 5-sample floor still pass through unchanged', () => {
    const record = createEmptyCalibrationRecord();
    const idx = record.buckets.findIndex((b) => b.rangeStart >= 0.4 - 1e-9);
    record.buckets[idx] = { ...record.buckets[idx]!, predictedCount: 1, actualCorrect: 1 };
    expect(calibrateConfidence(0.45, record)).toBeCloseTo(0.45, 5);
  });
});
```

- [ ] **Step 2: Run it to confirm the second test fails**

Run: `npx vitest run src/lib/coachhelm/v2/__tests__/calibration-bootstrap.test.ts`

Expected: test 1 and 3 PASS, test 2 FAILS (`expected 0.85 not to be close to 0.85`). That failure IS the bug — the calibrator is inert.

If test 2 passes already, `setRecord` is not being applied; re-read `calibrateConfidence` before continuing.

- [ ] **Step 3: Wire the bootstrap into the orchestrator**

In `src/lib/coachhelm/v2/orchestrator.ts`, extend the import on line 48:

```typescript
import { ReasoningEngine, ConfidenceCalibrator, bootstrapFromDb } from './reasoning';
```

Add a field next to `confidenceCalibrator` (near line 226):

```typescript
  private calibrationBootstrapped = false;
```

Add this method immediately after the constructor (which ends at line 242):

```typescript
  /**
   * Load persisted calibration buckets into the in-memory calibrator.
   *
   * Without this, `confidenceCalibrator` is constructed empty and every
   * `.calibrate()` call trips the `predictedCount < 5` floor and returns the
   * raw confidence unchanged — so `calibratedConfidence` was raw confidence
   * under a different name. `.update()` is never called anywhere, so the
   * in-memory record can only ever be populated from the DB.
   *
   * Idempotent and failure-silent: a calibration outage must degrade to
   * today's behaviour (raw passthrough), never break analysis.
   */
  private async ensureCalibrationBootstrapped(): Promise<void> {
    if (this.calibrationBootstrapped) return;
    this.calibrationBootstrapped = true;
    try {
      const supabase = createAdminClient();
      const record = await bootstrapFromDb(supabase, 'score_to_par');
      this.confidenceCalibrator.setRecord(record);
    } catch {
      // Leave the empty record in place — raw passthrough, same as before.
    }
  }
```

Then call it at the top of `analyzePlayer` (the method beginning at line 250), as the first statement of the body:

```typescript
    await this.ensureCalibrationBootstrapped();
```

- [ ] **Step 4: Verify the unit tests pass**

Run: `npx vitest run src/lib/coachhelm/v2/__tests__/calibration-bootstrap.test.ts`

Expected: 3 passed.

- [ ] **Step 5: Verify the type checks**

Run: `npm run typecheck`

Expected: exit 0. `bootstrapFromDb` must be re-exported from `./reasoning`; if typecheck reports it is not, add `export { bootstrapFromDb } from './confidence-calibrator';` to `src/lib/coachhelm/v2/reasoning/index.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/coachhelm/v2/orchestrator.ts src/lib/coachhelm/v2/__tests__/calibration-bootstrap.test.ts
git commit -m "fix(coachhelm): bootstrap ConfidenceCalibrator so calibrated confidence is real"
```

---

### Task 3: Stop three composite rules shipping a fake `sample_n`

`short-approach-proximity-gap.ts:77` ships `sample_n: 10`, `bunker-miss-side-amplifier.ts:117` ships `sample_n: 5`, `long-approach-3putt-cascade.ts:85` ships `sample_n: 5` — all literals. In prod, every live `short_approach_proximity_gap` row carries an identical `sample_n = 10`, and both `bunker_miss_side_amplifier` rows carry `sample_n = 5`. These are the insights combining the *richest* evidence, and they are the ones bypassing the confidence-honesty guarantee.

`lag-distance-3putt.ts:78-81` already does it correctly — take the minimum of the source insights' real sample sizes.

**Files:**
- Modify: `src/lib/coachhelm/v3/composite/rules/short-approach-proximity-gap.ts` (detect + compose)
- Modify: `src/lib/coachhelm/v3/composite/rules/bunker-miss-side-amplifier.ts` (detect + compose)
- Modify: `src/lib/coachhelm/v3/composite/rules/long-approach-3putt-cascade.ts` (detect + compose)
- Test: `src/lib/coachhelm/v3/composite/__tests__/no-hardcoded-sample-n.test.ts`

**Interfaces:**
- Consumes: `CompositeMatch.signals` (a `Record<string, unknown>`) and `EvidenceInsight.evidence.sample_n`
- Produces: no new exports — behavioural change only

- [ ] **Step 1: Write the guard test**

Create `src/lib/coachhelm/v3/composite/__tests__/no-hardcoded-sample-n.test.ts`:

```typescript
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RULES_DIR = join(__dirname, '..', 'rules');

describe('composite rules', () => {
  it('never ship a hardcoded numeric sample_n in evidence', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(RULES_DIR).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(join(RULES_DIR, file), 'utf8');
      src.split('\n').forEach((line, i) => {
        // `sample_n: 10,` is a fabricated confidence input. `sample_n: sampleN`
        // or `sample_n: Number(...)` derives it from real source evidence.
        if (/^\s*sample_n:\s*\d+\s*,?\s*$/.test(line)) {
          offenders.push(`${file}:${i + 1} → ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it catches all three**

Run: `npx vitest run src/lib/coachhelm/v3/composite/__tests__/no-hardcoded-sample-n.test.ts`

Expected: FAIL, listing exactly three offenders — `short-approach-proximity-gap.ts:77`, `bunker-miss-side-amplifier.ts:117`, `long-approach-3putt-cascade.ts:85`.

- [ ] **Step 3: Fix short-approach-proximity-gap.ts**

In `detect()`, add the real sample size to the returned signals:

```typescript
  detect(insights) {
    const approach = insights.find(isWeakShortApproach);
    const scramble = insights.find(isWeakScrambling);
    if (!approach || !scramble) return null;
    return {
      source_insight_ids: [approach.id, scramble.id],
      signals: {
        approach_proximity_ft: approachProximityFeet(approach),
        scramble_pct: Number(scramble.evidence.your_value ?? 0),
        // Honest floor: a composite is only as well-evidenced as its
        // thinnest source. Mirrors lag-distance-3putt.ts:78-81.
        sample_n: Math.min(
          Number(approach.evidence.sample_n ?? 0),
          Number(scramble.evidence.sample_n ?? 0),
        ),
      },
    };
  },
```

In `compose()`, replace line 77 (`sample_n: 10,`) with:

```typescript
        sample_n: Number(match.signals.sample_n ?? 0),
```

- [ ] **Step 4: Fix bunker-miss-side-amplifier.ts**

In `detect()`, add to the returned signals (alongside the existing `same_hole_share: 0`):

```typescript
        sample_n: Math.min(
          Number(sandWeak.evidence.sample_n ?? 0),
          Number(puttBias.evidence.sample_n ?? 0),
        ),
```

In `compose()`, replace line 117 (`sample_n: 5,`) with:

```typescript
        sample_n: Number(match.signals.sample_n ?? 0),
```

- [ ] **Step 5: Fix long-approach-3putt-cascade.ts**

Its `detect()` binds the two sources as `longApproach` and `midPutt`. Add to the returned signals:

```typescript
        sample_n: Math.min(
          Number(longApproach.evidence.sample_n ?? 0),
          Number(midPutt.evidence.sample_n ?? 0),
        ),
```

In `compose()`, replace line 85 (`sample_n: 5,`) with:

```typescript
        sample_n: Number(match.signals.sample_n ?? 0),
```

- [ ] **Step 6: Remove the unreachable branch in the bunker rule**

While in `bunker-miss-side-amplifier.ts`: `coOccurrenceShare()` (line 32) is a working, exported function with **zero call sites**, and `detect()` hardcodes `same_hole_share: 0`. So `compose()`'s `share` is always 0 and the stronger "same-hole compounding" template is structurally unreachable — every one of the 2 live prod rows serves the hedged version. The file's docblock calls the rule "DORMANT", which is also false.

Do not delete the function — it is correct and will be needed once hole-level data is threaded through. Instead mark the gap honestly so it is not mistaken for working behaviour. Above `coOccurrenceShare`, add:

```typescript
/**
 * NOT YET WIRED. `detect()` has no hole-level data to pass, so it hardcodes
 * `same_hole_share: 0` and `compose()` always renders the hedged template.
 * Wiring this requires per-hole bunker and putt-miss arrays reaching detect();
 * until then the stronger compounding claim is deliberately unreachable
 * rather than silently wrong.
 */
```

and correct the file's top docblock: replace the word `DORMANT` with `LIVE (hedged template only — see coOccurrenceShare)`, since the rule does produce prod rows.

- [ ] **Step 7: Run the guard test and the composite suite**

Run: `npx vitest run src/lib/coachhelm/v3/composite/`

Expected: all pass, including the new guard with an empty offenders array.

- [ ] **Step 8: Commit**

```bash
git add src/lib/coachhelm/v3/composite/
git commit -m "fix(coachhelm): derive composite sample_n from source evidence, not literals"
```

---

### Task 4: Anchor PressureGap priority to the college cohort, not the PGA Tour

`pressure-gap.ts:253` gates `priority: 'high'` at `agg.playerValue > 0.5` — a flat PGA Tour reference. The same file's own comment at lines 249-252 says college-typical is 2-5 strokes and flags this as a known open caveat. In prod, active `pressure_gap` rows at `high` priority average **4.08 strokes** — squarely inside the range the code itself calls normal for college.

**Files:**
- Modify: `src/lib/coachhelm/v3/generators/pressure-gap.ts:253`
- Test: `src/lib/coachhelm/v3/generators/__tests__/pressure-gap-priority.test.ts`

**Interfaces:**
- Consumes: `agg.playerValue: number`, and `standing?.level_avg?: number | null` where available on the generator's standing input
- Produces: no new exports

- [ ] **Step 1: Write the failing test**

Create `src/lib/coachhelm/v3/generators/__tests__/pressure-gap-priority.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { pressureGapPriority } from '../pressure-gap';

describe('pressureGapPriority', () => {
  it('does not call a college-typical 4-stroke gap "high"', () => {
    expect(pressureGapPriority(4.08, null)).not.toBe('high');
  });

  it('calls a genuinely extreme gap "high"', () => {
    expect(pressureGapPriority(9, null)).toBe('high');
  });

  it('treats performing better under pressure as low priority', () => {
    expect(pressureGapPriority(-0.4, null)).toBe('low');
  });

  it('prefers the cohort average when one is available', () => {
    // 4 strokes against a cohort that averages 1.0 IS notable.
    expect(pressureGapPriority(4, 1.0)).toBe('high');
    // The same 4 strokes against a cohort averaging 4.2 is not.
    expect(pressureGapPriority(4, 4.2)).not.toBe('high');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/coachhelm/v3/generators/__tests__/pressure-gap-priority.test.ts`

Expected: FAIL — `pressureGapPriority is not a function`.

- [ ] **Step 3: Extract and fix the threshold**

In `src/lib/coachhelm/v3/generators/pressure-gap.ts`, add this exported function above the generator definition:

```typescript
/**
 * Priority for a competitive-vs-practice scoring gap, in strokes.
 *
 * The old gate was `playerValue > 0.5` — the PGA Tour reference from
 * Research doc §9. College-typical is 2-5 strokes (same doc, and this
 * file's own comment), so a Tour anchor flagged ordinary college golfers
 * as "high priority": prod showed active high-priority rows averaging
 * 4.08 strokes, dead centre of documented-normal.
 *
 * When cohort data is present (`level_avg`), compare against the player's
 * actual peer group. Otherwise fall back to a college-typical floor —
 * the top of the documented 2-5 band, so only genuinely unusual gaps
 * escalate.
 */
export function pressureGapPriority(
  playerValue: number,
  levelAvg: number | null | undefined,
): 'high' | 'medium' | 'low' {
  if (playerValue <= 0) return 'low';
  const threshold =
    typeof levelAvg === 'number' && Number.isFinite(levelAvg) && levelAvg > 0
      ? levelAvg * 2
      : 5;
  return playerValue > threshold ? 'high' : 'medium';
}
```

Then replace line 253:

```typescript
      priority: pressureGapPriority(agg.playerValue, standing?.level_avg ?? null),
```

If the generator's standing variable is named something other than `standing` at that point in the file, use the actual name — read the surrounding `compose`/`build` scope to confirm before editing.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/coachhelm/v3/generators/__tests__/pressure-gap-priority.test.ts`

Expected: 4 passed.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/coachhelm/v3/generators/
git commit -m "fix(coachhelm): anchor pressure-gap priority to college cohort, not PGA Tour"
```

---

### Task 5: Render the trust chips that already exist

`src/components/fairway/pages/coachhelm/InsightTrustChips.tsx` is a complete, documented, ledger-backed component exported at line 205 and **imported nowhere**. Meanwhile `FairwayEffectiveness.tsx:170-213` hand-rolls a duplicate trust vocabulary. The ledger behind it is real and active: 30,456 exposure rows.

Today a coach must leave the insight they are reading and navigate to a separate analytics tab to learn whether this insight type has ever worked.

**Files:**
- Modify: `src/components/fairway/pages/coachhelm/InsightCard.tsx`
- Test: `src/components/fairway/pages/coachhelm/__tests__/InsightCard.trust.test.tsx`

**Interfaces:**
- Consumes: `InsightTrustChips` with props `{ signal?: TrustSignal; className?: string }`; `getInsightEffectivenessSignals(ids: string[])` and `type TrustSignal` from `@/lib/coachhelm/v3/effectiveness/event-ledger`
- Produces: `InsightCard` accepts a new optional prop `trustSignal?: TrustSignal`

- [ ] **Step 1: Write the failing test**

Create `src/components/fairway/pages/coachhelm/__tests__/InsightCard.trust.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightCard } from '../InsightCard';
import type { TrustSignal } from '@/lib/coachhelm/v3/effectiveness/event-ledger';

// Minimal insight fixture — extend with whatever InsightCard's props require.
const INSIGHT = {
  id: 'i-1',
  title: 'Short approaches are stacking up',
  content: 'body',
} as never;

describe('InsightCard trust chips', () => {
  it('renders nothing extra when no trust signal is supplied', () => {
    const { container } = render(<InsightCard insight={INSIGHT} />);
    expect(container.querySelector('[data-slot="insight-trust"]')).toBeNull();
  });

  it('renders the trust chip when a signal is supplied', () => {
    const signal = { status: 'proven', exposures: 12, actions: 4, outcomes: 3 } as TrustSignal;
    const { container } = render(<InsightCard insight={INSIGHT} trustSignal={signal} />);
    expect(container.querySelector('[data-slot="insight-trust"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/fairway/pages/coachhelm/__tests__/InsightCard.trust.test.tsx`

Expected: FAIL — `InsightCard` does not accept `trustSignal`, so the second assertion finds no element.

If the render throws because the `INSIGHT` fixture is missing required fields, read `InsightCard`'s props interface and fill them in — do not weaken the assertions.

- [ ] **Step 3: Add the prop and render the component**

In `InsightCard.tsx`, add the imports:

```typescript
import { InsightTrustChips } from './InsightTrustChips';
import type { TrustSignal } from '@/lib/coachhelm/v3/effectiveness/event-ledger';
```

Add to the props interface:

```typescript
  /**
   * Ledger-derived trust signal for THIS insight, supplied by the parent's
   * batched `getInsightEffectivenessSignals` call. Undefined renders nothing —
   * the chips only ever reflect real ledger data.
   */
  trustSignal?: TrustSignal;
```

Render it inside the card footer, wrapped so the test can find it:

```tsx
      {trustSignal && (
        <div data-slot="insight-trust" className="mt-2">
          <InsightTrustChips signal={trustSignal} />
        </div>
      )}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/fairway/pages/coachhelm/__tests__/InsightCard.trust.test.tsx`

Expected: 2 passed.

- [ ] **Step 5: Batch-fetch the signals in the list view**

In `InsightListView.tsx` (the component that maps over insights and renders `InsightCard`), fetch once for the whole list and pass each card its own signal:

```typescript
const signalMap = await getInsightEffectivenessSignals(insights.map((i) => i.id));
```

then in the map:

```tsx
<InsightCard key={insight.id} insight={insight} trustSignal={signalMap.get(insight.id)} />
```

If `InsightListView` is a client component, move the fetch into the server component that supplies its data and pass `signalMap` down as a plain prop — do not call a server action during client render.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck && npm run lint
git add src/components/fairway/pages/coachhelm/
git commit -m "feat(coachhelm): surface ledger-backed trust chips on insight cards"
```

---

### Task 6: Fix the cron order to match the documented dependency chain

`scripts/coachhelm-refresh-all.sh` documents the pipeline as roster-sweep → standing-refresh → genome-nightly → causality-attribute → goal-suggestions-write → calibration → lifecycle → goal-suggestions-evaluate. `vercel.json` schedules it differently:

| Current | Cron | Problem |
|---|---|---|
| `0 2 * * *` | insight-lifecycle | runs **1h45m before** roster-sweep |
| `30 3 * * *` | calibration | before roster-sweep; collides with goal-write |
| `30 3 * * *` | goal-suggestions-write | collides with calibration |
| `45 3 * * *` | roster-sweep | after its own dependents |
| `45 3 * * *` | goal-suggestions-evaluate | collides with roster-sweep |

Consequence: calibration and goal-writing always compute off *yesterday's* insight state, and a failed roster-sweep can leave a player's insights archived on stale data until the next successful sweep.

**Files:**
- Modify: `vercel.json` (crons array)

**Interfaces:**
- Consumes: nothing
- Produces: nothing — configuration only

- [ ] **Step 1: Confirm the current schedule**

Run:
```bash
python3 -c "
import json; d=json.load(open('vercel.json'))
for c in d['crons']:
    if 'coachhelm' in c['path'] or '/v3/' in c['path']: print(f\"{c['schedule']:<14} {c['path']}\")
"
```

Expected: the five entries in the table above, plus `standing-refresh 0 4`, `genome-nightly 0 5`, `causality-attribute 0 6`.

- [ ] **Step 2: Rewrite the schedules**

Edit `vercel.json` so the CoachHelm crons read exactly:

```json
    { "path": "/api/cron/coachhelm-roster-sweep",        "schedule": "0 2 * * *" },
    { "path": "/api/cron/v3/standing-refresh",           "schedule": "20 2 * * *" },
    { "path": "/api/cron/v3/genome-nightly",             "schedule": "40 2 * * *" },
    { "path": "/api/cron/v3/causality-attribute",        "schedule": "0 3 * * *" },
    { "path": "/api/cron/v3/goal-suggestions-write",     "schedule": "20 3 * * *" },
    { "path": "/api/cron/coachhelm-calibration",         "schedule": "40 3 * * *" },
    { "path": "/api/cron/coachhelm-insight-lifecycle",   "schedule": "0 4 * * *" },
    { "path": "/api/cron/v3/goal-suggestions-evaluate",  "schedule": "20 4 * * *" }
```

Leave `coachhelm-validation` (`15 * * * *`), `coachhelm-safety-net` (`*/30 * * * *`), and `v3/weekly-coach-email` (`0 23 * * 0`) unchanged — they are independent of this chain.

- [ ] **Step 3: Correct the stale docblock**

`src/app/api/cron/coachhelm-roster-sweep/route.ts:11-12` claims the sweep "sits between lifecycle (02:00) and calibration (03:30)". That was already wrong and is now doubly so. Replace those lines with:

```typescript
 * Runs FIRST in the nightly chain (02:00). Everything downstream —
 * standing-refresh, genome, causality, goal-suggestions, calibration,
 * lifecycle — depends on the insight state this sweep produces, so it must
 * complete before any of them. See scripts/coachhelm-refresh-all.sh for the
 * canonical order.
```

- [ ] **Step 4: Validate the JSON**

Run:
```bash
python3 -c "import json; json.load(open('vercel.json')); print('vercel.json: valid')"
```

Expected: `vercel.json: valid`.

- [ ] **Step 5: Commit**

```bash
git add vercel.json src/app/api/cron/coachhelm-roster-sweep/route.ts
git commit -m "fix(coachhelm): order nightly crons to match the documented dependency chain"
```

---

### Task 7: Make the causality-attribution stall visible

The cron reports `status=completed` daily while attributing nothing. A live run on 2026-07-25 returned `{"considered":28,"attributed":0,"no_data":28}`. 19 of the last 22 "completed" runs produced zero rows. The summary object is computed but never persisted to `background_job_logs.metadata`, so the stall is invisible from health signals.

**Files:**
- Modify: `src/app/api/cron/v3/causality-attribute/route.ts`

**Interfaces:**
- Consumes: the existing in-route summary object with keys `considered`, `attributed`, `no_data`, `intentional_no_lift`, `unknown_metric`, `malformed`, `errors`
- Produces: the same object persisted to `background_job_logs.metadata`

- [ ] **Step 1: Locate the summary and the job-log write**

Run:
```bash
rg -n "considered|attributed|no_data|background_job_logs|metadata" src/app/api/cron/v3/causality-attribute/route.ts
```

Note the variable holding the summary and whether the route already writes a `background_job_logs` row. If it does not, find the shared helper another cron uses (`rg -n "background_job_logs" src/app/api/cron/ | head`) and reuse it rather than hand-rolling an insert.

- [ ] **Step 2: Persist the summary**

Pass the summary object into the job-log write as `metadata`, so a stalled run is queryable:

```typescript
      metadata: {
        considered: summary.considered,
        attributed: summary.attributed,
        no_data: summary.no_data,
        intentional_no_lift: summary.intentional_no_lift,
        unknown_metric: summary.unknown_metric,
        malformed: summary.malformed,
        errors: summary.errors,
      },
```

- [ ] **Step 3: Verify it lands**

Trigger the cron against production and read the row back:

```bash
curl -sS "https://helmsportslabs.com/api/cron/v3/causality-attribute" -H "Authorization: Bearer $CRON_SECRET"
npx supabase db query "SELECT created_at, metadata FROM background_job_logs WHERE job_name LIKE '%causality%' ORDER BY created_at DESC LIMIT 1;"
```

Expected: the newest row's `metadata` contains non-null `considered` and `attributed` keys.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/v3/causality-attribute/route.ts
git commit -m "fix(coachhelm): persist causality-attribution summary so stalls are visible"
```

---

### Task 8: Add the missing dedup constraint to goal suggestions

`golf_coach_insights` was specifically hardened with a DB-level unique constraint against a three-cron race. `golf_goal_suggestions` has the same exposure and no constraint — `pg_constraint`/`pg_indexes` show only a PK, FKs and CHECKs. The writer (`suggestion-writer.ts:520`) is a plain `.insert()` behind a non-atomic pre-flight read, and the file's own comment at lines 17-20 documents the race. Zero duplicates today: latent, not manifested.

**Files:**
- Create: `supabase/migrations/20260725000100_goal_suggestions_dedup.sql`
- Modify: `src/lib/coachhelm/v3/goals/suggestion-writer.ts:520`

**Interfaces:**
- Consumes: nothing
- Produces: a partial unique index `golf_goal_suggestions_active_dedup`

- [ ] **Step 1: Confirm no duplicates exist before adding the constraint**

Run:
```bash
npx supabase db query "SELECT player_id, metric_id, count(*) FROM golf_goal_suggestions WHERE state IN ('pending','snoozed') GROUP BY 1,2 HAVING count(*) > 1;"
```

Expected: 0 rows. **If any rows come back, STOP** — resolve them first or the index creation will fail.

- [ ] **Step 2: Write the migration**

```sql
-- Close the same concurrent-cron race golf_coach_insights was hardened
-- against. goal-suggestions-write relies on a non-atomic pre-flight read
-- (suggestion-writer.ts:17-20 documents the gap), so two overlapping cron
-- invocations can both pass the check and both insert.
--
-- Partial: only ACTIVE suggestions are constrained. A player may accumulate
-- many historical accepted/expired/dismissed suggestions for the same metric.
CREATE UNIQUE INDEX IF NOT EXISTS golf_goal_suggestions_active_dedup
  ON golf_goal_suggestions (player_id, metric_id)
  WHERE state IN ('pending', 'snoozed');
```

- [ ] **Step 3: Switch the writer to an upsert**

At `suggestion-writer.ts:520`, replace the `.insert(...)` call with:

```typescript
    .upsert(rows, {
      onConflict: 'player_id,metric_id',
      ignoreDuplicates: true,
    })
```

This mirrors `insertNew()` in `src/lib/coachhelm/v2/insights/upsert.ts` exactly — losing the race becomes a no-op instead of a duplicate row.

- [ ] **Step 4: Apply and verify the index exists**

Run:
```bash
npx supabase db query "SELECT indexname FROM pg_indexes WHERE tablename = 'golf_goal_suggestions';"
```

Expected: includes `golf_goal_suggestions_active_dedup`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260725000100_goal_suggestions_dedup.sql src/lib/coachhelm/v3/goals/suggestion-writer.ts
git commit -m "fix(coachhelm): add DB-level dedup for active goal suggestions"
```

---

### Task 9: Stop discarding the BehaviorLearner result

`orchestrator.ts:705-706` constructs a `BehaviorLearner` and awaits `getLearnedPreferences()` — then never assigns the result. A real DB round-trip runs on every alert batch and is thrown away. `golf_learned_behavior` holds 24 real rows fed by player insight ratings from five live UI files.

**Files:**
- Modify: `src/lib/coachhelm/v2/orchestrator.ts:705-706` and the alert-assembly code that follows it
- Test: `src/lib/coachhelm/v2/__tests__/alert-preferences.test.ts`

**Interfaces:**
- Consumes: `BehaviorLearner.getLearnedPreferences(): Promise<LearnedPreferences>`. `LearnedPreferences` is declared at `src/lib/coachhelm/v2/types.ts:354-359` as `{ preferredInsightTypes: string[]; preferredMetrics: string[]; alertFrequency: 'high'|'medium'|'low'; detailLevel: 'brief'|'balanced'|'detailed' }` — verified, do not re-derive
- Produces: `applyLearnedPreferences(alerts, prefs)` — exported from the orchestrator module for testing

- [ ] **Step 1: Write the failing test**

Create `src/lib/coachhelm/v2/__tests__/alert-preferences.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { applyLearnedPreferences } from '../orchestrator';

describe('applyLearnedPreferences', () => {
  it('promotes alert types the coach has historically acted on', () => {
    const alerts = [
      { id: 'a', insightType: 'putting' },
      { id: 'b', insightType: 'driving' },
    ] as never[];
    const prefs = { preferredInsightTypes: ['driving'] } as never;
    const out = applyLearnedPreferences(alerts, prefs);
    expect(out[0]).toMatchObject({ id: 'b' });
  });

  it('is a no-op when there are no learned preferences', () => {
    const alerts = [{ id: 'a' }, { id: 'b' }] as never[];
    const out = applyLearnedPreferences(alerts, null);
    expect(out.map((a: { id: string }) => a.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/coachhelm/v2/__tests__/alert-preferences.test.ts`

Expected: FAIL — `applyLearnedPreferences is not exported`.

- [ ] **Step 3: Implement and wire it**

Add to `orchestrator.ts`:

```typescript
/**
 * Reorder alerts so types this coach has historically engaged with surface
 * first. Stable within each group — this reprioritises, it never drops an
 * alert, so a coach can't lose a real signal to a learned preference.
 */
export function applyLearnedPreferences<T extends { insightType?: string }>(
  alerts: T[],
  prefs: { preferredInsightTypes?: string[] } | null | undefined,
): T[] {
  const preferred = prefs?.preferredInsightTypes;
  if (!preferred || preferred.length === 0) return alerts;
  const isPreferred = (a: T) => (a.insightType ? preferred.includes(a.insightType) : false);
  return [...alerts.filter(isPreferred), ...alerts.filter((a) => !isPreferred(a))];
}
```

Then change lines 705-706 from the discarded await to:

```typescript
    const behaviorLearner = new BehaviorLearner(coachId, 'coach');
    const learnedPrefs = await behaviorLearner.getLearnedPreferences();
```

and apply `learnedPrefs` to the alert array before it is returned from `generateAlerts()`.

- [ ] **Step 4: Run the test, typecheck, commit**

```bash
npx vitest run src/lib/coachhelm/v2/__tests__/alert-preferences.test.ts
npm run typecheck
git add src/lib/coachhelm/v2/
git commit -m "feat(coachhelm): use learned behaviour preferences to order alerts"
```

---

### Task 10: Diagnose why genome-nightly produces nothing

**This is an investigation task, not a code change.** Do not write a fix until the cause is known.

A live run on 2026-07-25 returned `dimensions_computed: 0, dimensions_null: 8, rounds_basis: 0` for every player in the chunk. `golf_player_genome` has 52 rows last written 2026-07-07. The cron runs green and writes nothing, so Task 11 (genome-aware generators) is blocked on this.

**Files:**
- Read: `src/app/api/cron/v3/genome-nightly/route.ts` and whatever computes `rounds_basis`

- [ ] **Step 1: Find where rounds_basis comes from**

Run:
```bash
rg -n "rounds_basis|dimensions_computed" src/ | head
```

- [ ] **Step 2: Reproduce the empty basis in SQL**

Read the query that selects the rounds feeding the genome, then run its `WHERE` clause directly against prod for one of the player IDs from the live run output (e.g. `cc6af58f-744c-4b4f-be6b-c05416840349`). Establish which predicate eliminates every row — a date window, a `coachhelm_analyzed_at` gate, a status filter, or a join that no longer matches.

- [ ] **Step 3: Write up the cause**

Record the finding — the specific predicate and why it now excludes everything — as a comment on the relevant issue or in a follow-up plan. Only then decide the fix.

---

### Task 11: Scale `minSampleN` by round volume

V3 generators use a flat `minSampleN = 5` (15 for tee-strategy) regardless of a player's total round volume. V2's pattern-miner already scales its floor — `Math.min(6, Math.max(3, Math.round(roundCount * 0.15)))` — after a documented incident of "18 starvation events across 5 players in 24h" (`pattern-miner.ts:143-145`). A player with 5 rounds currently gets the same statistical treatment as one with 40.

**Files:**
- Modify: `src/lib/coachhelm/v3/engine/generator-base.ts`
- Test: `src/lib/coachhelm/v3/engine/__tests__/min-sample-scaling.test.ts`

**Interfaces:**
- Consumes: `roundCount: number` — confirm it is available in the generator's aggregate context before editing; if it is not, thread it through from the caller
- Produces: `effectiveMinSampleN(baseMin: number, roundCount: number): number`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { effectiveMinSampleN } from '../generator-base';

describe('effectiveMinSampleN', () => {
  it('never goes below the generator floor', () => {
    expect(effectiveMinSampleN(5, 3)).toBe(5);
  });

  it('scales up for a high-volume player', () => {
    expect(effectiveMinSampleN(5, 40)).toBeGreaterThan(5);
  });

  it('is capped so it never becomes unreachable', () => {
    expect(effectiveMinSampleN(5, 500)).toBeLessThanOrEqual(12);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/coachhelm/v3/engine/__tests__/min-sample-scaling.test.ts`

Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

```typescript
/**
 * Scale a generator's minimum sample floor by the player's round volume,
 * porting V2's pattern-miner behaviour (pattern-miner.ts:143-145) to V3.
 * A 40-round player should clear a higher bar than a 5-round player before
 * the engine claims a pattern.
 */
export function effectiveMinSampleN(baseMin: number, roundCount: number): number {
  const scaled = Math.round(roundCount * 0.15);
  return Math.min(12, Math.max(baseMin, scaled));
}
```

Then use it wherever `minSampleN` is currently compared against a sample size in `generator-base.ts`.

- [ ] **Step 4: Run the full generator suite**

Run: `npx vitest run src/lib/coachhelm/v3/`

Expected: all pass. If existing generator tests now fail because fixtures assumed a flat floor, update the fixtures' round counts — do not lower the cap to make them pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/coachhelm/v3/engine/
git commit -m "fix(coachhelm): scale v3 minimum sample floor by round volume"
```

---

### Task 12: Decide v2/v3 insight coexistence

**This is a decision task, not a code change.** Many players carry both a v2 and a v3 insight covering the same conceptual ground (e.g. v2 `bubble_player` and v3 `putt_bias`, both category `putting`), with nothing retiring the v2 one. Right now this is neither intentional coexistence nor a sunset — it is accumulation.

- [ ] **Step 1: Quantify the overlap**

```bash
npx supabase db query "SELECT category, count(*) FILTER (WHERE signature LIKE 'v3:%') AS v3, count(*) FILTER (WHERE signature NOT LIKE 'v3:%') AS v2 FROM golf_coach_insights WHERE archived_at IS NULL GROUP BY 1 ORDER BY 1;"
```

- [ ] **Step 2: Put the options to the owner**

Present exactly three: (a) archive a v2 insight once a v3 successor exists for the same player+category, (b) document permanent coexistence as intentional until a full v2 sunset, (c) sunset v2 generation entirely. Each needs the owner's call — the data does not settle it.

- [ ] **Step 3: Record the decision**

Write the outcome into `memory/context/coachhelm-ai.md` so the next engineer inherits it, and open a follow-up issue for whichever path was chosen.

---

## Deferred — needs the owner, not an engineer

- **Reconcile `golf_coachhelm_coach_weights.sample_n`.** It runs 1.57–2× higher than the surviving rows in `golf_insight_outcome_attribution`, which `ON DELETE CASCADE`s from `golf_coach_insights` — hard-deleted insights take their evidence with them while the non-cascading weight aggregate keeps counting. This is the one number that visibly reorders every coach's feed. Fixing it means choosing between soft-deleting insights to preserve provenance, or accepting and documenting the drift. That is a product decision.
- **A "how your feed is personalized" panel.** The coach-weight personalization is live and completely invisible — a coach has no way to learn their course-management insights are down-weighted 23%. Small to build, but it is a new surface and needs design input.
