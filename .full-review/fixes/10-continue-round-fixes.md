# Fix Plan #10: Continue-Round Bugs (P1 #13, #36, #37)

Three related bugs in the continue-round flow where reconstructed hole stats lose detail,
sparse arrays cause crashes, and array bounds are exceeded.

---

## Bug #13: `completedHoleStats` reconstructed with null detailed stats

### Problem

In `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx` lines 194-222,
when a user continues a round, hole stats are rebuilt from the database. The shots
are loaded (line 221: `shots: shots.map(mapShotToRecord)`), but the detailed stats
derived from shots are hardcoded to `null`:

```typescript
completedHoleStats[hole.hole_number - 1] = {
  // ...
  drivingDistance: null,        // BUG: data exists in shots
  usedDriver: null,             // BUG
  driveMissDirection: null,     // BUG
  approachDistance: null,        // BUG
  approachLie: null,            // BUG
  approachProximity: null,      // BUG
  approachMissDirection: null,  // BUG
  firstPuttDistance: null,       // BUG
  firstPuttLeave: null,         // BUG
  firstPuttBreak: null,         // BUG
  firstPuttSlope: null,         // BUG
  firstPuttMissDirection: null, // BUG
  holedOutDistance: null,        // BUG
  holedOutType: null,            // BUG
  shots: shots.map(mapShotToRecord),  // Shots ARE loaded
};
```

When the user re-submits the round, these null values overwrite the original detailed
stats, permanently losing driving distance, approach proximity, putt distances, etc.

### Root Cause

`calculateHoleStats()` lives in `ShotTrackingComprehensive.tsx` (a `'use client'` component).
The server component `page.tsx` cannot import from it because:
1. It is exported from a `'use client'` module (Next.js boundary issue for server components).
2. It is a pure function with no React dependencies -- it should be in a shared utility.

### Fix: Extract `calculateHoleStats` to shared utility, then use it in `page.tsx`

**Step 1: Add `calculateHoleStats` to `src/lib/utils/shot-helpers.ts`**

This is the correct home -- `shot-helpers.ts` already contains shared pure functions
(`deriveLieAfter`, `calculateShotDistanceWithDirection`, `computeShotFingerprint`, etc.)
used by both server and client code.

Add at the bottom of `src/lib/utils/shot-helpers.ts`:

```typescript
// ============================================================================
// HOLE STATS CALCULATION (shared between server page.tsx and client component)
// ============================================================================

import type { HoleStats, RoundHole } from '@/lib/types/golf';

// Hole type alias for the function signature
type StatsHole = Pick<RoundHole, 'number' | 'par' | 'yardage'>;

/**
 * Calculate comprehensive hole stats from shot records.
 * Pure function -- no React dependencies. Used by:
 *   - ShotTrackingComprehensive.tsx (client, on hole completion)
 *   - continue/[id]/page.tsx (server, reconstructing stats from DB shots)
 */
export function calculateHoleStats(shots: ShotRecord[], hole: StatsHole): HoleStats {
  const nonPenaltyShots = shots.filter(s => !s.isPenalty);
  const score = shots.length;
  const putts = shots.filter(s => s.shotType === 'putting').length;
  const penalties = shots.filter(s => s.isPenalty).length;

  // DRIVING STATS (Par 4/5 only)
  let fairwayHit: boolean | null = null;
  let drivingDistance: number | null = null;
  let driveMissDirection: string | null = null;
  let driverUsed: boolean | null = null;

  if (hole.par >= 4) {
    const teeShot = shots.find(s => s.shotType === 'tee' && !s.isPenalty);
    if (teeShot) {
      fairwayHit = teeShot.result === 'fairway';
      driveMissDirection = teeShot.missDirection || null;
      driverUsed = teeShot.clubType === 'driver';
      drivingDistance = teeShot.shotDistance;
    }
  }

  // APPROACH STATS
  let approachDistance: number | null = null;
  let approachLie: string | null = null;
  let approachProximity: number | null = null;
  let approachMissDir: string | null = null;

  const greenShotIndex = nonPenaltyShots.findIndex(s => s.result === 'green' || s.result === 'hole');
  if (greenShotIndex > 0 || (greenShotIndex === 0 && hole.par === 3)) {
    const approachShot = nonPenaltyShots[greenShotIndex];
    if (approachShot && approachShot.shotType !== 'putting') {
      approachDistance = approachShot.distanceUnitBefore === 'feet'
        ? Math.round(approachShot.distanceToHoleBefore / 3)
        : approachShot.distanceToHoleBefore;
      approachLie = approachShot.lieBefore;
      if (approachShot.result === 'green') {
        approachProximity = approachShot.distanceUnitAfter === 'yards'
          ? approachShot.distanceToHoleAfter * 3
          : approachShot.distanceToHoleAfter;
      }
      approachMissDir = approachShot.missDirection || null;
    }
  }

  // GREEN IN REGULATION
  const shotsToGreen = hole.par - 2;
  const shotsTakenToGreen = shots.findIndex(s => s.result === 'green' || s.result === 'hole');
  const greenInRegulation = shotsTakenToGreen !== -1 && (shotsTakenToGreen + 1) <= shotsToGreen;

  // SCRAMBLING
  const scrambleAttempt = !greenInRegulation && shotsTakenToGreen !== -1;
  const scrambleMade = scrambleAttempt && score <= hole.par;

  // SAND SAVE
  let sandSaveAttempt = false;
  let sandSaveMade = false;
  const sandShots = nonPenaltyShots.filter(s =>
    s.lieBefore === 'sand' &&
    (s.shotType === 'around_green' || (s.distanceUnitBefore === 'yards' && s.distanceToHoleBefore <= 50))
  );
  if (sandShots.length > 0) {
    sandSaveAttempt = true;
    const sandShotIndex = nonPenaltyShots.findIndex(s => s === sandShots[0]);
    const shotsAfterSand = nonPenaltyShots.length - sandShotIndex;
    sandSaveMade = shotsAfterSand <= 2 && score <= hole.par;
  }

  // PUTTING STATS
  let firstPuttDistance: number | null = null;
  let firstPuttLeave: number | null = null;
  let firstPuttBreak: string | null = null;
  let firstPuttSlope: string | null = null;
  let firstPuttMissDirection: string | null = null;

  const puttingShots = nonPenaltyShots.filter(s => s.shotType === 'putting');
  if (puttingShots.length > 0) {
    const firstPutt = puttingShots[0]!;
    firstPuttDistance = firstPutt.distanceUnitBefore === 'yards'
      ? firstPutt.distanceToHoleBefore * 3
      : firstPutt.distanceToHoleBefore;
    firstPuttBreak = firstPutt.puttBreak || null;
    firstPuttSlope = firstPutt.puttSlope || null;
    if (firstPutt.result !== 'hole' && puttingShots.length > 1) {
      firstPuttLeave = firstPutt.distanceUnitAfter === 'yards'
        ? firstPutt.distanceToHoleAfter * 3
        : firstPutt.distanceToHoleAfter;
      firstPuttMissDirection = firstPutt.missDirection || null;
    }
  }

  // HOLE OUT STATS
  let holedOutDistance: number | null = null;
  let holedOutType: string | null = null;
  const holeOutShot = nonPenaltyShots.find(s => s.result === 'hole' && s.shotType !== 'putting');
  if (holeOutShot) {
    holedOutDistance = holeOutShot.distanceUnitBefore === 'feet'
      ? holeOutShot.distanceToHoleBefore
      : holeOutShot.distanceToHoleBefore * 3;
    holedOutType = holeOutShot.shotType;
  }

  return {
    holeNumber: hole.number,
    par: hole.par,
    yardage: hole.yardage,
    score,
    putts,
    fairwayHit,
    greenInRegulation,
    drivingDistance,
    usedDriver: driverUsed,
    driveMissDirection,
    approachDistance,
    approachLie,
    approachProximity,
    approachMissDirection: approachMissDir,
    scrambleAttempt,
    scrambleMade,
    sandSaveAttempt,
    sandSaveMade,
    penaltyStrokes: penalties,
    firstPuttDistance,
    firstPuttLeave,
    firstPuttBreak,
    firstPuttSlope,
    firstPuttMissDirection,
    holedOutDistance,
    holedOutType,
    shots,
  };
}
```

Note: The import for `ShotRecord` already exists at the top of `shot-helpers.ts`. The
import for `HoleStats` and `RoundHole` needs to be added to the existing import line.

**Exact edit at top of `src/lib/utils/shot-helpers.ts`:**

```typescript
// BEFORE (line 5):
import type { ShotRecord } from '@/lib/types/golf';

// AFTER:
import type { ShotRecord, HoleStats, RoundHole } from '@/lib/types/golf';
```

**Step 2: Update `ShotTrackingComprehensive.tsx` to re-export from shared utility**

```typescript
// BEFORE (lines 7, 24-158):
import { calculateShotDistanceWithDirection } from '@/lib/utils/shot-helpers';
// ...
// Module-level pure function...
export function calculateHoleStats(shots: ShotRecord[], hole: Hole): HoleStats {
  // ... 130 lines of function body ...
}

// AFTER:
import { calculateShotDistanceWithDirection, calculateHoleStats } from '@/lib/utils/shot-helpers';
// Re-export for any existing callers
export { calculateHoleStats } from '@/lib/utils/shot-helpers';
```

Remove lines 22-158 (the comment block and the entire `calculateHoleStats` function body)
and replace with the re-export above.

**Step 3: Use `calculateHoleStats` in `page.tsx` to reconstruct full stats**

```typescript
// BEFORE (src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx, lines 194-222):
    completedHoleStats[hole.hole_number - 1] = {
      holeNumber: hole.hole_number,
      par: hole.par,
      yardage: courseYardageMap.get(hole.hole_number) ?? 0,
      score: hole.score!,
      putts: hole.putts || 0,
      fairwayHit: hole.fairway_hit,
      greenInRegulation: hole.gir || false,
      drivingDistance: null,
      usedDriver: null,
      driveMissDirection: null,
      approachDistance: null,
      approachLie: null,
      approachProximity: null,
      approachMissDirection: null,
      scrambleAttempt: hole.up_and_down !== null,
      scrambleMade: hole.up_and_down || false,
      sandSaveAttempt: hole.sand_save !== null,
      sandSaveMade: hole.sand_save || false,
      penaltyStrokes: hole.penalty_strokes ?? 0,
      firstPuttDistance: null,
      firstPuttLeave: null,
      firstPuttBreak: null,
      firstPuttSlope: null,
      firstPuttMissDirection: null,
      holedOutDistance: null,
      holedOutType: null,
      shots: shots.map(mapShotToRecord),
    };

// AFTER:
    const mappedShots = shots.map(mapShotToRecord);
    const holeConfig = {
      number: hole.hole_number,
      par: hole.par,
      yardage: courseYardageMap.get(hole.hole_number) ?? 0,
    };

    // Re-derive full detailed stats from the shot data
    const derivedStats = calculateHoleStats(mappedShots, holeConfig);

    // Preserve DB-authoritative fields (score, putts, fairway_hit, GIR,
    // scramble, sand save) which may differ from shot-count derivation
    // (e.g., admin corrections, penalty_strokes stored separately)
    completedHoleStats[hole.hole_number - 1] = {
      ...derivedStats,
      score: hole.score!,
      putts: hole.putts || 0,
      fairwayHit: hole.fairway_hit,
      greenInRegulation: hole.gir || false,
      scrambleAttempt: hole.up_and_down !== null,
      scrambleMade: hole.up_and_down || false,
      sandSaveAttempt: hole.sand_save !== null,
      sandSaveMade: hole.sand_save || false,
      penaltyStrokes: hole.penalty_strokes ?? 0,
    };
```

Add the import at the top of `page.tsx`:

```typescript
// BEFORE (line 6):
import type { HoleStats, ShotRecord } from '@/lib/types/golf';

// AFTER:
import type { HoleStats, ShotRecord } from '@/lib/types/golf';
import { calculateHoleStats } from '@/lib/utils/shot-helpers';
```

---

## Bug #36: Sparse `completedHoleStats` array causes `.reduce()` crash

### Problem

In `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx`
line 376:

```typescript
const totalScore = completedHoleStats.reduce((sum, h) => sum + h.score, 0);
const totalPar = completedHoleStats.reduce((sum, h) => sum + h.par, 0);
```

`completedHoleStats` is a sparse array (holes are placed at `[hole_number - 1]`). If
a user completes holes 1, 2, and 5, slots 2 and 3 (0-indexed) are `undefined`. The
`.reduce()` callback tries `undefined.score` and crashes with a TypeError.

### Fix

Filter out undefined entries before reducing. Two locations (lines 376-377):

```typescript
// BEFORE (line 376-377):
const totalScore = completedHoleStats.reduce((sum, h) => sum + h.score, 0);
const totalPar = completedHoleStats.reduce((sum, h) => sum + h.par, 0);

// AFTER:
const definedStats = completedHoleStats.filter((h): h is HoleStats => h !== undefined);
const totalScore = definedStats.reduce((sum, h) => sum + h.score, 0);
const totalPar = definedStats.reduce((sum, h) => sum + h.par, 0);
```

This uses a type guard `(h): h is HoleStats` so TypeScript knows the filtered array
contains only `HoleStats` objects, not `undefined`.

---

## Bug #37: `startHoleIndex` may exceed array bounds

### Problem

In `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx` lines 281-285:

```typescript
const startHoleIndex = round.current_hole
  ? Math.max(0, round.current_hole - 1)
  : completedHoleStats.length > 0
    ? completedHoleStats.length   // BUG: may equal totalHoles
    : 0;
```

When all holes are completed, `completedHoleStats.length === totalHoles` (e.g., 18).
This sets `startHoleIndex = 18`, which is past the last valid index (17). This causes
`holes[startHoleIndex]` to be `undefined` downstream, crashing the client component.

Note: `completedHoleStats` is a sparse array, so `.length` equals the highest occupied
index + 1, which can equal `totalHoles` even if some interior slots are empty. The
fallback branch uses `.length` as-is, potentially pointing past the array.

### Fix

Clamp `startHoleIndex` to `totalHoles - 1`:

```typescript
// BEFORE (lines 281-285):
  const startHoleIndex = round.current_hole
    ? Math.max(0, round.current_hole - 1) // Convert to 0-indexed, ensure non-negative
    : completedHoleStats.length > 0
      ? completedHoleStats.length // Next hole after last completed
      : 0; // Start at hole 1 (index 0)

// AFTER:
  const startHoleIndex = round.current_hole
    ? Math.min(Math.max(0, round.current_hole - 1), totalHoles - 1)
    : completedHoleStats.length > 0
      ? Math.min(completedHoleStats.length, totalHoles - 1)
      : 0;
```

Both branches now clamp to `totalHoles - 1`, ensuring the index never exceeds the
last valid position. The `round.current_hole` branch also gets the clamp for safety,
in case the stored value is stale or corrupted.

---

## Summary of All File Changes

### File 1: `src/lib/utils/shot-helpers.ts`
1. Update import on line 5: add `HoleStats, RoundHole` to the type import.
2. Append the `calculateHoleStats` function (with `StatsHole` type alias) at the end of the file.

### File 2: `src/components/golf/ShotTrackingComprehensive.tsx`
1. Update import on line 7: add `calculateHoleStats` to the import from `shot-helpers`.
2. Remove lines 21-158 (comment block + `calculateHoleStats` function definition).
3. Add re-export: `export { calculateHoleStats } from '@/lib/utils/shot-helpers';`

### File 3: `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx`
1. Add import: `import { calculateHoleStats } from '@/lib/utils/shot-helpers';` (after line 6).
2. Replace lines 194-222 (the manual `completedHoleStats` construction) with the `calculateHoleStats`-based version that spreads derived stats and overlays DB-authoritative fields.
3. Replace lines 281-285 (the `startHoleIndex` calculation) with the clamped version.

### File 4: `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx`
1. Replace lines 376-377 (the `.reduce()` calls) with the filtered version that guards against `undefined` entries in the sparse array.

---

## Testing Checklist

- [ ] Create a round, complete holes 1-3, exit mid-round
- [ ] Continue the round -- verify driving distance, approach proximity, putt distances are populated (not null) for holes 1-3
- [ ] Complete remaining holes, submit -- verify detailed stats survive in the final round record
- [ ] Create a round, complete holes 1 and 3 (skip 2 somehow, or simulate sparse array) -- verify no crash on the submitting screen
- [ ] Complete all 18 holes, then hit continue -- verify `startHoleIndex` does not exceed 17 (0-indexed)
- [ ] Verify `npm run typecheck` passes after all changes
- [ ] Verify the `ShotTrackingComprehensive` component still works for new rounds (re-export backward compatibility)
