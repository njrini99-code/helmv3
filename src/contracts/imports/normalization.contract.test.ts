import { describe, expect, it } from 'vitest';

import {
  getApproachDistanceBucket,
  getPuttDistanceBucket,
  isGreenHit,
  normalizePuttFeet,
  normalizeRoundType,
  normalizeShotType,
  normalizeToFeet,
  normalizeToYards,
  safeAverage,
  safePercent,
} from '@/lib/utils/golf-stats-calculator-shots';

describe('Golf import and normalization contracts', () => {
  it('TRUST-003 keeps unit normalization explicit and null-honest', () => {
    expect(normalizeToYards(30, 'feet')).toBe(10);
    expect(normalizeToYards(null, 'feet')).toBe(0);
    expect(normalizeToFeet(10, 'yards')).toBe(30);
    expect(normalizePuttFeet(390)).toBe(120);
    expect(safePercent(0, 0)).toBeNull();
    expect(safeAverage(0, 0)).toBeNull();
  });

  it('normalizes provider/import vocabulary before downstream stat contracts read it', () => {
    expect(normalizeShotType('putt')).toBe('putting');
    expect(normalizeShotType('drive')).toBe('tee');
    expect(normalizeShotType('chip')).toBe('around_green');
    expect(normalizeShotType('iron')).toBe('approach');
    expect(normalizeRoundType('qualifying')).toBe('qualifier');
    expect(isGreenHit('gir')).toBe(true);
    expect(isGreenHit('hole')).toBe(true);
  });

  it('keeps distance buckets stable for product/UI rollups', () => {
    expect(getPuttDistanceBucket(3)).toBe('0_3');
    expect(getPuttDistanceBucket(35.1)).toBe('35_plus');
    expect(getApproachDistanceBucket(49)).toBe('');
    expect(getApproachDistanceBucket(50)).toBe('30_75');
    expect(getApproachDistanceBucket(226)).toBe('225_plus');
  });
});
