/**
 * Audit row 42: the "N% of misses" share divided by EVERY miss, but about a
 * quarter of logged misses carry no direction, so the share was understated.
 * The share is now over misses WITH a recorded direction, and that n is
 * exposed so the copy can state it.
 */
import { describe, it, expect } from 'vitest';
import { buildPuttHeatmap } from './geometry';
import { PUTT_BUCKETS } from './types';
import { PUTT_DISTANCE_BUCKETS } from '@/lib/golf/putt-distance-buckets';

describe('buildPuttHeatmap — miss share over directed misses', () => {
  it('divides the dominant count by misses that have a direction, not all misses', () => {
    const d = buildPuttHeatmap([
      { distance_feet: 8, made: false, miss_direction: 'left' },
      { distance_feet: 9, made: false, miss_direction: 'left' },
      { distance_feet: 10, made: false, miss_direction: 'right' },
      { distance_feet: 12, made: false, miss_direction: null },
      { distance_feet: 14, made: false },
    ]);
    expect(d.miss_bias.total).toBe(5);
    expect(d.miss_bias.directed).toBe(3);
    expect(d.miss_bias.dominant).toBe('left');
    // 2 of 3 directed misses, not 2 of 5.
    expect(d.miss_bias.share).toBeCloseTo(2 / 3);
  });

  it('reports no dominant side and a zero share when no miss has a direction', () => {
    const d = buildPuttHeatmap([
      { distance_feet: 8, made: false },
      { distance_feet: 9, made: false, miss_direction: 'unknown' },
    ]);
    expect(d.miss_bias.directed).toBe(0);
    expect(d.miss_bias.dominant).toBeNull();
    expect(d.miss_bias.share).toBe(0);
  });
});

describe('PuttHeatmap buckets', () => {
  it('uses the one shared set of putt distance edges', () => {
    expect(PUTT_BUCKETS).toBe(PUTT_DISTANCE_BUCKETS);
  });
});
