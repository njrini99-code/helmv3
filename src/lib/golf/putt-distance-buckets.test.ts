import { describe, it, expect } from 'vitest';
import {
  PUTT_DISTANCE_BUCKETS,
  puttBucketFor,
  puttStartFeet,
} from './putt-distance-buckets';

/**
 * Audit row 42: the round review page bucketed putts twice with different
 * edges (heatmap 0-3/3-5/5-10/10-15/15-25/25+ from distance_to_hole_before,
 * puttingBreakdown 0-5/5-15/15-25/25+ from putt_distance_feet). One field and
 * one set of edges now serve both.
 */
describe('PUTT_DISTANCE_BUCKETS', () => {
  it('is one contiguous, left-inclusive set of edges from 0 to open-ended', () => {
    expect(PUTT_DISTANCE_BUCKETS.map((b) => [b.min, b.max])).toEqual([
      [0, 3], [3, 5], [5, 10], [10, 15], [15, 25], [25, Infinity],
    ]);
    for (let i = 1; i < PUTT_DISTANCE_BUCKETS.length; i++) {
      expect(PUTT_DISTANCE_BUCKETS[i]!.min).toBe(PUTT_DISTANCE_BUCKETS[i - 1]!.max);
    }
  });
});

describe('puttStartFeet', () => {
  it('reads distance_to_hole_before as feet by default', () => {
    expect(puttStartFeet(12, null)).toBe(12);
    expect(puttStartFeet('7.5', 'feet')).toBe(7.5);
  });

  it('converts a yards-tagged start distance to feet', () => {
    expect(puttStartFeet(4, 'yards')).toBe(12);
  });

  it('returns null when there is no usable distance', () => {
    expect(puttStartFeet(null, null)).toBeNull();
    expect(puttStartFeet(undefined, 'feet')).toBeNull();
    expect(puttStartFeet('abc', null)).toBeNull();
    expect(puttStartFeet(-2, null)).toBeNull();
  });

  it('keeps a 0 ft distance (a tap-in is a real distance)', () => {
    expect(puttStartFeet(0, null)).toBe(0);
  });
});

describe('puttBucketFor', () => {
  it('buckets on left-inclusive edges', () => {
    expect(puttBucketFor(0).id).toBe('0_3');
    expect(puttBucketFor(3).id).toBe('3_5');
    expect(puttBucketFor(4.99).id).toBe('3_5');
    expect(puttBucketFor(5).id).toBe('5_10');
    expect(puttBucketFor(25).id).toBe('25_plus');
    expect(puttBucketFor(120).id).toBe('25_plus');
  });
});
