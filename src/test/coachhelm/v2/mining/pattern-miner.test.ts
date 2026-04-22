import { describe, it, expect } from 'vitest';
import { computeConvictionSafe } from '@/lib/coachhelm/v2/mining/pattern-miner';

describe('computeConvictionSafe (LIVE-16)', () => {
  it('returns the closed-form conviction when confidence < 1', () => {
    // (1 - 0.5) * 0.5 / (1 - 0.5) === 0.5
    expect(computeConvictionSafe(0.5, 0.5)).toBeCloseTo(0.5);
    // (1 - 0.2) * 0.8 / (1 - 0.8) === 3.2
    expect(computeConvictionSafe(0.8, 0.2)).toBeCloseTo(3.2);
  });

  it('returns Infinity when confidence == 1 and support < 1 (pure rule)', () => {
    expect(computeConvictionSafe(1, 0.5)).toBe(Infinity);
  });

  it('returns null when confidence == 1 and support == 1 (undefined / trivial rule)', () => {
    expect(computeConvictionSafe(1, 1)).toBeNull();
  });

  it('returns null when either input is NaN or non-finite', () => {
    expect(computeConvictionSafe(NaN, 0.3)).toBeNull();
    expect(computeConvictionSafe(0.3, NaN)).toBeNull();
    expect(computeConvictionSafe(Infinity, 0.3)).toBeNull();
  });
});
