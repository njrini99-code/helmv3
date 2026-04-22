# F9 Remaining Typecheck Errors (post-cleanup)

After Phase 4 cleanup (220+ unused declarations removed + 7 test fixture fixes),
the repo went from **319 → 92 typecheck errors**. All TS6133/TS6196 errors are
resolved. The remaining errors are **not cleanup-eligible** — they require
case-by-case judgment (null narrowing, type refinement, or shape reconciliation).

**F9 flip status**: BLOCKED. `next.config.mjs:32 ignoreBuildErrors: true` remains
on. Unblock requires resolving the errors below.

## Breakdown by error code

| Code | Count | Meaning |
|------|------:|---------|
| TS2532 | 34 | Object is possibly 'undefined' |
| TS18048 | 23 | (property) is possibly 'undefined' |
| TS2322 | 17 | Type assignment mismatch |
| TS2345 | 10 | Argument type mismatch |
| TS2339 | 6  | Property doesn't exist on type |
| TS7006 | 1  | Parameter implicitly 'any' |
| TS2367 | 1  | Comparison has no type overlap |

Total: **92 errors**

## Breakdown by file

| File | Errors | Notes |
|------|------:|-------|
| src/lib/coachhelm/v2/shot-analysis/sequence-analysis.ts | 34 | `triggerShot` not narrowed; many array index accesses without `!` |
| src/lib/coachhelm/v2/trends/streak-detector.ts | 12 | `primary`, `secondary`, array index accesses |
| src/lib/coachhelm/v2/stats/z-score.ts | 11 | Array index returns, sorting |
| src/hooks/golf/use-auto-save-round.ts | 8 | `RoundHole` type has no `.putts` / `.shots` — API mismatch |
| src/lib/coachhelm/v2/trends/multi-window.ts | 6 | Array index possibly undefined |
| src/lib/coachhelm/v2/stats/anomaly-detector.ts | 6 | Array index undefined |
| src/lib/coachhelm/v2/shot-analysis/shot-level-sg.ts | 6 | Distance band lookup, string narrowing |
| src/lib/coachhelm/v2/stats/baselines.ts | 5 | EWMA array access, ewma variable |
| src/components/golf/coachhelm/player/TrendDashboard.tsx | 2 | `meta` undefined |
| src/components/golf/stats/sections/DispersionStats.tsx | 1 | `band` undefined |
| src/lib/coachhelm/v2/feedback/coach-behavior.ts | 1 | Optional string assigned to required |

## Full error list (file:line → diagnosis)

### src/lib/coachhelm/v2/shot-analysis/sequence-analysis.ts (34)

All 34 are within the shot-sequence analyzer, where the function iterates
over arrays (`shots[i]`, `triggerShot`, etc.) without narrowing. Fix pattern:
either `if (!shot) continue;` guards, or non-null assertions after bounds checks.

- Lines 72, 73, 119, 121, 125, 131, 134, 185: `number | undefined` not assignable to `number`
- Lines 117, 175, 179, 181, 184, 185, 186, 188, 191: Object is possibly 'undefined'
- Lines 199, 200, 201, 204, 220, 221, 222, 225: `triggerShot` is possibly 'undefined'

### src/lib/coachhelm/v2/trends/streak-detector.ts (12)

- Lines 81, 147-150: array index returns `T | undefined`
- Line 92: argument type mismatch (`number | undefined` into `number`)
- Line 101: `(number | undefined)[]` not assignable to `number[]`
- Lines 245-247: `primary`, `secondary` possibly undefined after tuple destructure

### src/lib/coachhelm/v2/stats/z-score.ts (11)

- Line 101: `number[] | undefined`
- Lines 109, 147, 153, 182: Object is possibly undefined
- Lines 192-196: return-value assignments where source is `number | undefined`

### src/hooks/golf/use-auto-save-round.ts (8)  ← NOT CoachHelm scope

- Line 181: comparison `status === 'review'` against type `'holes' | 'setup' | 'submitting'`
- Lines 190-194: `.putts` / `.shots` don't exist on `RoundHole` (schema drift)
- Line 192: implicit `any` on `s` param

This hook looks stale vs the current `RoundHole` / `ShotRecord` types.
Belongs to Team E's Round Entry surface; out of scope for F9 cleanup.

### src/lib/coachhelm/v2/trends/multi-window.ts (6)

- Line 65: number undefined
- Lines 75, 76, 96, 97, 268: array index possibly undefined

### src/lib/coachhelm/v2/stats/anomaly-detector.ts (6)

- Lines 239, 246: `number | undefined`
- Lines 247, 275, 276: object possibly undefined

### src/lib/coachhelm/v2/shot-analysis/shot-level-sg.ts (6)

- Line 67: distance-band tuple lookup returns `T | undefined`
- Lines 100, 106: number undefined
- Lines 301, 312: string possibly undefined

### src/lib/coachhelm/v2/stats/baselines.ts (5)

- Lines 51, 53: EWMA array index + `ewma` variable possibly undefined
- Lines 162, 163: object possibly undefined

### src/components/golf/coachhelm/player/TrendDashboard.tsx (2)

- Lines 165, 166: `meta` is possibly undefined after Map lookup

### src/components/golf/stats/sections/DispersionStats.tsx (1)

- Line 354: `band` is possibly undefined after find()

### src/lib/coachhelm/v2/feedback/coach-behavior.ts (1)

- Line 76: optional `string | undefined` being assigned where `string` expected

## Recommendations

1. **CoachHelm V2 stats/shot-analysis/trends hot spots** (87 of 92 errors) —
   these files were written assuming `noUncheckedIndexedAccess: false`. Since
   the repo now runs with `noUncheckedIndexedAccess: true`, every array index
   return type is `T | undefined`. The fix is systematic but not mechanical;
   each site needs an actual bounds check, early return, or explicit `!`.

2. **use-auto-save-round.ts (8 errors)** — schema drift; the hook references
   `.putts` / `.shots` on `RoundHole` but those fields no longer exist on the
   type. Needs Team E to reconcile the hook against the current
   `RoundHole` + `ShotRecord` shapes, likely via a separate draft schema.

3. **Component-side undefined narrowing (3 errors)** — TrendDashboard,
   DispersionStats, and coach-behavior.ts each have a single-site Map/find
   return that needs a null guard. Easy fixes.

Until these land, `ignoreBuildErrors: true` stays on and `npm run build`
continues to succeed. `npm run typecheck` will continue reporting 92 errors.
