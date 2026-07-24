/**
 * HoleShotPath geometry tests.
 *
 * The component is mostly SVG paint; the load-bearing logic lives in
 * geometry.ts. These tests pin down the TRUE-TO-SCALE contract:
 *   - the along-hole axis is strictly linear in real yards
 *   - `distance_to_hole_before/after` reads as FEET on a green lie and
 *     YARDS everywhere else — regardless of whether a `distance_unit_*`
 *     tag is present (the real-world FilmstripReview case never sends
 *     one) — this is the single most important correctness property in
 *     the module, since getting it wrong silently triples every putt's
 *     plotted distance
 *   - the green inset is its own honest, feet-scale coordinate system
 *   - yardage/feet rulers (`ticks`) are exposed so the scale is checkable
 *   - lateral drift is deterministic and bounded
 *   - nothing is ever fabricated: a null input distance stays null
 */

import { describe, it, expect } from 'vitest';
import {
  plotHole,
  inferHoleYardage,
  segmentPath,
  scoreToParLabel,
  formatYards,
  formatFeet,
  greenEntryLateralRatio,
  VB,
  GREEN_INSET_VB,
  GREEN_INSET_MIN_RADIAL_GAP_UNITS,
  GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS,
} from './geometry';
import type { ShotInput } from './types';

// ---------------------------------------------------------------------------
// inferHoleYardage — priority chain
// ---------------------------------------------------------------------------

describe('inferHoleYardage', () => {
  it('uses explicit yardage when provided', () => {
    expect(inferHoleYardage([], 4, 412)).toBe(412);
  });

  it('falls back to shot 1 distance_to_hole_before when yardage missing', () => {
    const shots: ShotInput[] = [
      {
        shot_number: 1,
        lie_after: 'fairway',
        distance_to_hole_after: 150,
        distance_to_hole_before: 387,
      },
    ];
    expect(inferHoleYardage(shots, 4, null)).toBe(387);
  });

  it('falls back to par-based defaults when no data', () => {
    expect(inferHoleYardage([], 3, null)).toBe(175);
    expect(inferHoleYardage([], 4, null)).toBe(380);
    expect(inferHoleYardage([], 5, null)).toBe(525);
  });

  it('falls back to 360y as final default', () => {
    expect(inferHoleYardage([], undefined, null)).toBe(360);
  });

  it('converts shot 1s before-distance to yards when lie_before is green (defensive edge case)', () => {
    // A resumed/partial hole where the ledger's first row is oddly a green
    // lie — 30 stored as feet (lie-gated) should infer 10 yards, not 30.
    const shots: ShotInput[] = [
      {
        shot_number: 1,
        lie_before: 'green',
        lie_after: 'green',
        distance_to_hole_before: 30,
        distance_to_hole_after: 0,
      },
    ];
    expect(inferHoleYardage(shots, undefined, null)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// CRITICAL: distance_to_hole reads as FEET on green, YARDS off it — lie is
// the primary signal, not the (usually-absent) distance_unit_* tag.
// ---------------------------------------------------------------------------

describe('distance unit handling — lie is the primary signal', () => {
  it('reads distance_to_hole_after as FEET when lie_after is green and NO unit tag is present (the real FilmstripReview case)', () => {
    // This is the bug the true-to-scale rewrite fixes: FilmstripReview's
    // golf_shots select never fetches distance_unit_after, so every real
    // green-lie shot arrives with no tag at all. Old behavior defaulted
    // that to yards and tripled every putt's plotted distance.
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 9 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    // 9 feet = 3 yards, NOT 9 yards.
    expect(plot.shots[0]!.remaining_yards).toBe(3);
    expect(plot.shots[0]!.distance_to_pin).toBe(3);
    // Round-trips cleanly back to the raw logged feet value in the inset.
    expect(plot.greenInset.shots[0]!.remaining_feet).toBe(9);
  });

  it('lie wins even when an explicit unit tag contradicts it (matches coachhelm-data.ts precedence)', () => {
    const shots: ShotInput[] = [
      {
        shot_number: 1,
        lie_after: 'green',
        distance_to_hole_after: 9,
        distance_unit_after: 'yards', // contradicts the green lie
      },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.shots[0]!.remaining_yards).toBe(3);
  });

  it('respects an explicit feet tag on a NON-green lie (e.g. a fringe distance logged in feet)', () => {
    const shots: ShotInput[] = [
      {
        shot_number: 1,
        lie_after: 'fringe',
        distance_to_hole_after: 9,
        distance_unit_after: 'feet',
      },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.shots[0]!.remaining_yards).toBe(3);
  });

  it('defaults a non-green lie with no unit tag to yards (unchanged baseline behavior)', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.shots[0]!.remaining_yards).toBe(150);
  });

  it('shot_distance is ALWAYS yards-by-default regardless of lie — only its own unit tag can flip it', () => {
    const withoutTag: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 3, shot_distance: 12 },
    ];
    expect(plotHole({ shots: withoutTag, par: 4, yardage: 400 }).shots[0]!.shot_yards).toBe(12);

    const withFeetTag: ShotInput[] = [
      {
        shot_number: 1,
        lie_after: 'green',
        distance_to_hole_after: 3,
        shot_distance: 12,
        distance_unit: 'feet',
      },
    ];
    expect(plotHole({ shots: withFeetTag, par: 4, yardage: 400 }).shots[0]!.shot_yards).toBe(4);
  });

  it('infers total_yardage from the TRUE first shot even when the input array is out of shot_number order', () => {
    const shots: ShotInput[] = [
      { shot_number: 2, lie_after: 'fairway', distance_to_hole_before: 200, distance_to_hole_after: 90 },
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_before: 410, distance_to_hole_after: 200 },
      { shot_number: 3, lie_after: 'green', distance_to_hole_before: 90, distance_to_hole_after: 12 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: null });
    // If the module picked args.shots[0] (shot 2's before=200) instead of
    // sorting first, this would wrongly come back 200.
    expect(plot.total_yardage).toBe(410);
    expect(plot.shots.map((s) => s.shot_number)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// plotHole — endpoint geometry from real data
// ---------------------------------------------------------------------------

describe('plotHole', () => {
  it('returns empty shot/segment/hazard arrays for zero shots, but a well-formed default greenInset', () => {
    const plot = plotHole({ shots: [], par: 4, yardage: 400 });
    expect(plot.shots).toEqual([]);
    expect(plot.segments).toEqual([]);
    expect(plot.hazards).toEqual([]);
    expect(plot.greenInset.shots).toEqual([]);
    expect(plot.greenInset.segments).toEqual([]);
    expect(plot.greenInset.entry_shot_index).toBeNull();
    // Ruler still renders (a subtle-but-present frame), from the default
    // display scale — never a claim about a real distance.
    expect(plot.greenInset.ticks.length).toBeGreaterThan(0);
    expect(plot.ticks.length).toBeGreaterThan(0);
  });

  it('orders shots by shot_number even if input is out of order', () => {
    const shots: ShotInput[] = [
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 0 },
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 12 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.shots.map((s) => s.shot_number)).toEqual([1, 2, 3]);
  });

  it('places shot endpoints closer to pin as distance-to-hole shrinks', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 300 },
      { shot_number: 2, lie_after: 'fairway', distance_to_hole_after: 100 },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 20 }, // 20ft = 6.67y
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    // Smaller y = closer to pin (top of viewBox)
    expect(plot.shots[0]!.y).toBeGreaterThan(plot.shots[1]!.y);
    expect(plot.shots[1]!.y).toBeGreaterThan(plot.shots[2]!.y);
  });

  it('snaps the final putt to the pin coordinates', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 25 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0 },
    ];
    const plot = plotHole({ shots, par: 3, yardage: 175 });
    const last = plot.shots[plot.shots.length - 1]!;
    expect(last.x).toBe(plot.pin.x);
    expect(last.y).toBe(plot.pin.y);
  });

  it('miss-left pushes x left of fairway center, miss-right pushes right', () => {
    const left: ShotInput[] = [
      { shot_number: 1, lie_after: 'rough', distance_to_hole_after: 150, miss_direction: 'left' },
    ];
    const right: ShotInput[] = [
      { shot_number: 1, lie_after: 'rough', distance_to_hole_after: 150, miss_direction: 'right' },
    ];
    const lp = plotHole({ shots: left, par: 4, yardage: 400 });
    const rp = plotHole({ shots: right, par: 4, yardage: 400 });
    expect(lp.shots[0]!.x).toBeLessThan(50);
    expect(rp.shots[0]!.x).toBeGreaterThan(50);
  });

  it('respects viewBox bounds — no endpoint escapes the SVG', () => {
    const shots: ShotInput[] = Array.from({ length: 8 }, (_, i) => ({
      shot_number: i + 1,
      lie_after: 'rough' as const,
      distance_to_hole_after: 400 - i * 50,
      // Stack all misses left to force the clamp.
      miss_direction: 'left' as const,
    }));
    const plot = plotHole({ shots, par: 5, yardage: 525 });
    for (const s of plot.shots) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(VB.width);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(VB.height);
    }
  });

  it('distance_to_pin is always identical to remaining_yards (documented backward-compat alias)', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 9 },
      { shot_number: 3, lie_after: 'other', distance_to_hole_after: null },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    for (const s of plot.shots) {
      expect(s.distance_to_pin).toBe(s.remaining_yards);
    }
  });

  it('is deterministic — identical input plots to identical output (no Math.random)', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'rough', distance_to_hole_after: 250, miss_direction: 'right' },
      { shot_number: 2, lie_after: 'sand', distance_to_hole_after: 90, miss_direction: 'right' },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 14 },
      { shot_number: 4, lie_after: 'green', distance_to_hole_after: 0 },
    ];
    const a = plotHole({ shots, par: 4, yardage: 400 });
    const b = plotHole({ shots, par: 4, yardage: 400 });
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Yardage ticks — the ruler that makes the linear-in-yards claim visible
// ---------------------------------------------------------------------------

describe('plotHole — corridor yardage ticks', () => {
  it('emits a tick every 50y from 0 to the hole total, emphasizing 50/100/150', () => {
    const plot = plotHole({ shots: [], par: 3, yardage: 175 });
    expect(plot.ticks.map((t) => t.yards)).toEqual([0, 50, 100, 150]);
    expect(plot.ticks.map((t) => t.emphasis)).toEqual([false, true, true, true]);
  });

  it('tick Y positions are strictly increasing with yards (0 = pin, total = tee)', () => {
    const plot = plotHole({ shots: [], par: 5, yardage: 525 });
    expect(plot.ticks[0]!.yards).toBe(0);
    expect(plot.ticks[0]!.y).toBeCloseTo(plot.pin.y, 5);
    const lastTick = plot.ticks[plot.ticks.length - 1]!;
    for (let i = 1; i < plot.ticks.length; i++) {
      expect(plot.ticks[i]!.y).toBeGreaterThan(plot.ticks[i - 1]!.y);
    }
    expect(lastTick.y).toBeLessThanOrEqual(plot.tee.y);
  });

  it('caps ticks defensively for a corrupted/absurd yardage', () => {
    const plot = plotHole({ shots: [], par: undefined, yardage: 5000 });
    const maxTickYards = Math.max(...plot.ticks.map((t) => t.yards));
    expect(maxTickYards).toBeLessThanOrEqual(800);
  });
});

// ---------------------------------------------------------------------------
// Green inset — its own honest, feet-scale coordinate system
// ---------------------------------------------------------------------------

describe('plotHole — green inset', () => {
  it('GREEN_INSET_VB is its own 100x100 space, independent of the corridor VB', () => {
    expect(GREEN_INSET_VB).toEqual({ width: 100, height: 100 });
    expect(GREEN_INSET_VB).not.toBe(VB);
  });

  it('auto-fits its display scale + ticks from the real max on-green distance', () => {
    const shots: ShotInput[] = [{ shot_number: 1, lie_after: 'green', distance_to_hole_after: 8 }];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    // displayFeet = clamp(8 * 1.25, 8, 45) = 10 → 5ft-step ticks at 5, 10.
    expect(plot.greenInset.ticks.map((t) => t.feet)).toEqual([5, 10]);
    expect(plot.greenInset.ticks[0]!.y).toBeGreaterThan(plot.greenInset.ticks[1]!.y);
  });

  it('a hole with zero inset-eligible shots gets the default display scale', () => {
    const shots: ShotInput[] = [{ shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 }];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.greenInset.shots).toEqual([]);
    // Default display feet = 20 → 10ft-step ticks at 10, 20.
    expect(plot.greenInset.ticks.map((t) => t.feet)).toEqual([10, 20]);
  });

  it('every inset shot stays within its own boundary circle', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 30, miss_direction: 'left' },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 30, miss_direction: 'left' },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 0 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    const { cx, cy, r } = plot.greenInset.boundary;
    for (const s of plot.greenInset.shots) {
      expect(Math.hypot(s.x - cx, s.y - cy)).toBeLessThanOrEqual(r + 1e-6);
    }
  });

  it('flags in_green_inset on the corresponding PlottedShot', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 9 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.shots[0]!.in_green_inset).toBe(false);
    expect(plot.shots[1]!.in_green_inset).toBe(true);
    expect(plot.greenInset.shots.map((s) => s.shot_index)).toEqual([1]);
  });

  it('includes a non-green shot that finished within the short-distance threshold', () => {
    // A chip that lands 8 yards away but the player logged the lie as
    // 'fairway' (short-siding a bunker, e.g.) still suffers the collapse
    // problem and should qualify for the inset.
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 8 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.shots[0]!.in_green_inset).toBe(true);
    expect(plot.greenInset.shots).toHaveLength(1);
    expect(plot.greenInset.shots[0]!.remaining_feet).toBe(24); // 8yd -> 24ft
  });

  it('the short-distance threshold is widened to 18y (a 15y short-sided chip now qualifies, where the old 10y cutoff would have collapsed it in the corridor)', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 15 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.shots[0]!.in_green_inset).toBe(true);
    expect(plot.greenInset.shots).toHaveLength(1);
  });

  it('a 19y shot (just past the widened threshold) still does NOT qualify — the threshold is a real cutoff, not unlimited', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 19 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.shots[0]!.in_green_inset).toBe(false);
    expect(plot.greenInset.shots).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Green inset — MIN-SEPARATION (the tap-in bug): dots whose TRUE radius is
// crowded get pushed apart ANGULARLY only. Radius (distance ordering) is
// never touched.
// ---------------------------------------------------------------------------

describe('plotHole — green inset min-separation', () => {
  it('preserves radius ordering exactly even when angles get nudged — a 1-footer never renders farther from the pin than a 3-footer', () => {
    // Three putts crammed inside a few feet of each other and the pin: a
    // classic 3-putt (25ft lag, a 2ft comebacker) plus a tap-in.
    const shots: ShotInput[] = [
      { shot_number: 1, lie_before: 'fairway', lie_after: 'green', distance_to_hole_before: 40, distance_to_hole_after: 25 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 2 },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 1 },
      { shot_number: 4, lie_after: 'green', distance_to_hole_after: 0 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    const radii = plot.greenInset.shots.map((s) => s.true_radius_units);
    // Sorted ascending, exactly matching remaining_feet order: 25 > 2 > 1 > 0.
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]!).toBeLessThanOrEqual(radii[i - 1]!);
    }
    // The 1ft and 2ft putts (and the holed putt) are all crammed within
    // GREEN_INSET_MIN_RADIAL_GAP_UNITS of each other/the pin -> flagged.
    expect(plot.greenInset.shots[1]!.leader).toBe(true);
    expect(plot.greenInset.shots[2]!.leader).toBe(true);
  });

  it('nudged dots stay on their true-radius ring — Euclidean distance from the inset pin equals true_radius_units', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 3 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 2.5 },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 0 },
    ];
    const plot = plotHole({ shots, par: 3, yardage: 175 });
    const { cx, cy } = plot.greenInset.boundary;
    for (const s of plot.greenInset.shots) {
      expect(Math.hypot(s.x - cx, s.y - cy)).toBeCloseTo(s.true_radius_units, 6);
    }
  });

  it('does NOT nudge (leader stays false) when shots are comfortably separated in radius', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 30 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 10 },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 0 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.greenInset.shots.every((s) => s.leader === false)).toBe(true);
  });

  it('is deterministic — the same crowded ledger nudges to the identical angle every time (no Math.random)', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 4 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 3.5 },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 0 },
    ];
    const a = plotHole({ shots, par: 4, yardage: 400 });
    const b = plotHole({ shots, par: 4, yardage: 400 });
    expect(a.greenInset.shots).toEqual(b.greenInset.shots);
  });

  it('every inset shot stays within the boundary circle even under heavy crowding', () => {
    const shots: ShotInput[] = Array.from({ length: 6 }, (_, i) => ({
      shot_number: i + 1,
      lie_after: 'green' as const,
      distance_to_hole_after: i === 5 ? 0 : 3 - i * 0.4,
    }));
    const plot = plotHole({ shots, par: 3, yardage: 175 });
    const { cx, cy, r } = plot.greenInset.boundary;
    for (const s of plot.greenInset.shots) {
      expect(Math.hypot(s.x - cx, s.y - cy)).toBeLessThanOrEqual(r + 1e-6);
    }
  });
});

// ---------------------------------------------------------------------------
// Green inset — NEAR-PIN RADIAL FLOOR (WAVE C bug 1: the swallowed dot).
// Angle alone can never separate a small-radius dot from a point at the
// origin (sin/cos of a near-zero radius stays near-zero regardless of
// angle) — a holed putt is pinned at radius EXACTLY 0, so a near-pin miss
// used to render ~50% inside both the pin glyph and the holed dot's own
// ring, and (since the holed dot paints last / on top) swallow its
// hit-testing too. `GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS` floors a
// non-holed dot's DRAWN radius outward when its true radius is too close
// to the origin, combined with the (now dynamic, law-of-cosines-derived)
// angular fan for any dots that remain crowded relative to each other
// post-floor. `true_radius_units` — the honest, remaining-feet-derived
// number the leader tick discloses — is never touched by any of this.
//
// Ring radii mirror `PuttingZoom.tsx`'s actual rendered footprints (not
// imported — that file is out of this fix's scope, see its own module doc
// for the exact values): pin glyph `r="2.3"`; a putt dot's own `r` is
// `isMade ? 3.1 : isUnresolved ? 3 : 2.5`, with a `+0.8` outer ring on top.
// ---------------------------------------------------------------------------

/** Mirrors PuttingZoom.tsx's per-dot outer-ring radius (`r + 0.8`) for a
 *  green-inset shot at position `i` of `n` total inset shots on this hole.
 *  `isHoled`/`isMade` share a footprint (a holed putt IS the made
 *  treatment); `isUnresolved` only ever applies to the actual last shot
 *  when it did NOT hole out. */
function puttingZoomRingRadius(trueRadiusUnits: number, i: number, n: number, holedAtEnd: boolean): number {
  const isMadeOrHoled = trueRadiusUnits <= 0;
  const isUnresolved = !isMadeOrHoled && i === n - 1 && !holedAtEnd;
  const r = isMadeOrHoled ? 3.1 : isUnresolved ? 3 : 2.5;
  return r + 0.8;
}

describe('plotHole — green inset NEAR-PIN RADIAL FLOOR (bug 1: the swallowed dot)', () => {
  // The exact hole-6 shape from the bug report: an approach reaches the
  // green 10ft out, the first putt leaves a 1-footer, the comebacker slides
  // 3ft past, and the next putt holes out. Before this fix, the 1-footer's
  // true radius (~3.68 inset units) rendered almost entirely inside both
  // the pin glyph (r=2.3) and the holed dot's own ring (r=3.9).
  const shots: ShotInput[] = [
    {
      shot_number: 1,
      lie_before: 'fairway',
      lie_after: 'green',
      distance_to_hole_before: 40,
      distance_to_hole_after: 10, // entry: reached the green 10ft out
    },
    { shot_number: 2, lie_after: 'green', distance_to_hole_after: 1 }, // 1ft miss
    { shot_number: 3, lie_after: 'green', distance_to_hole_after: 3 }, // 3ft miss (past)
    { shot_number: 4, lie_after: 'green', distance_to_hole_after: 0 }, // holed
  ];
  const plot = plotHole({ shots, par: 4, yardage: 400 });
  const inset = plot.greenInset;

  it('sets up the exact colliding shape the bug describes: the 1ft miss true radius sits well inside the holed dot + pin glyph combined footprint', () => {
    // Sanity-check the fixture actually reproduces the bug's premise before
    // asserting the fix — if this fails, the fixture stopped colliding and
    // the rest of this describe block is vacuous.
    const oneFootMiss = inset.shots[1]!;
    expect(oneFootMiss.true_radius_units).toBeGreaterThan(0);
    const holedRing = puttingZoomRingRadius(0, 3, 4, true); // 3.9
    const pinGlyphRadius = 2.3;
    expect(oneFootMiss.true_radius_units).toBeLessThan(holedRing + pinGlyphRadius);
  });

  it('true_radius_units is untouched — still exactly the honest remaining-feet radius for every shot', () => {
    const fpu = inset.feet_per_unit;
    expect(inset.shots[1]!.remaining_feet).toBe(1);
    expect(inset.shots[1]!.true_radius_units).toBeCloseTo(1 / fpu, 10);
    expect(inset.shots[2]!.remaining_feet).toBe(3);
    expect(inset.shots[2]!.true_radius_units).toBeCloseTo(3 / fpu, 10);
    expect(inset.shots[0]!.remaining_feet).toBe(10);
    expect(inset.shots[0]!.true_radius_units).toBeCloseTo(10 / fpu, 10);
    // The holed putt is definitionally at the pin — radius exactly 0, not
    // merely close to it.
    expect(inset.shots[3]!.remaining_feet).toBe(0);
    expect(inset.shots[3]!.true_radius_units).toBe(0);
  });

  it('the holed putt stays exactly at the pin — never floored, never nudged', () => {
    const holed = inset.shots[3]!;
    expect(holed.x).toBe(inset.pin.x);
    expect(holed.y).toBe(inset.pin.y);
    expect(holed.leader).toBe(false);
  });

  it('the 1ft miss (the swallowed dot) is drawn AWAY from its true radius, past the min display floor, and flagged as a leader', () => {
    const oneFootMiss = inset.shots[1]!;
    const drawnRadius = Math.hypot(oneFootMiss.x - inset.pin.x, oneFootMiss.y - inset.pin.y);
    // Drawn radius is materially larger than the true (honest) radius —
    // this IS the floor firing, not an accident of angle alone (angle
    // alone cannot change the radius at all).
    expect(drawnRadius).toBeGreaterThan(oneFootMiss.true_radius_units);
    expect(drawnRadius).toBeCloseTo(GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS, 6);
    expect(oneFootMiss.leader).toBe(true);
  });

  it('distance ordering by true_radius_units is preserved after flooring — a 1ft never renders farther from the pin than a 3ft, and both stay closer than the 10ft entry', () => {
    const byTrueRadius = [...inset.shots].sort((a, b) => a.true_radius_units - b.true_radius_units);
    for (let i = 1; i < byTrueRadius.length; i++) {
      const prev = byTrueRadius[i - 1]!;
      const cur = byTrueRadius[i]!;
      const prevDrawn = Math.hypot(prev.x - inset.pin.x, prev.y - inset.pin.y);
      const curDrawn = Math.hypot(cur.x - inset.pin.x, cur.y - inset.pin.y);
      // Non-strict: two floored dots may legitimately TIE at the floor
      // radius (differentiated by angle instead) — but a smaller true
      // radius must never end up drawn strictly FARTHER out than a larger
      // one.
      expect(curDrawn).toBeGreaterThanOrEqual(prevDrawn - 1e-9);
    }
    // Concretely for this ledger: true order is holed(0) < 1ft < 3ft < 10ft
    // entry — confirm the drawn order matches.
    expect(byTrueRadius.map((s) => s.shot_index)).toEqual([3, 1, 2, 0]);
  });

  it('NO two inset dots (including the pin/holed dot) have overlapping rings — the exact swallowed-dot bug is gone', () => {
    const n = inset.shots.length;
    let worstGap = Infinity;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = inset.shots[i]!;
        const b = inset.shots[j]!;
        const centerDist = Math.hypot(a.x - b.x, a.y - b.y);
        const ringA = puttingZoomRingRadius(a.true_radius_units, i, n, true);
        const ringB = puttingZoomRingRadius(b.true_radius_units, j, n, true);
        const ringGap = centerDist - ringA - ringB;
        worstGap = Math.min(worstGap, ringGap);
      }
    }
    expect(worstGap).toBeGreaterThan(0);
  });

  it('the specific pair that used to collide — the 1ft miss vs the holed dot — clears the pin glyph AND the holed dot ring, not just one', () => {
    const oneFootMiss = inset.shots[1]!;
    const holed = inset.shots[3]!;
    const centerDist = Math.hypot(oneFootMiss.x - holed.x, oneFootMiss.y - holed.y);
    const missRing = puttingZoomRingRadius(oneFootMiss.true_radius_units, 1, 4, true);
    const holedRing = puttingZoomRingRadius(0, 3, 4, true);
    const pinGlyphRadius = 2.3;
    expect(centerDist).toBeGreaterThan(missRing + holedRing);
    expect(centerDist).toBeGreaterThan(missRing + pinGlyphRadius);
  });

  it('every inset shot still stays within the boundary circle', () => {
    const { cx, cy, r } = inset.boundary;
    for (const s of inset.shots) {
      expect(Math.hypot(s.x - cx, s.y - cy)).toBeLessThanOrEqual(r + 1e-6);
    }
  });

  it('is deterministic — replotting the identical ledger yields the identical floored/fanned geometry', () => {
    const again = plotHole({ shots, par: 4, yardage: 400 });
    expect(again.greenInset.shots).toEqual(inset.shots);
  });

  it('a shot whose true radius is comfortably clear of the floor is NOT floored — the fix is targeted, not a blanket push-out', () => {
    // The 10ft entry (true radius ~36.8 units on this hole's auto-fit
    // scale) is nowhere near the near-pin floor — its drawn radius should
    // equal its true radius exactly (angle may still be its natural seed,
    // but radius is untouched).
    const entry = inset.shots[0]!;
    const drawnRadius = Math.hypot(entry.x - inset.pin.x, entry.y - inset.pin.y);
    expect(drawnRadius).toBeCloseTo(entry.true_radius_units, 6);
    expect(entry.true_radius_units).toBeGreaterThan(GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS);
  });

  it('GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS is calibrated well clear of the "comfortably separated, no nudge needed" boundary the pre-existing suite already relies on', () => {
    // Sanity constant check, not a behavior test: the floor must stay
    // meaningfully smaller than a distance this suite already treats as
    // "far enough to need no help" (see the "does NOT nudge" spec above),
    // and meaningfully larger than the min radial gap alone — otherwise
    // either this fix under-fires (still swallows near-pin dots) or
    // over-fires (floors dots that were never actually colliding).
    expect(GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS).toBeGreaterThan(GREEN_INSET_MIN_RADIAL_GAP_UNITS);
    expect(GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS).toBeLessThan(12);
  });
});

describe('plotHole — green inset PUTT-TO-PUTT CONTINUITY (2026-07-24 bugfix: "he hit it backwards")', () => {
  const shots: ShotInput[] = [
    // Entry: the approach shot reaches the green, 10ft from the pin.
    { shot_number: 1, lie_before: 'fairway', lie_after: 'green', distance_to_hole_after: 10 },
    // Putt 2: approaches to 2ft, missing left.
    { shot_number: 2, lie_before: 'green', lie_after: 'green', distance_to_hole_after: 2, miss_direction: 'left' },
    // Putt 3: a genuine run-by — rolls OUT to 5ft (farther than putt 2
    // started), logging the SAME miss side as putt 2 — this exact shape
    // (same logged side, radius grew) is what the old free-running angle
    // walk rendered as "farther out on the same side," i.e. backward.
    { shot_number: 3, lie_before: 'green', lie_after: 'green', distance_to_hole_after: 5, miss_direction: 'left' },
    // Putt 4: holed. `distance_to_hole_after` is deliberately NOT a clean
    // 0 (mirrors a real putt_made row whose logged distance rounds to a
    // small nonzero value) — `putt_made` alone must still pin it at the cup.
    { shot_number: 4, lie_before: 'green', lie_after: 'green', distance_to_hole_after: 0.2, putt_made: true },
  ];
  const plot = plotHole({ shots, par: 4, yardage: 400 });
  const inset = plot.greenInset;

  it('produces one inset shot per ledger row (entry + 3 putts)', () => {
    expect(inset.shots).toHaveLength(4);
  });

  it('MADE-PUTT RADIUS: putt_made forces true_radius_units to exactly 0 and draws the dot exactly at the pin, even though the logged distance is not a clean 0', () => {
    const holed = inset.shots[3]!;
    expect(holed.true_radius_units).toBe(0);
    expect(holed.x).toBeCloseTo(inset.pin.x, 6);
    expect(holed.y).toBeCloseTo(inset.pin.y, 6);
    // Correctly AT the pin, not colliding with it — never floored/nudged.
    expect(holed.leader).toBe(false);
  });

  it('the near-pin putt (2ft) still gets floored outward for legibility, same as the pre-existing near-pin fix', () => {
    const approach = inset.shots[1]!;
    expect(approach.true_radius_units).toBeLessThan(GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS);
    const drawnRadius = Math.hypot(approach.x - inset.pin.x, approach.y - inset.pin.y);
    expect(drawnRadius).toBeCloseTo(GREEN_INSET_MIN_DISPLAY_RADIUS_UNITS, 6);
  });

  it('the run-by putt (5ft, same logged miss side as the 2ft putt before it) renders on the OPPOSITE side of the pin from its start — never farther out on the SAME side', () => {
    const approach = inset.shots[1]!; // 2ft
    const runBy = inset.shots[2]!; // 5ft — a genuine overshoot vs. approach

    // The overshoot is real: farther from the pin than the putt before it.
    expect(runBy.true_radius_units).toBeGreaterThan(approach.true_radius_units);
    // Neither dot is caught by the pre-existing min-separation fan-nudge
    // in this scenario — isolates the check below to the continuity fix
    // itself, not the unrelated crowding mechanism.
    expect(runBy.leader).toBe(false);

    const vApproach = { x: approach.x - inset.pin.x, y: approach.y - inset.pin.y };
    const vRunBy = { x: runBy.x - inset.pin.x, y: runBy.y - inset.pin.y };
    const magApproach = Math.hypot(vApproach.x, vApproach.y);
    const magRunBy = Math.hypot(vRunBy.x, vRunBy.y);
    const cosAngleBetween =
      (vApproach.x * vRunBy.x + vApproach.y * vRunBy.y) / (magApproach * magRunBy);
    // More than 90 degrees apart — genuinely opposite-ish sides of the pin.
    // The pre-fix geometry (a free-running angle walk with no radius
    // awareness) put these two dots within ~52 degrees of each other,
    // which is what read as "the ball went backward."
    expect(cosAngleBetween).toBeLessThan(-0.3);
  });

  it('is deterministic — replotting the identical ledger yields the identical continuity geometry (no Math.random)', () => {
    const again = plotHole({ shots, par: 4, yardage: 400 });
    expect(again.greenInset.shots).toEqual(inset.shots);
  });
});

// ---------------------------------------------------------------------------
// Scenario coverage — the six ledgers the contract must hold up under
// ---------------------------------------------------------------------------

describe('plotHole — scenario: par-3 tee-to-green', () => {
  const shots: ShotInput[] = [
    {
      shot_number: 1,
      lie_before: 'tee',
      lie_after: 'green',
      distance_to_hole_before: 165,
      distance_to_hole_after: 18, // feet — tee shot reached the green
    },
    {
      shot_number: 2,
      lie_before: 'green',
      lie_after: 'green',
      distance_to_hole_after: 0,
    },
  ];
  const plot = plotHole({ shots, par: 3, yardage: null });

  it('infers total_yardage from the tee-lie before-distance (yards, unaffected by the green-feet rule)', () => {
    expect(plot.total_yardage).toBe(165);
  });

  it('converts the tee shot landing on the green to yards correctly (18ft = 6yd)', () => {
    expect(plot.shots[0]!.remaining_yards).toBe(6);
    expect(plot.shots[0]!.shot_yards).toBe(159); // 165 - 6
  });

  it('holes the putt at the pin', () => {
    const last = plot.shots[1]!;
    expect(last.x).toBe(plot.pin.x);
    expect(last.y).toBe(plot.pin.y);
  });

  it('both shots are green-inset eligible; entry_shot_index is null (the very first shot is already on the green)', () => {
    expect(plot.greenInset.shots).toHaveLength(2);
    expect(plot.greenInset.entry_shot_index).toBeNull();
  });

  it('the putts own length round-trips exactly through the corridor->feet conversion (18ft putt)', () => {
    expect(plot.greenInset.shots[1]!.shot_feet).toBe(18);
  });

  it('the tee shots inset shot_feet falls back to its real corridor shot_yards converted to feet (no prior inset point to diff against)', () => {
    // 159 real yards -> 477 feet. Large, but honest: it's the shot that
    // reached the green, not a putt.
    expect(plot.greenInset.shots[0]!.shot_feet).toBe(477);
  });
});

describe('plotHole — scenario: par-5 with a penalty (REAL production shape: before === after, shot_distance = 0)', () => {
  // This is the shape `use-penalty-handler.ts confirmPenalty()` actually
  // writes — distance_to_hole_after ALWAYS equals distance_to_hole_before
  // for a penalty stroke, and shot_distance is ALWAYS 0. (The prior test
  // fixture here used a synthetic 320→210 shape that never occurs in
  // production — see 02-accuracy-and-correctness.md finding #9.)
  const shots: ShotInput[] = [
    { shot_number: 1, lie_before: 'tee', lie_after: 'fairway', distance_to_hole_before: 545, distance_to_hole_after: 320 },
    {
      shot_number: 2,
      lie_before: 'fairway',
      lie_after: 'water',
      distance_to_hole_before: 320,
      distance_to_hole_after: 320,
      shot_distance: 0,
      is_penalty: true,
      penalty_type: 'water',
    },
    { shot_number: 3, lie_before: 'fairway', lie_after: 'fairway', distance_to_hole_before: 320, distance_to_hole_after: 90 },
    { shot_number: 4, lie_before: 'fairway', lie_after: 'green', distance_to_hole_before: 90, distance_to_hole_after: 15 },
    { shot_number: 5, lie_before: 'green', lie_after: 'green', distance_to_hole_after: 0 },
  ];
  const plot = plotHole({ shots, par: 5, yardage: null });

  it('infers 545y from shot 1', () => {
    expect(plot.total_yardage).toBe(545);
  });

  it('plants a water hazard at the penalty shots endpoint', () => {
    const waterHazards = plot.hazards.filter((h) => h.kind === 'water');
    expect(waterHazards).toHaveLength(1);
    expect(waterHazards[0]!.origin_shot).toBe(2);
    expect(waterHazards[0]!.x).toBe(plot.shots[1]!.x);
    expect(waterHazards[0]!.y).toBe(plot.shots[1]!.y);
  });

  it('marks the penalty shot is_penalty and carries its penalty_type through for tooltips', () => {
    expect(plot.shots[1]!.is_penalty).toBe(true);
    expect(plot.shots[1]!.penalty_type).toBe('water');
  });

  it('marks the penalty shot symbolic, plots it at its START (shot 1s endpoint), and never fabricates its own length', () => {
    const penalty = plot.shots[1]!;
    expect(penalty.symbolic).toBe(true);
    // Y comes from the penalty's own before-distance (320), which for this
    // well-formed ledger is identical to shot 1's real endpoint.
    expect(penalty.y).toBe(plot.shots[0]!.y);
    // Never a fabricated "0" (which would render as "<1 yd" — a lie for a
    // real 225y drive). null is the honest value: no distance recorded.
    expect(penalty.shot_yards).toBeNull();
    // remaining_yards stays real — it's a separately-logged number (320
    // yards to pin from the drop), not fabricated.
    expect(penalty.remaining_yards).toBe(320);
  });

  it('emits NO flight segment for the penalty shot — a real swing is never drawn as a ~0-length stub', () => {
    // 5 shots, 1 penalty -> 4 segments, none targeting the penalty's index.
    expect(plot.segments).toHaveLength(4);
    expect(plot.segments.some((seg) => seg.to_index === 1)).toBe(false);
  });

  it('the NEXT real shot (3) connects FROM the penaltys plotted position — the sequence reads truthfully', () => {
    const seg = plot.segments.find((s) => s.to_index === 2)!;
    expect(seg.from).toEqual({ x: plot.shots[1]!.x, y: plot.shots[1]!.y });
    expect(seg.to).toEqual({ x: plot.shots[2]!.x, y: plot.shots[2]!.y });
  });

  it('holes the final putt and correctly identifies the green-entry shot', () => {
    const last = plot.shots[4]!;
    expect(last.x).toBe(plot.pin.x);
    expect(last.y).toBe(plot.pin.y);
    // Shot 4 (index 3) is the first inset-eligible shot -> entry is shot 3 (index 2).
    expect(plot.greenInset.entry_shot_index).toBe(2);
  });
});

describe('plotHole — scenario: tee-shot penalty (the exact hole-6 shape — a 280y+ OB drive must NOT collapse onto the tee marker)', () => {
  const shots: ShotInput[] = [
    {
      shot_number: 1,
      lie_before: 'tee',
      lie_after: 'other',
      distance_to_hole_before: 564,
      distance_to_hole_after: 564,
      shot_distance: 0,
      is_penalty: true,
      penalty_type: 'ob',
      miss_direction: 'right',
    },
    { shot_number: 2, lie_before: 'tee', lie_after: 'fairway', distance_to_hole_before: 564, distance_to_hole_after: 260 },
  ];
  const plot = plotHole({ shots, par: 5, yardage: 564 });

  it('plots the penalty marker at the tee (its start), not fabricating a fake flight endpoint', () => {
    expect(plot.shots[0]!.symbolic).toBe(true);
    expect(plot.shots[0]!.y).toBe(plot.tee.y);
    expect(plot.shots[0]!.shot_yards).toBeNull();
  });

  it('emits no segment for shot 1, so shot 2 (the real drive) is not misread as "the first thing that happened"', () => {
    expect(plot.segments).toHaveLength(1);
    expect(plot.segments[0]!.to_index).toBe(1);
    // The real drive's segment starts from the penalty markers position —
    // i.e. the tee — not from some other fabricated point.
    expect(plot.segments[0]!.from).toEqual({ x: plot.shots[0]!.x, y: plot.shots[0]!.y });
  });

  it('gets a neutral OB hazard glyph, never water, for the OB tee shot', () => {
    const hazard = plot.hazards.find((h) => h.origin_shot === 1)!;
    expect(hazard.kind).toBe('ob');
  });
});

describe('plotHole — scenario: lost ball (no distance_after logged)', () => {
  const shots: ShotInput[] = [
    { shot_number: 1, lie_before: 'tee', lie_after: 'rough', distance_to_hole_before: 400, distance_to_hole_after: 220 },
    {
      shot_number: 2,
      lie_before: 'rough',
      lie_after: 'other',
      distance_to_hole_before: 220,
      distance_to_hole_after: null,
      is_penalty: true,
      penalty_type: 'lost',
    },
    { shot_number: 3, lie_before: 'rough', lie_after: 'fairway', distance_to_hole_before: 220, distance_to_hole_after: 140 },
  ];
  const plot = plotHole({ shots, par: 4, yardage: 400 });

  it('never fabricates a distance for the lost-ball shot', () => {
    const lost = plot.shots[1]!;
    expect(lost.remaining_yards).toBeNull();
    expect(lost.distance_to_pin).toBeNull();
    expect(lost.shot_yards).toBeNull();
    expect(lost.in_green_inset).toBe(false);
  });

  it('still positions the lost-ball shot inside the viewBox via graceful positional fallback', () => {
    const lost = plot.shots[1]!;
    expect(lost.y).toBeGreaterThanOrEqual(plot.pin.y);
    expect(lost.y).toBeLessThanOrEqual(plot.tee.y);
  });

  it('plants a neutral OB-class hazard (never water) for a lost-ball penalty', () => {
    const lostHazard = plot.hazards.find((h) => h.origin_shot === 2);
    expect(lostHazard?.kind).toBe('ob');
  });

  it('does NOT let the gap corrupt the following shots own logged distance', () => {
    const next = plot.shots[2]!;
    expect(next.remaining_yards).toBe(140);
    expect(next.shot_yards).toBe(80); // 220 - 140, from its own before/after
  });
});

describe('plotHole — scenario: putts-only ledger', () => {
  const shots: ShotInput[] = [
    { shot_number: 1, lie_before: 'green', lie_after: 'green', distance_to_hole_before: 22, distance_to_hole_after: 6 },
    { shot_number: 2, lie_before: 'green', lie_after: 'green', distance_to_hole_after: 0 },
  ];
  const plot = plotHole({ shots, par: 4, yardage: 400 });

  it('collapses toward the pin on the full-size corridor (proving why the inset exists)', () => {
    expect(Math.abs(plot.shots[0]!.y - plot.pin.y)).toBeLessThan(1);
  });

  it('is fully legible in the green inset with the raw feet values preserved', () => {
    expect(plot.greenInset.shots[0]!.remaining_feet).toBe(6);
    expect(plot.greenInset.shots[1]!.remaining_feet).toBe(0);
  });

  it('the first putts length round-trips exactly (22ft - 6ft = 16ft) through the yards conversion', () => {
    expect(plot.shots[0]!.shot_yards).toBeCloseTo(16 / 3, 10);
    expect(plot.greenInset.shots[0]!.shot_feet).toBeCloseTo(16, 10);
  });

  it('both shots are green-inset eligible', () => {
    expect(plot.shots.every((s) => s.in_green_inset)).toBe(true);
  });
});

describe('plotHole — scenario: missing-distance rows mid-hole', () => {
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'fairway', distance_to_hole_before: 380, distance_to_hole_after: 200 },
    { shot_number: 2, lie_after: 'fairway', distance_to_hole_after: null },
    { shot_number: 3, lie_after: 'green', distance_to_hole_before: 90, distance_to_hole_after: 12 },
    { shot_number: 4, lie_after: 'green', distance_to_hole_after: 0 },
  ];
  const plot = plotHole({ shots, par: 4, yardage: null });

  it('does not throw and produces one plotted shot per input row', () => {
    expect(plot.shots).toHaveLength(4);
  });

  it('leaves the gapped shot honestly null', () => {
    expect(plot.shots[1]!.remaining_yards).toBeNull();
    expect(plot.shots[1]!.shot_yards).toBeNull();
  });

  it('resumes accurate computation on the next shot using its own logged before/after', () => {
    // 12ft -> 4yd; before=90 (fairway, yards) -> shot_yards = 86
    expect(plot.shots[2]!.remaining_yards).toBe(4);
    expect(plot.shots[2]!.shot_yards).toBe(86);
  });
});

describe('plotHole — scenario: 20-shot blowup hole', () => {
  const shots: ShotInput[] = Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    const missCycle = ['left', 'right', null, 'long', 'short'] as const;
    const lieCycle = ['rough', 'sand', 'water', 'fairway'] as const;
    return {
      shot_number: n,
      lie_before: n === 1 ? 'tee' : lieCycle[(i - 1) % lieCycle.length]!,
      lie_after: n === 20 ? 'green' : lieCycle[i % lieCycle.length]!,
      distance_to_hole_before: n === 1 ? 500 : undefined,
      distance_to_hole_after: n === 20 ? 0 : Math.max(5, 500 - n * 23),
      miss_direction: missCycle[i % missCycle.length],
      is_penalty: n % 7 === 0,
    } satisfies ShotInput;
  });
  const plot = plotHole({ shots, par: 5, yardage: null });

  it('plots all 20 shots without throwing', () => {
    expect(plot.shots).toHaveLength(20);
    // Shots 7 and 14 (n % 7 === 0) are penalties — no flight segment is
    // emitted for a symbolic shot, so segments < shots by the penalty count.
    const penaltyCount = plot.shots.filter((s) => s.is_penalty).length;
    expect(penaltyCount).toBe(2);
    expect(plot.segments).toHaveLength(20 - penaltyCount);
  });

  it('keeps every corridor endpoint inside the viewBox even under repeated streak+penalty amplification', () => {
    for (const s of plot.shots) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(VB.width);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(VB.height);
    }
  });

  it('keeps every inset shot inside its own boundary circle', () => {
    const { cx, cy, r } = plot.greenInset.boundary;
    for (const s of plot.greenInset.shots) {
      expect(Math.hypot(s.x - cx, s.y - cy)).toBeLessThanOrEqual(r + 1e-6);
    }
  });

  it('remains deterministic across repeated calls', () => {
    const again = plotHole({ shots, par: 5, yardage: null });
    expect(again).toEqual(plot);
  });
});

// ---------------------------------------------------------------------------
// Lateral stylization — deterministic, bounded, streak/penalty aware
// ---------------------------------------------------------------------------

describe('plotHole — lateral stylization', () => {
  it('consecutive same-direction misses amplify (the second step is larger than the first)', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'rough', distance_to_hole_after: 250, miss_direction: 'right' },
      { shot_number: 2, lie_after: 'rough', distance_to_hole_after: 150, miss_direction: 'right' },
    ];
    const plot = plotHole({ shots, par: 5, yardage: 525 });
    const firstStep = plot.shots[0]!.x - 50; // tee.x
    const secondStep = plot.shots[1]!.x - plot.shots[0]!.x;
    expect(firstStep).toBeGreaterThan(0);
    expect(secondStep).toBeGreaterThan(firstStep);
  });

  it('a penalty widens the lateral offset versus an otherwise-identical non-penalty miss', () => {
    const base: ShotInput = {
      shot_number: 1,
      lie_after: 'rough',
      distance_to_hole_after: 200,
      miss_direction: 'right',
    };
    const normalPlot = plotHole({ shots: [base], par: 4, yardage: 400 });
    const penaltyPlot = plotHole({ shots: [{ ...base, is_penalty: true }], par: 4, yardage: 400 });
    expect(penaltyPlot.shots[0]!.x).toBeGreaterThan(normalPlot.shots[0]!.x);
  });

  it('is a pure function of shot_number (deterministic tie-break, never Math.random)', () => {
    // Same "straight" shot (no miss_direction) plotted from two otherwise
    // identical ledgers with the same shot_number must land identically.
    const a = plotHole({ shots: [{ shot_number: 7, lie_after: 'fairway', distance_to_hole_after: 150 }], par: 4, yardage: 400 });
    const b = plotHole({ shots: [{ shot_number: 7, lie_after: 'fairway', distance_to_hole_after: 150 }], par: 4, yardage: 400 });
    expect(a.shots[0]!.x).toBe(b.shots[0]!.x);
  });

  it('long/short miss_direction passes through cleanly and distinctly from left/right/null on PlottedShot — a renderer can key an along-axis wedge glyph off this alone', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'rough', distance_to_hole_after: 200, miss_direction: 'long' },
      { shot_number: 2, lie_after: 'rough', distance_to_hole_after: 190, miss_direction: 'short' },
      { shot_number: 3, lie_after: 'rough', distance_to_hole_after: 180, miss_direction: 'left' },
      { shot_number: 4, lie_after: 'rough', distance_to_hole_after: 170, miss_direction: 'right' },
      { shot_number: 5, lie_after: 'fairway', distance_to_hole_after: 160 },
    ];
    const plot = plotHole({ shots, par: 5, yardage: 500 });
    expect(plot.shots.map((s) => s.miss_direction)).toEqual(['long', 'short', 'left', 'right', null]);
  });

  it('a long/short miss does NOT get a left/right-style lateral push — no lateral yardage is fabricated for an along-axis miss', () => {
    const long: ShotInput[] = [{ shot_number: 1, lie_after: 'rough', distance_to_hole_after: 200, miss_direction: 'long' }];
    const left: ShotInput[] = [{ shot_number: 1, lie_after: 'rough', distance_to_hole_after: 200, miss_direction: 'left' }];
    const right: ShotInput[] = [{ shot_number: 1, lie_after: 'rough', distance_to_hole_after: 200, miss_direction: 'right' }];
    const longPlot = plotHole({ shots: long, par: 4, yardage: 400 });
    const leftPlot = plotHole({ shots: left, par: 4, yardage: 400 });
    const rightPlot = plotHole({ shots: right, par: 4, yardage: 400 });
    // long stays near center — clearly inside the (much larger) left/right offsets.
    expect(Math.abs(longPlot.shots[0]!.x - 50)).toBeLessThan(Math.abs(leftPlot.shots[0]!.x - 50));
    expect(Math.abs(longPlot.shots[0]!.x - 50)).toBeLessThan(Math.abs(rightPlot.shots[0]!.x - 50));
  });
});

// ---------------------------------------------------------------------------
// Pass-through fields (Fix 5): geometry.ts stays pure — no SG math here —
// but sg/putt_made/miss_tags/estimated_break_inches must survive plotHole
// unchanged so the data layer (which DOES compute them) and the renderer
// (which reads them) can rely on PlottedShot alone.
// ---------------------------------------------------------------------------

describe('plotHole — pass-through fields survive unchanged (sg, putt_made, miss_tags, estimated_break_inches)', () => {
  it('copies sg/putt_made/miss_tags/estimated_break_inches verbatim onto the matching PlottedShot', () => {
    const shots: ShotInput[] = [
      {
        shot_number: 1,
        lie_after: 'green',
        distance_to_hole_after: 6,
        sg: -0.31,
        putt_made: false,
        miss_tags: ['short', 'low'],
        estimated_break_inches: 4,
      },
      {
        shot_number: 2,
        lie_after: 'green',
        distance_to_hole_after: 0,
        sg: 0.42,
        putt_made: true,
        miss_tags: null,
        estimated_break_inches: null,
      },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.shots[0]!.sg).toBe(-0.31);
    expect(plot.shots[0]!.putt_made).toBe(false);
    expect(plot.shots[0]!.miss_tags).toEqual(['short', 'low']);
    expect(plot.shots[0]!.estimated_break_inches).toBe(4);
    expect(plot.shots[1]!.sg).toBe(0.42);
    expect(plot.shots[1]!.putt_made).toBe(true);
    expect(plot.shots[1]!.miss_tags).toBeNull();
    expect(plot.shots[1]!.estimated_break_inches).toBeNull();
  });

  it('stays null-honest when the fields are absent from the input — never fabricated', () => {
    const shots: ShotInput[] = [{ shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 }];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.shots[0]!.sg).toBeUndefined();
    expect(plot.shots[0]!.putt_made).toBeUndefined();
    expect(plot.shots[0]!.miss_tags).toBeUndefined();
    expect(plot.shots[0]!.estimated_break_inches).toBeUndefined();
  });

  it('already-existing pass-through fields (penalty_type, putt_break, putt_slope) remain intact alongside the new ones', () => {
    const shots: ShotInput[] = [
      {
        shot_number: 1,
        lie_after: 'green',
        distance_to_hole_after: 12,
        putt_break: 'right_to_left',
        putt_slope: 'severe',
        sg: -0.5,
      },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.shots[0]!.putt_break).toBe('right_to_left');
    expect(plot.shots[0]!.putt_slope).toBe('severe');
    expect(plot.shots[0]!.sg).toBe(-0.5);
  });
});

// ---------------------------------------------------------------------------
// Bezier arc — sized from the REAL shot yardage, not raw pixel distance
// ---------------------------------------------------------------------------

describe('plotHole — segment arc reflects real shot yardage', () => {
  it('a longer real shot (via shot_distance) lifts the arc more than a shorter one at identical endpoints', () => {
    const makeShots = (shotDistance: number): ShotInput[] => [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150, shot_distance: shotDistance },
    ];
    const short = plotHole({ shots: makeShots(10), par: 4, yardage: 400 });
    const long = plotHole({ shots: makeShots(100), par: 4, yardage: 400 });
    // Identical endpoints (position doesn't depend on shot_distance) —
    // isolates the arc-lift effect.
    expect(short.segments[0]!.from).toEqual(long.segments[0]!.from);
    expect(short.segments[0]!.to).toEqual(long.segments[0]!.to);
    const midY = (short.segments[0]!.from.y + short.segments[0]!.to.y) / 2;
    const shortLift = midY - short.segments[0]!.control.y;
    const longLift = midY - long.segments[0]!.control.y;
    expect(longLift).toBeGreaterThan(shortLift);
  });

  it('arc lift is clamped even for an enormous logged shot yardage', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 100, shot_distance: 600 },
    ];
    const plot = plotHole({ shots, par: 5, yardage: 525 });
    const seg = plot.segments[0]!;
    const midY = (seg.from.y + seg.to.y) / 2;
    expect(midY - seg.control.y).toBeLessThanOrEqual(14.0001);
  });
});

// ---------------------------------------------------------------------------
// Hazards land AT the shot endpoint — the user's correction
// ---------------------------------------------------------------------------

describe('plotHole — hazards reconstruct from shot data', () => {
  it('plants a bunker at the endpoint where the player said they ended in sand', () => {
    const shots: ShotInput[] = [
      {
        shot_number: 1,
        lie_after: 'fairway',
        distance_to_hole_after: 220,
        distance_to_hole_before: 400,
      },
      {
        // The user's literal example: "miss-bunker 112 yards away"
        shot_number: 2,
        lie_after: 'sand',
        distance_to_hole_after: 112,
        distance_to_hole_before: 220,
      },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.hazards).toHaveLength(1);
    const sand = plot.hazards[0]!;
    expect(sand.kind).toBe('sand');
    // Bunker should sit at the same coordinates as shot 2's endpoint.
    const shot2 = plot.shots[1]!;
    expect(sand.x).toBe(shot2.x);
    expect(sand.y).toBe(shot2.y);
    expect(sand.origin_shot).toBe(2);
  });

  it('plants a rough cluster when lie_after === rough', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'rough', distance_to_hole_after: 180 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 380 });
    expect(plot.hazards).toHaveLength(1);
    expect(plot.hazards[0]!.kind).toBe('rough');
  });

  it('plants water for a water lie; a bare is_penalty flag with NO penalty_type gets a generic penalty glyph, never water', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'water', distance_to_hole_after: 150 },
      { shot_number: 2, lie_after: 'fairway', distance_to_hole_after: 100, is_penalty: true },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.hazards).toHaveLength(2);
    expect(plot.hazards[0]!.kind).toBe('water');
    // This is the fix: an unclassified penalty must NEVER default to water.
    expect(plot.hazards[1]!.kind).toBe('penalty');
  });

  it('branches the penalty hazard glyph on penalty_type — water/ob/lost/unplayable/unclassified never collapse to the same glyph', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'water', distance_to_hole_after: 300, is_penalty: true, penalty_type: 'water' },
      // lie_after intentionally NOT 'sand'/'rough' here — those lie checks
      // take priority over the penalty branch (unchanged from before this
      // fix), so this isolates the penalty_type branching itself.
      { shot_number: 2, lie_after: 'other', distance_to_hole_after: 250, is_penalty: true, penalty_type: 'ob' },
      { shot_number: 3, lie_after: 'other', distance_to_hole_after: 200, is_penalty: true, penalty_type: 'lost' },
      { shot_number: 4, lie_after: 'fairway', distance_to_hole_after: 150, is_penalty: true, penalty_type: 'unplayable' },
      { shot_number: 5, lie_after: 'fairway', distance_to_hole_after: 100, is_penalty: true },
      // A malformed/unrecognized penalty_type string must fall back to the
      // generic glyph too — NEVER water.
      { shot_number: 6, lie_after: 'fairway', distance_to_hole_after: 50, is_penalty: true, penalty_type: 'gopher_hole' },
    ];
    const plot = plotHole({ shots, par: 5, yardage: 525 });
    const kinds = plot.hazards.map((h) => h.kind);
    expect(kinds).toEqual(['water', 'ob', 'ob', 'unplayable', 'penalty', 'penalty']);
    // 'lost' shares the neutral 'ob' glyph with 'ob' — same non-water class.
    expect(plot.hazards[1]!.kind).toBe(plot.hazards[2]!.kind);
  });

  it('does NOT plant a hazard for fairway or green lies', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 18 },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 0 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.hazards).toHaveLength(0);
  });

  it('normalizes v2 lie strings — bunker→sand, heavy_rough→rough', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'bunker', distance_to_hole_after: 80 },
      { shot_number: 2, lie_after: 'heavy_rough', distance_to_hole_after: 40 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    expect(plot.hazards.map((h) => h.kind)).toEqual(['sand', 'rough']);
  });
});

// ---------------------------------------------------------------------------
// Segment paths — Bezier control point above the midpoint
// ---------------------------------------------------------------------------

describe('segmentPath', () => {
  it('produces a Quadratic Bezier "M…Q…" string', () => {
    const seg = {
      from: { x: 50, y: 180 },
      to: { x: 55, y: 100 },
      control: { x: 52.5, y: 130 },
      to_lie: 'fairway' as const,
      to_index: 0,
    };
    const d = segmentPath(seg);
    expect(d).toMatch(/^M /);
    expect(d).toContain(' Q ');
  });

  it('control point sits above (smaller y than) the midpoint for arc lift', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 200 },
    ];
    const plot = plotHole({ shots, par: 4, yardage: 400 });
    const seg = plot.segments[0]!;
    const midY = (seg.from.y + seg.to.y) / 2;
    expect(seg.control.y).toBeLessThanOrEqual(midY);
  });
});

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

describe('formatYards', () => {
  it('returns em-dash for null', () => {
    expect(formatYards(null)).toBe('—');
  });

  it('handles sub-yard values', () => {
    expect(formatYards(0.3)).toBe('<1 yd');
  });

  it('rounds and pluralizes', () => {
    expect(formatYards(1)).toBe('1 yd');
    expect(formatYards(2)).toBe('2 yds');
    expect(formatYards(147.4)).toBe('147 yds');
  });
});

describe('formatFeet', () => {
  it('returns em-dash for null', () => {
    expect(formatFeet(null)).toBe('—');
  });

  it('handles sub-foot values', () => {
    expect(formatFeet(0.4)).toBe('<1 ft');
  });

  it('rounds (no pluralization distinction for feet)', () => {
    expect(formatFeet(1)).toBe('1 ft');
    expect(formatFeet(6.4)).toBe('6 ft');
    expect(formatFeet(18.6)).toBe('19 ft');
  });
});

describe('scoreToParLabel', () => {
  it('returns null when score or par is missing', () => {
    expect(scoreToParLabel(null, 4)).toBe(null);
    expect(scoreToParLabel(4, undefined)).toBe(null);
  });

  it('maps standard golf scores', () => {
    expect(scoreToParLabel(4, 4)).toBe('E');
    expect(scoreToParLabel(3, 4)).toBe('Birdie');
    expect(scoreToParLabel(2, 4)).toBe('Eagle');
    expect(scoreToParLabel(1, 4)).toBe('Albatross');
    expect(scoreToParLabel(5, 4)).toBe('Bogey');
    expect(scoreToParLabel(6, 4)).toBe('Double');
    expect(scoreToParLabel(7, 4)).toBe('Triple');
  });

  it('falls through to numeric +N for larger scores', () => {
    expect(scoreToParLabel(8, 4)).toBe('+4');
  });
});

// ---------------------------------------------------------------------------
// greenEntryLateralRatio — ADDITIVE helper (2026-07-22 redesign): lets the
// putting-zoom side panel orient its ball position to match where the
// approach actually landed in the corridor track. Pure read of already-
// plotted data — must never mutate or influence plotHole's own output.
// ---------------------------------------------------------------------------

describe('greenEntryLateralRatio', () => {
  it('returns 0 when there is no green-inset-eligible shot', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
    ];
    const plot = plotHole({ shots, par: 4 });
    expect(greenEntryLateralRatio(plot.shots, plot.greenInset)).toBe(0);
  });

  it('is positive when the entry shot landed right of the corridor centerline', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150, miss_direction: 'right' },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 20, miss_direction: 'right' },
    ];
    const plot = plotHole({ shots, par: 4 });
    const entryCorridorShot = plot.shots[plot.greenInset.shots[0]!.shot_index]!;
    expect(entryCorridorShot.x).toBeGreaterThan(VB.width / 2);
    expect(greenEntryLateralRatio(plot.shots, plot.greenInset)).toBeGreaterThan(0);
  });

  it('is negative when the entry shot landed left of the corridor centerline', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150, miss_direction: 'left' },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 20, miss_direction: 'left' },
    ];
    const plot = plotHole({ shots, par: 4 });
    expect(greenEntryLateralRatio(plot.shots, plot.greenInset)).toBeLessThan(0);
  });

  it('is always clamped to [-1, 1] regardless of how wide the corridor drift is', () => {
    // A long run of same-direction penalty misses amplifies (STREAK_AMPLIFY
    // × PENALTY_WIDEN) — this is exactly the scenario that could otherwise
    // push the raw ratio outside the unit range.
    const shots: ShotInput[] = Array.from({ length: 6 }, (_, i) => ({
      shot_number: i + 1,
      lie_after: i === 5 ? 'green' : 'rough',
      distance_to_hole_after: i === 5 ? 15 : 300 - i * 40,
      miss_direction: 'right',
      is_penalty: true,
    }));
    const plot = plotHole({ shots, par: 5 });
    const ratio = greenEntryLateralRatio(plot.shots, plot.greenInset);
    expect(ratio).toBeGreaterThanOrEqual(-1);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  it('does not mutate plotHole output — plot.shots[i].x is identical before and after the call', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150, miss_direction: 'right' },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 20 },
    ];
    const plot = plotHole({ shots, par: 4 });
    const before = plot.shots.map((s) => s.x);
    greenEntryLateralRatio(plot.shots, plot.greenInset);
    expect(plot.shots.map((s) => s.x)).toEqual(before);
  });
});
