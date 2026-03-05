# Fix Plan: Shot Calculation Bugs (P0 #9, P1 #24, P1 #26)

Three calculation bugs affecting shot distance accuracy and fairway statistics consistency.

---

## Bug 1 (P0 #9): `calculateShotDistanceWithDirection` missing `short_left`/`short_right` diagonal factor

### Problem

File: `src/lib/utils/shot-helpers.ts`, lines 73-97

The JSDoc (lines 68-69) states that `short_left` and `short_right` use a `0.7` diagonal factor
(`before - (after * 0.7)`), matching the same diagonal geometry used by `long_left`/`long_right`.
However, the implementation has no explicit branches for `short_left` or `short_right` -- they
fall through to the default `return Math.max(0, distanceBeforeYards - distanceAfterYards)` at
line 96. This means `short_left`/`short_right` are treated identically to `short`, ignoring the
diagonal factor entirely.

**Current code (lines 86-97):**
```typescript
const direction = missDirection.toLowerCase();

if (direction === 'long') {
  return distanceBeforeYards + distanceAfterYards;
}

if (direction === 'long_left' || direction === 'long_right') {
  return distanceBeforeYards + Math.round(distanceAfterYards * 0.7);
}

return Math.max(0, distanceBeforeYards - distanceAfterYards);
```

**Impact:** For a shot 400 yards out that lands 50 yards short-left of the hole, the system
reports 350 yards (400 - 50). The correct value is 365 yards (400 - round(50 * 0.7) = 400 - 35).
This ~4% error inflates for larger `distanceAfterYards` values.

### Fix

Add an explicit branch for `short_left` and `short_right` between the `long_left`/`long_right`
branch and the default return, applying `Math.max(0, before - Math.round(after * 0.7))`.

**Replace lines 86-97 of `src/lib/utils/shot-helpers.ts`:**

```typescript
// BEFORE
const direction = missDirection.toLowerCase();

if (direction === 'long') {
  return distanceBeforeYards + distanceAfterYards;
}

if (direction === 'long_left' || direction === 'long_right') {
  return distanceBeforeYards + Math.round(distanceAfterYards * 0.7);
}

return Math.max(0, distanceBeforeYards - distanceAfterYards);
```

```typescript
// AFTER
const direction = missDirection.toLowerCase();

if (direction === 'long') {
  return distanceBeforeYards + distanceAfterYards;
}

if (direction === 'long_left' || direction === 'long_right') {
  return distanceBeforeYards + Math.round(distanceAfterYards * 0.7);
}

if (direction === 'short_left' || direction === 'short_right') {
  return Math.max(0, distanceBeforeYards - Math.round(distanceAfterYards * 0.7));
}

return Math.max(0, distanceBeforeYards - distanceAfterYards);
```

### Updated Test Expectations

File: `src/lib/utils/__tests__/shot-helpers.test.ts`

The existing tests at lines 154-161 expect `short_left` and `short_right` to use the default
`before - after` formula (no diagonal factor). These must be updated to expect the 0.7 factor.

**Test 1 -- line 155-156 (SHORT_LEFT):**
```typescript
// BEFORE
it('calculates SHORT_LEFT: before - after', () => {
  expect(calculateShotDistanceWithDirection(400, 50, 'short_left')).toBe(350);
});

// AFTER
it('calculates SHORT_LEFT: before - round(after * 0.7)', () => {
  // 400 - round(50 * 0.7) = 400 - 35 = 365
  expect(calculateShotDistanceWithDirection(400, 50, 'short_left')).toBe(365);
});
```

**Test 2 -- line 159-160 (SHORT_RIGHT):**
```typescript
// BEFORE
it('calculates SHORT_RIGHT: before - after', () => {
  expect(calculateShotDistanceWithDirection(400, 50, 'short_right')).toBe(350);
});

// AFTER
it('calculates SHORT_RIGHT: before - round(after * 0.7)', () => {
  // 400 - round(50 * 0.7) = 400 - 35 = 365
  expect(calculateShotDistanceWithDirection(400, 50, 'short_right')).toBe(365);
});
```

**New tests to add (after the LONG_RIGHT test, before "Case insensitivity"):**
```typescript
// Short diagonal clamping to zero
it('clamps SHORT_LEFT to 0 when result would be negative', () => {
  // 10 - round(50 * 0.7) = 10 - 35 = -25 -> clamped to 0
  expect(calculateShotDistanceWithDirection(10, 50, 'short_left')).toBe(0);
});

// Short diagonal with floating point
it('short_right with floating point after', () => {
  // 150 - round(20.5 * 0.7) = 150 - round(14.35) = 150 - 14 = 136
  expect(calculateShotDistanceWithDirection(150, 20.5, 'short_right')).toBe(136);
});
```

---

## Bug 2 (P1 #24): Legacy fairway hit count includes par 3s

### Problem

File: `src/app/golf/actions/golf.ts`, line 1081

In the legacy (non-shot-tracking) round submission path, `fairwaysHit` counts ALL holes where
`fairwayHit=true`, including par 3 holes. Par 3 holes have no fairway opportunity (no driver,
the tee shot IS the approach). The very next line correctly excludes par 3s from `fairwaysTotal`:

```typescript
const fairwaysHit = validatedData.holes.filter(h => h.fairwayHit).length;           // line 1081 -- BUG: includes par 3s
const fairwaysTotal = validatedData.holes.filter(h => h.par > 3).length;             // line 1082 -- correct: excludes par 3s
```

**Impact:** A round with 4 par-3 holes that the client marked as `fairwayHit=true` would
report `fairwaysHit=18` but `fairwaysTotal=14`, making fairway percentage > 100%. This
corrupts fairway statistics for the legacy path (rounds entered without shot-by-shot tracking).

### Fix

Add a `h.par > 3` filter to the `fairwaysHit` computation to match `fairwaysTotal`.

**Replace line 1081 of `src/app/golf/actions/golf.ts`:**

```typescript
// BEFORE
const fairwaysHit = validatedData.holes.filter(h => h.fairwayHit).length;

// AFTER
const fairwaysHit = validatedData.holes.filter(h => h.fairwayHit && h.par > 3).length;
```

No test changes needed -- this is a server action path, not unit tested.

---

## Bug 3 (P1 #26): Par 3 fairway tracking differs between client and server calculators

### Problem

File: `src/lib/utils/golf-stats-calculator-shots.ts`, line 652

The server-side calculator (`calculateHoleStatsFromShots`) evaluates fairway hit for ALL holes
regardless of par:

```typescript
const fairwayHit = teeShot ? teeShot.result === 'fairway' : null;  // line 652
```

For a par 3 where the tee shot lands on the green (`result === 'green'`), this evaluates to
`false` -- incorrectly recording a "fairway miss" when there was no fairway opportunity at all.

The client-side calculator (`ShotTrackingComprehensive.tsx`, line 39) correctly handles this:

```typescript
if (hole.par >= 4) {                          // line 39
  const teeShot = shots.find(...);
  if (teeShot) {
    fairwayHit = teeShot.result === 'fairway'; // only evaluated for par 4/5
  }
}
// fairwayHit stays null for par 3s (initialized as null on line 34)
```

The downstream aggregator in `calculateStatsFromShots` (line 1365) already guards with
`hole.fairwayHit !== null && hole.par !== 3`, so `false` vs `null` matters: `false` sneaks
past the `!== null` check when `par !== 3` fails, but the `par !== 3` guard catches it anyway
for par 3s. However, the data stored in `CalculatedHoleStats.fairwayHit` is semantically wrong
(`false` implies a miss, `null` implies no opportunity), and any consumer that checks only
`fairwayHit !== null` without also checking par will get incorrect data.

### Fix

In `calculateHoleStatsFromShots`, set `fairwayHit = null` when `par < 4` (i.e., par 3s).

**Replace line 652 of `src/lib/utils/golf-stats-calculator-shots.ts`:**

```typescript
// BEFORE
const fairwayHit = teeShot ? teeShot.result === 'fairway' : null;

// AFTER
const fairwayHit = par < 4 ? null : (teeShot ? teeShot.result === 'fairway' : null);
```

### Updated Test Expectations

File: `src/lib/utils/__tests__/golf-stats-calculator-shots.test.ts`

**Test at lines 635-639 ("no fairway tracking for par 3"):**

The test description says "no fairway tracking for par 3" but expects `false`. After the fix,
it should expect `null` -- the correct representation of "no fairway opportunity."

```typescript
// BEFORE (lines 635-639)
it('no fairway tracking for par 3', () => {
  // Par 3 tee shot is treated as approach, fairwayHit comes from tee shot
  // which is null because it hit green (not fairway)
  expect(stats.fairwayHit).toBe(false);
});

// AFTER
it('no fairway tracking for par 3', () => {
  // Par 3 has no fairway opportunity — fairwayHit should be null, not false
  expect(stats.fairwayHit).toBeNull();
});
```

**Test at lines 1092-1101 ("par 3 miss GIR") -- no change needed:**
This test uses `par 3` but does not assert on `fairwayHit`, so it is unaffected.

**Test at lines 1117-1126 ("single shot hole-in-one on par 3") -- verify no fairwayHit assertion:**
This test also uses `par 3` but does not assert on `fairwayHit`, so it is unaffected.

**Aggregation test at lines 748-765 ("calculates stats across multiple rounds"):**
This test mixes a par-4 birdie (round 1) and a par-3 GIR (round 2). The `fairwaysHit` and
`fairwayOpportunities` are not asserted in this test block, so no change needed. However,
`fairwayOpportunities` would change from 2 to 1 if it were asserted, because the par-3 hole's
`fairwayHit` changes from `false` to `null`, and the aggregator's `hole.fairwayHit !== null`
guard (line 1365) will now correctly skip it. The existing test at lines 740-745 uses two par-4
holes, so that assertion (`fairwayOpportunities: 2`) remains correct.

---

## Summary of All File Changes

| File | Line(s) | Change |
|------|---------|--------|
| `src/lib/utils/shot-helpers.ts` | 94-96 | Add `short_left`/`short_right` branch with 0.7 factor before default return |
| `src/lib/utils/__tests__/shot-helpers.test.ts` | 155-161 | Update expected values from 350 to 365 for `short_left`/`short_right` |
| `src/lib/utils/__tests__/shot-helpers.test.ts` | after 170 | Add 2 new tests (clamp-to-zero, floating point) for short diagonal |
| `src/app/golf/actions/golf.ts` | 1081 | Add `&& h.par > 3` filter to `fairwaysHit` |
| `src/lib/utils/golf-stats-calculator-shots.ts` | 652 | Return `null` for par < 4 instead of evaluating tee shot result |
| `src/lib/utils/__tests__/golf-stats-calculator-shots.test.ts` | 635-639 | Change expected `fairwayHit` from `false` to `null` |

## Verification Steps

1. Run `npx vitest run src/lib/utils/__tests__/shot-helpers.test.ts` -- all tests pass with updated expectations
2. Run `npx vitest run src/lib/utils/__tests__/golf-stats-calculator-shots.test.ts` -- all tests pass with updated par-3 expectation
3. Run `npm run typecheck` -- no type errors (the `fairwayHit` field is already typed `boolean | null`)
4. Manual: Submit a legacy round with par-3 holes marked as fairway hit, verify `fairwaysHit <= fairwaysTotal`
5. Manual: Track a shot with `short_left` miss direction, verify the shot distance preview uses the 0.7 diagonal factor
