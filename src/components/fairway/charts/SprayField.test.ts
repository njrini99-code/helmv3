/**
 * ============================================================================
 * SprayField — pure geometry/scale helper tests
 * ----------------------------------------------------------------------------
 * Covers the family-aware bounds/domain math, the hand-rolled linear scale,
 * the "nice" distance-ring step selection, the 5-cell sector cross geometry
 * (the 4 diagonal corners must stay uncovered), the ramp-opacity mapping, the
 * outcome→color lookup, and the aria-summary builder's honesty contract.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import {
  CARDINAL_SPRAY_SECTORS,
  buildSprayAriaSummary,
  computeDistanceRingStep,
  computeDistanceRings,
  computeForwardRowDomain,
  computeSectorWedgeRects,
  computeSprayBounds,
  makeLinearScale,
  sectorRampOpacity,
  sprayForwardDomain,
  sprayOutcomeColor,
} from './SprayField';
import type { SprayChartShotGroup } from '@/app/golf/actions/stats-data-types';

describe('computeSprayBounds', () => {
  it('floors driving bounds at a sensible minimum so a tiny/empty sample never collapses the field', () => {
    const bounds = computeSprayBounds([], 'driving');
    expect(bounds.lateralMax).toBeGreaterThan(0);
    expect(bounds.forwardMax).toBeGreaterThan(0);
  });

  it('pads beyond the widest real point so the outermost dot never sits on the plot edge', () => {
    const points = [{ x: 40, y: 220 }, { x: -10, y: 180 }];
    const bounds = computeSprayBounds(points, 'driving');
    expect(bounds.lateralMax).toBeGreaterThan(40);
    expect(bounds.forwardMax).toBeGreaterThan(220);
  });

  it('ignores non-finite coordinates rather than letting them blow up the domain', () => {
    const points = [{ x: Number.NaN, y: 100 }, { x: 20, y: Number.POSITIVE_INFINITY }];
    const bounds = computeSprayBounds(points, 'approach');
    expect(Number.isFinite(bounds.lateralMax)).toBe(true);
    expect(Number.isFinite(bounds.forwardMax)).toBe(true);
  });
});

describe('sprayForwardDomain', () => {
  it('driving: origin (tee) anchors the domain floor at 0 — forward distance is never negative', () => {
    expect(sprayForwardDomain('driving', 250)).toEqual([0, 250]);
  });

  it('approach: symmetric around 0 (the pin) — short misses are negative, long misses positive', () => {
    expect(sprayForwardDomain('approach', 40)).toEqual([-40, 40]);
  });
});

describe('makeLinearScale', () => {
  it('maps the domain endpoints to the exact range endpoints', () => {
    const scale = makeLinearScale([0, 100], [10, 210]);
    expect(scale(0)).toBe(10);
    expect(scale(100)).toBe(210);
    expect(scale(50)).toBe(110);
  });

  it('handles an inverted range (used for the y-axis: larger data value → smaller pixel y)', () => {
    const scale = makeLinearScale([0, 200], [300, 20]);
    expect(scale(0)).toBe(300);
    expect(scale(200)).toBe(20);
  });

  it('a zero-span domain never divides by zero — collapses to the range midpoint', () => {
    const scale = makeLinearScale([5, 5], [0, 100]);
    expect(scale(5)).toBe(50);
    expect(Number.isFinite(scale(5))).toBe(true);
  });
});

describe('computeDistanceRingStep / computeDistanceRings', () => {
  it('picks a step yielding roughly the target ring count, not one ring per arbitrary unit', () => {
    const step = computeDistanceRingStep(100, 4);
    expect(step).toBeGreaterThan(0);
    const rings = computeDistanceRings(100, 4);
    expect(rings.length).toBeGreaterThanOrEqual(3);
    expect(rings.length).toBeLessThanOrEqual(6);
  });

  it('every ring value stays within (0, maxValue]', () => {
    const rings = computeDistanceRings(180);
    for (const r of rings) {
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(180 + 1);
    }
  });

  it('a non-positive or non-finite max never produces rings (honest empty)', () => {
    expect(computeDistanceRings(0)).toEqual([]);
    expect(computeDistanceRings(-5)).toEqual([]);
    expect(computeDistanceRings(Number.NaN)).toEqual([]);
  });
});

describe('computeForwardRowDomain', () => {
  it('approach: always the full symmetric render axis, regardless of the points', () => {
    expect(computeForwardRowDomain([{ y: 5 }, { y: -3 }], 'approach', 40)).toEqual([-40, 40]);
    expect(computeForwardRowDomain([], 'approach', 40)).toEqual([-40, 40]);
  });

  it('driving: the actual observed [min, max] of the points\' y values, NOT [0, forwardMax]', () => {
    expect(computeForwardRowDomain([{ y: 164 }, { y: 240 }, { y: 294 }], 'driving', 400)).toEqual([164, 294]);
  });

  it('driving: falls back to [0, forwardMax] when there are no finite y values', () => {
    expect(computeForwardRowDomain([], 'driving', 300)).toEqual([0, 300]);
    expect(computeForwardRowDomain([{ y: Number.NaN }], 'driving', 300)).toEqual([0, 300]);
  });
});

describe('computeSectorWedgeRects — the 5-cell cross', () => {
  const plot = { left: 20, right: 300, top: 20, bottom: 300 };
  // Multiple, distinct forward values (not a single degenerate point) so the
  // row domain has real span to divide into thirds.
  const drivingPoints = [{ x: 30, y: 164 }, { x: -10, y: 240 }, { x: 5, y: 294 }];

  it('driving: the 5 cardinal wedges all have positive area and stay inside the plot box', () => {
    const bounds = computeSprayBounds(drivingPoints, 'driving');
    const rowDomain = computeForwardRowDomain(drivingPoints, 'driving', bounds.forwardMax);
    const rects = computeSectorWedgeRects(bounds, 'driving', plot, rowDomain);
    for (const sector of CARDINAL_SPRAY_SECTORS) {
      const r = rects[sector];
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
      expect(r.x).toBeGreaterThanOrEqual(plot.left - 0.01);
      expect(r.x + r.width).toBeLessThanOrEqual(plot.right + 0.01);
      expect(r.y).toBeGreaterThanOrEqual(plot.top - 0.01);
      expect(r.y + r.height).toBeLessThanOrEqual(plot.bottom + 0.01);
    }
  });

  it('the center/left/right row shares the same y-band (middle third)', () => {
    const bounds = computeSprayBounds(drivingPoints, 'driving');
    const rowDomain = computeForwardRowDomain(drivingPoints, 'driving', bounds.forwardMax);
    const rects = computeSectorWedgeRects(bounds, 'driving', plot, rowDomain);
    expect(rects.left.y).toBeCloseTo(rects.center.y, 5);
    expect(rects.right.y).toBeCloseTo(rects.center.y, 5);
    expect(rects.left.height).toBeCloseTo(rects.center.height, 5);
    expect(rects.right.height).toBeCloseTo(rects.center.height, 5);
  });

  it('long sits above (smaller pixel y) short — forward reads up regardless of family', () => {
    const points = [{ x: 10, y: 20 }];
    const bounds = computeSprayBounds(points, 'approach');
    const rowDomain = computeForwardRowDomain(points, 'approach', bounds.forwardMax);
    const rects = computeSectorWedgeRects(bounds, 'approach', plot, rowDomain);
    expect(rects.long.y + rects.long.height).toBeLessThanOrEqual(rects.short.y + 0.01);
  });

  it('left/right wedges never overlap the center column horizontally', () => {
    const points = [{ x: 15, y: 150 }];
    const bounds = computeSprayBounds(points, 'driving');
    const rowDomain = computeForwardRowDomain(points, 'driving', bounds.forwardMax);
    const rects = computeSectorWedgeRects(bounds, 'driving', plot, rowDomain);
    expect(rects.left.x + rects.left.width).toBeLessThanOrEqual(rects.center.x + 0.01);
    expect(rects.right.x).toBeGreaterThanOrEqual(rects.center.x + rects.center.width - 0.01);
  });

  it('driving: a short/center/long point set plots each dot inside ITS OWN sector wedge row (the decorrelation bug)', () => {
    // Mirrors the reported defect: a short-sector 220yd drive (y=180.4) used
    // to plot inside the "center" wedge, and a center-sector 240yd drive
    // (y=240) used to plot inside the "long" wedge, because the row
    // boundaries were thirds of the FULL [0, forwardMax] axis instead of the
    // actual observed point span.
    const points = [
      { x: -20, y: 164 }, // short-sector 200yd drive (200 * 0.82)
      { x: 0, y: 240 }, // center-sector 240yd drive (240 * 1)
      { x: 25, y: 294 }, // long-sector 280yd drive (280 * 1.05)
    ];
    const bounds = computeSprayBounds(points, 'driving');
    const rowDomain = computeForwardRowDomain(points, 'driving', bounds.forwardMax);
    const rects = computeSectorWedgeRects(bounds, 'driving', plot, rowDomain);
    const [fD0, fD1] = sprayForwardDomain('driving', bounds.forwardMax);
    const yScale = makeLinearScale([fD0, fD1], [plot.bottom, plot.top]);

    const withinRow = (rect: { y: number; height: number }, py: number) =>
      py >= rect.y - 0.01 && py <= rect.y + rect.height + 0.01;

    expect(withinRow(rects.short, yScale(164))).toBe(true);
    expect(withinRow(rects.center, yScale(240))).toBe(true);
    expect(withinRow(rects.long, yScale(294))).toBe(true);
  });
});

describe('sectorRampOpacity', () => {
  it('null/undefined/zero/negative percentage → fully transparent (no wedge tint)', () => {
    expect(sectorRampOpacity(null)).toBe(0);
    expect(sectorRampOpacity(undefined)).toBe(0);
    expect(sectorRampOpacity(0)).toBe(0);
    expect(sectorRampOpacity(-5)).toBe(0);
  });

  it('is monotonically increasing in percentage', () => {
    const low = sectorRampOpacity(10);
    const mid = sectorRampOpacity(50);
    const high = sectorRampOpacity(100);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it('clamps a percentage above 100 to the same opacity as exactly 100', () => {
    expect(sectorRampOpacity(150)).toBe(sectorRampOpacity(100));
  });
});

describe('sprayOutcomeColor', () => {
  it('maps each outcome bucket to a distinct token (never the same color for penalty and playable)', () => {
    const playable = sprayOutcomeColor('playable');
    const trouble = sprayOutcomeColor('trouble');
    const penalty = sprayOutcomeColor('penalty');
    expect(new Set([playable, trouble, penalty]).size).toBe(3);
  });
});

function makeGroup(overrides: Partial<SprayChartShotGroup> = {}): SprayChartShotGroup {
  return {
    family: 'driving',
    totalShots: 0,
    plottedShots: 0,
    averageForwardDistance: null,
    averageRemainingDistance: null,
    playableCount: 0,
    troubleCount: 0,
    penaltyCount: 0,
    dominantSector: null,
    points: [],
    summaryBands: [],
    ...overrides,
  };
}

describe('buildSprayAriaSummary', () => {
  it('null group or zero points → an honest "no shots plotted yet" summary', () => {
    expect(buildSprayAriaSummary(null, 'driving')).toContain('No shots plotted yet');
    expect(buildSprayAriaSummary(makeGroup(), 'approach')).toContain('No shots plotted yet');
  });

  it('names the dominant sector and its share when one exists', () => {
    const group = makeGroup({
      dominantSector: 'center',
      points: [{ id: '1' } as never],
      summaryBands: [
        { sector: 'center', label: 'Center', count: 8, percentage: 80, avgForwardDistance: null, avgRemainingDistance: null },
      ],
    });
    const summary = buildSprayAriaSummary(group, 'driving');
    expect(summary).toContain('1 shot plotted');
    expect(summary).toContain('center');
    expect(summary).toContain('80%');
  });

  it('includes average forward/remaining distance only when present', () => {
    const group = makeGroup({
      points: [{ id: '1' } as never],
      averageForwardDistance: 245,
    });
    const summary = buildSprayAriaSummary(group, 'driving');
    expect(summary).toContain('245 yards');
    expect(summary).not.toContain('remaining');
  });
});
