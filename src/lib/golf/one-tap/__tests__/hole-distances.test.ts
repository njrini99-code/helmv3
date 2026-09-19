import { describe, expect, it } from 'vitest';
import type { LocalFeature } from '@/lib/golf/course-geometry/types';
import { greenDistances, metresToFeet, metresToYards, ringCentroid, PUTT_SUPPRESSION, greenReadout, shortPuttSuppressed } from '../hole-distances';

// SYNTHETIC TEST VECTOR: a 20 m square green with its front edge on y = 0.
const green: LocalFeature = { id: 'g', kind: 'green', type: 'Polygon', reviewed: true, parts: [[[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]]] };
describe('one-tap green distances', () => {
  it('measures front, centre and back where the approach axis crosses the boundary', () => {
    const d = greenDistances([10, -100], green, [[4, 0], [0, 4]], .5)!;
    expect(d.centreENU).toEqual([10, 10]);
    expect(d.frontM).toBeCloseTo(100, 9);
    expect(d.centreM).toBeCloseTo(110, 9);
    expect(d.backM).toBeCloseTo(120, 9);
    expect(d.sigmaM).toBeCloseTo(Math.sqrt(4 + .25), 9);
    expect(d.basis).toBe('approach_axis_boundary_intersection');
  });
  it('interpolates on the boundary rather than picking a vertex on a diagonal approach', () => {
    const d = greenDistances([-40, -40], green, [[1, 0], [0, 1]], 0)!;
    expect(d.centreM).toBeCloseTo(Math.hypot(50, 50), 9);
    // The axis meets the square's near corner region on the x = 0 / y = 0 edges at the origin and the far edges at (20, 20).
    expect(d.frontM).toBeCloseTo(Math.hypot(40, 40), 6);
    expect(d.backM).toBeCloseTo(Math.hypot(60, 60), 6);
  });
  it('reads F/C/B on the approach and ON GREEN with the centre only on the green, suppressing a short putt (§15–16)', () => {
    const distances = { frontM: 12, centreM: 20, backM: 31, centreENU: [0, 0] as const, sigmaM: 3, basis: 'approach_axis_boundary_intersection' as const };
    expect(greenReadout(distances, false)).toMatchObject({ mode: 'approach', frontM: 12, centreM: 20, backM: 31, centreDisplay: 'exact', pin: 'unspecified' });
    expect(greenReadout(distances, true)).toMatchObject({ mode: 'on_green', frontM: null, centreM: 20, backM: null, centreDisplay: 'exact', sigmaM: 3 });
    // 6 m to the centre with σ 3 m: 6 < 7.5, the number would be fake precision.
    expect(greenReadout({ ...distances, centreM: 6 }, true)).toMatchObject({ mode: 'on_green', centreDisplay: 'suppressed' });
    expect(greenReadout({ ...distances, centreM: 6 }, false).centreDisplay).toBe('exact');
    expect(shortPuttSuppressed(3, 1)).toBe(true);
    expect(shortPuttSuppressed(PUTT_SUPPRESSION.minM, 1)).toBe(false);
    expect(shortPuttSuppressed(7, 3)).toBe(true);
    expect(shortPuttSuppressed(7.5, 3)).toBe(false);
  });
  it('returns null on a degenerate approach and converts units', () => {
    expect(greenDistances([10, 10], green, [[1, 0], [0, 1]], 0)).toBeNull();
    expect(ringCentroid([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]])).toEqual([1, 1]);
    expect(metresToYards(100)).toBeCloseTo(109.36, 2);
    expect(metresToFeet(1)).toBeCloseTo(3.2808, 4);
  });
});
