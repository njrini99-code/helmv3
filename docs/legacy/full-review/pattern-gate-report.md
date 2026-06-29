# Agent C: pattern-gate — DONE

## Diagnosis

The 22,113 zero-impact contextual rows in `golf_patterns_v2` come from
**`src/lib/coachhelm/v2/mining/shot-pattern-miner.ts`**, not from the
round-level `pattern-miner.ts`.

### Why every contextual pattern is `stroke_impact = 0`

Inside `ShotPatternMiner.savePatterns()` every pattern is inserted with
the field hardcoded to a literal:

```ts
stroke_impact: 0, // Calculated differently for shots
```

The comment promises an alternate calculation, but it never happens —
the `ShotPattern` interface itself has no `strokeImpact` field (see
`src/lib/coachhelm/v2/types.ts:714`). The closest signals on
`ShotPattern` are `distanceControlScore` (0-1) and
`tendencies[*].frequency` — neither is in stroke units, so the miner
can't trivially derive an impact and falls back to 0.

Result: every shot-level pattern (100% of which are tagged
`pattern_type = 'contextual'`) lands in the table with no actionable
weight, while the engine downstream ranks/uses `stroke_impact` to choose
what to surface. 22k rows of pure noise.

### Why round-level patterns are fine

The round-level `pattern-miner.ts` computes a real impact at line 223
(`strokeImpact = matchingAvg - baselineAvg`) and already gates with
`Math.abs(strokeImpact) < THRESHOLDS.minStrokeImpact` (= 0.3) at line
226. That's why the 4 conditional/temporal rows that survive carry
meaningful values (-0.93, -0.50). No fix needed there.

### What this means for the gate

Because the shot pattern miner literally writes `0` every time, the
`Math.abs(strokeImpact) < 0.1` gate rejects 100% of its current output.
That is the correct outcome until someone implements a real shot-level
impact calculation — better to write zero rows than 22k zero-impact
rows. The gate is a safety net; the underlying calculation itself is
broken (flagged below, not rewritten per task scope).

### Broken-calculation flag (NOT fixed — out of scope)

`src/lib/coachhelm/v2/mining/shot-pattern-miner.ts:701` will always emit
`stroke_impact: 0` until a real metric is added to `ShotPattern`. A
proper implementation would translate `distanceControlScore` (or the
proximity vs. baseline-proximity gap) into expected strokes-gained
delta. That is a separate piece of work — for now the gate keeps the
pipeline clean.

## Files changed

- `src/lib/coachhelm/v2/mining/shot-pattern-miner.ts` — added gate at
  the top of the `savePatterns` per-pattern loop:
  - Introduced `MIN_STROKE_IMPACT = 0.1` constant (mirrors
    `pattern-miner.ts`'s `THRESHOLDS.minStrokeImpact = 0.3`, but lower
    because shot-level signals are noisier).
  - Added `if (Math.abs(strokeImpact) < MIN_STROKE_IMPACT) continue;`
    before the `upsert`, with a block comment explaining that the value
    is currently hardcoded to 0 and how to reactivate the gate when a
    real metric is wired up.
  - Expanded the `savePatterns` JSDoc to document the rationale.

## Cleanup SQL (user runs this)

Schema check:

- `src/lib/types/database.types.ts:6156` — `golf_patterns_v2` declares
  only outbound FKs (`player_id`, `validator_coach_id`).
- `grep -n "pattern_id"` against the generated database types finds no
  inbound FK from any other table to `golf_patterns_v2.id`. Other tables
  with a `pattern_id`-shaped column (e.g. attachments) reference
  insights, not patterns.
- `source_round_ids text[]` is a Postgres array — arrays cannot carry
  FK constraints, so it imposes no delete blocker.

Conclusion: the DELETE below is safe. Run as the project's service
role (RLS bypass needed for a bulk delete on this table):

```sql
-- Snapshot first (sanity check)
SELECT pattern_type,
       COUNT(*)                                              AS rows,
       AVG(COALESCE(stroke_impact, 0))::numeric(10, 3)       AS avg_impact
FROM   golf_patterns_v2
GROUP BY pattern_type
ORDER BY rows DESC;

-- Cleanup: drop every contextual pattern with no actionable impact.
-- Matches the new gate in shot-pattern-miner.ts so the miner won't
-- re-insert them on the next CoachHelm run.
DELETE FROM golf_patterns_v2
WHERE  pattern_type = 'contextual'
  AND  ABS(COALESCE(stroke_impact, 0)) < 0.1;

-- Verify
SELECT pattern_type, COUNT(*) AS rows
FROM   golf_patterns_v2
GROUP BY pattern_type
ORDER BY rows DESC;
```

Optional, broader cleanup (only if the user wants to flush *every*
zero-impact row, not just the contextual ones):

```sql
DELETE FROM golf_patterns_v2
WHERE ABS(COALESCE(stroke_impact, 0)) < 0.1;
```

The conditional/temporal rows already carry |impact| >= 0.3 (because
they were filtered through `pattern-miner.ts`'s threshold), so this
broader form will not touch them.

## Verification

- **typecheck**: `npx tsc --noEmit` — clean for everything under
  `src/`. The only error reported is
  `.next/types/validator.ts(1349,39): Cannot find module
  '../../src/app/api/golf/rounds/generate-review/route.js'` — that's a
  Next 16 generated-types artifact pointing at an Agent A-owned route
  that isn't on disk yet, NOT caused by this change. `helm-vid/` is
  not in `src/` and was filtered out as instructed.
- **shot-pattern-miner.ts**: zero TS errors after the edit.
- **Expected post-cleanup row count**: ~4 patterns (the 3 conditional
  + 1 temporal). All 22,113 contextual zero-impact rows go away. The
  miner will not re-create them on the next run because the gate skips
  them at insert time.
