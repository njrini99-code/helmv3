import { describe, it, expect } from 'vitest';
import { getExpectedStrokes } from '@/lib/golf/strokes-gained';
import { buildDefaultBaseline } from '../shot-level-sg';
import { buildStatsCacheSgBaseline } from '../stats-cache-baseline';

describe('buildStatsCacheSgBaseline (OD-12)', () => {
  const baseline = buildStatsCacheSgBaseline().strokesToHole;

  it('keeps every bucket key the shot-level engine looks up', () => {
    expect(Object.keys(baseline).sort()).toEqual(Object.keys(buildDefaultBaseline().strokesToHole).sort());
  });

  it('takes off-green buckets from the stats-cache table at the bucket midpoint', () => {
    expect(baseline['fairway_150-175']).toBeCloseTo(getExpectedStrokes('fairway', 162.5), 6);
    expect(baseline['rough_100-125']).toBeCloseTo(getExpectedStrokes('rough', 112.5), 6);
    expect(baseline['sand_0-25']).toBeCloseTo(getExpectedStrokes('sand', 12.5), 6);
  });

  it('converts green buckets from feet before looking them up', () => {
    expect(baseline['green_5-10']).toBeCloseTo(getExpectedStrokes('green', 7.5 / 3, true), 6);
  });

  it('leaves recovery on the shot-level default (no row in the stats-cache table)', () => {
    expect(baseline['recovery_150-175']).toBe(buildDefaultBaseline().strokesToHole['recovery_150-175']);
  });

  it('is monotone in distance for the fairway, like the table it comes from', () => {
    const keys = ['0-25', '50-75', '100-125', '150-175', '200-225', '250+'].map((b) => baseline[`fairway_${b}`]!);
    for (let i = 1; i < keys.length; i += 1) expect(keys[i]!).toBeGreaterThanOrEqual(keys[i - 1]!);
  });
});
