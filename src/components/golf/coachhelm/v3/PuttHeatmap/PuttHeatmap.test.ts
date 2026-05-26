/**
 * PuttHeatmap aggregation tests.
 *
 * Component is mostly SVG paint; logic lives in geometry.ts. These
 * pin the contract: distance buckets, miss-bias detection, dot
 * placement bounds.
 */

import { describe, it, expect } from 'vitest';
import {
  buildPuttHeatmap,
  distanceToRadius,
  formatPct,
  HOLE_R,
  MAX_R,
  VB,
} from './geometry';
import type { PuttRecord } from './types';

describe('buildPuttHeatmap — counts', () => {
  it('returns zeros for empty input', () => {
    const d = buildPuttHeatmap([]);
    expect(d.total_putts).toBe(0);
    expect(d.total_made).toBe(0);
    expect(d.overall_make_pct).toBe(null);
    expect(d.plotted).toEqual([]);
  });

  it('counts total and made putts', () => {
    const putts: PuttRecord[] = [
      { distance_feet: 3, made: true },
      { distance_feet: 4, made: true },
      { distance_feet: 8, made: false, miss_direction: 'left' },
      { distance_feet: 12, made: false, miss_direction: 'right' },
    ];
    const d = buildPuttHeatmap(putts);
    expect(d.total_putts).toBe(4);
    expect(d.total_made).toBe(2);
    expect(d.overall_make_pct).toBeCloseTo(0.5);
  });
});

describe('buildPuttHeatmap — buckets', () => {
  it('partitions putts into the six canonical buckets', () => {
    const putts: PuttRecord[] = [
      { distance_feet: 2, made: true },
      { distance_feet: 4, made: true },
      { distance_feet: 7, made: false, miss_direction: 'right' },
      { distance_feet: 12, made: false, miss_direction: 'right' },
      { distance_feet: 20, made: false, miss_direction: 'long' },
      { distance_feet: 35, made: false, miss_direction: 'short' },
    ];
    const d = buildPuttHeatmap(putts);
    const byId = Object.fromEntries(d.buckets.map((b) => [b.id, b]));
    expect(byId['0_3']!.attempts).toBe(1);
    expect(byId['3_5']!.attempts).toBe(1);
    expect(byId['5_10']!.attempts).toBe(1);
    expect(byId['10_15']!.attempts).toBe(1);
    expect(byId['15_25']!.attempts).toBe(1);
    expect(byId['25_plus']!.attempts).toBe(1);
  });

  it('treats bucket boundaries as left-inclusive, right-exclusive', () => {
    // 5 → 5_10 not 3_5; 10 → 10_15 not 5_10
    const putts: PuttRecord[] = [
      { distance_feet: 5, made: true },
      { distance_feet: 10, made: false, miss_direction: 'left' },
    ];
    const d = buildPuttHeatmap(putts);
    const byId = Object.fromEntries(d.buckets.map((b) => [b.id, b]));
    expect(byId['5_10']!.attempts).toBe(1);
    expect(byId['10_15']!.attempts).toBe(1);
    expect(byId['3_5']!.attempts).toBe(0);
  });

  it('computes per-bucket make percentages', () => {
    const putts: PuttRecord[] = [
      { distance_feet: 6, made: true },
      { distance_feet: 6, made: true },
      { distance_feet: 8, made: false, miss_direction: 'left' },
      { distance_feet: 9, made: false, miss_direction: 'left' },
    ];
    const d = buildPuttHeatmap(putts);
    const fiveTen = d.buckets.find((b) => b.id === '5_10')!;
    expect(fiveTen.attempts).toBe(4);
    expect(fiveTen.made).toBe(2);
    expect(fiveTen.make_pct).toBeCloseTo(0.5);
  });

  it('returns make_pct of null for empty buckets', () => {
    const d = buildPuttHeatmap([{ distance_feet: 4, made: true }]);
    const tenFifteen = d.buckets.find((b) => b.id === '10_15')!;
    expect(tenFifteen.attempts).toBe(0);
    expect(tenFifteen.make_pct).toBe(null);
  });
});

describe('buildPuttHeatmap — miss bias', () => {
  it('detects a dominant miss side when one is most common', () => {
    const putts: PuttRecord[] = [
      { distance_feet: 8, made: false, miss_direction: 'left' },
      { distance_feet: 9, made: false, miss_direction: 'left' },
      { distance_feet: 10, made: false, miss_direction: 'left' },
      { distance_feet: 12, made: false, miss_direction: 'right' },
    ];
    const d = buildPuttHeatmap(putts);
    expect(d.miss_bias.dominant).toBe('left');
    expect(d.miss_bias.left).toBe(3);
    expect(d.miss_bias.right).toBe(1);
    expect(d.miss_bias.share).toBeCloseTo(0.75);
  });

  it('normalizes free-form direction strings ("Short left" → short or left)', () => {
    const putts: PuttRecord[] = [
      { distance_feet: 10, made: false, miss_direction: 'long' },
      { distance_feet: 10, made: false, miss_direction: 'Past hole' },
      { distance_feet: 10, made: false, miss_direction: 'LEFT' },
    ];
    const d = buildPuttHeatmap(putts);
    expect(d.miss_bias.long).toBe(2);
    expect(d.miss_bias.left).toBe(1);
  });

  it('reports zero bias for an empty miss set', () => {
    const d = buildPuttHeatmap([
      { distance_feet: 5, made: true },
      { distance_feet: 6, made: true },
    ]);
    expect(d.miss_bias.dominant).toBe(null);
    expect(d.miss_bias.total).toBe(0);
    expect(d.miss_bias.share).toBe(0);
  });
});

describe('distanceToRadius', () => {
  it('returns HOLE_R for distance 0', () => {
    expect(distanceToRadius(0)).toBeCloseTo(HOLE_R);
  });

  it('is monotonically non-decreasing', () => {
    let prev = distanceToRadius(0);
    for (const d of [1, 3, 5, 10, 15, 25, 40, 80]) {
      const r = distanceToRadius(d);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it('clamps to MAX_R at the outer edge', () => {
    expect(distanceToRadius(40)).toBeCloseTo(MAX_R);
    // Beyond 40 → still clamps
    expect(distanceToRadius(80)).toBeCloseTo(MAX_R);
  });
});

describe('plotted dots — bounds', () => {
  it('every dot sits inside the viewBox and outside the cup', () => {
    const putts: PuttRecord[] = Array.from({ length: 30 }, (_, i) => ({
      distance_feet: (i + 1) * 1.5,
      made: i % 3 === 0,
      miss_direction: (['left', 'right', 'long', 'short'] as const)[i % 4],
    }));
    const d = buildPuttHeatmap(putts);
    for (const p of d.plotted) {
      const dx = p.x - VB.cx;
      const dy = p.y - VB.cy;
      const r = Math.hypot(dx, dy);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(VB.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(VB.height);
      // Outside cup, inside max ring
      expect(r).toBeGreaterThan(HOLE_R);
      expect(r).toBeLessThan(MAX_R);
    }
  });

  it('anchors missed-left dots to the left half (x < center)', () => {
    const putts: PuttRecord[] = Array.from({ length: 8 }, () => ({
      distance_feet: 10,
      made: false,
      miss_direction: 'left' as const,
    }));
    const d = buildPuttHeatmap(putts);
    for (const p of d.plotted) {
      expect(p.x).toBeLessThan(VB.cx);
    }
  });

  it('anchors missed-right dots to the right half (x > center)', () => {
    const putts: PuttRecord[] = Array.from({ length: 8 }, () => ({
      distance_feet: 10,
      made: false,
      miss_direction: 'right' as const,
    }));
    const d = buildPuttHeatmap(putts);
    for (const p of d.plotted) {
      expect(p.x).toBeGreaterThan(VB.cx);
    }
  });
});

describe('formatPct', () => {
  it('returns em-dash for null', () => {
    expect(formatPct(null)).toBe('—');
  });
  it('rounds and adds percent sign', () => {
    expect(formatPct(0)).toBe('0%');
    expect(formatPct(0.5)).toBe('50%');
    expect(formatPct(0.666)).toBe('67%');
    expect(formatPct(1)).toBe('100%');
  });
});
