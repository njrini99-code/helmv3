// =============================================================================
// calculateTrend — sign contract.
//
// extractTemporalFeatures queries golf_rounds with
// `.order('round_date', { ascending: false })`, so every array handed to
// calculateTrend is NEWEST-FIRST. The regression uses the array index as its
// time axis, so it must reverse first. Before that reversal an improving
// player produced a POSITIVE slope, which the function's own contract labels
// "declining".
// =============================================================================

import { describe, it, expect } from 'vitest';

import { calculateTrend } from '../temporal';

/** Build a newest-first round list from chronological (oldest-first) scores. */
function newestFirst(chronologicalScores: number[]) {
  return chronologicalScores
    .map((score, i) => ({
      score_to_par: score,
      round_date: `2026-05-${String(i + 1).padStart(2, '0')}`,
    }))
    .reverse();
}

describe('calculateTrend', () => {
  it('returns a NEGATIVE slope for a strictly improving player', () => {
    // Chronologically 8 → 6 → 4 → 2 → 0: scores falling, i.e. improving.
    const slope = calculateTrend(newestFirst([8, 6, 4, 2, 0]));
    expect(slope).toBeLessThan(0);
    expect(slope).toBeCloseTo(-2, 5);
  });

  it('returns a POSITIVE slope for a strictly declining player', () => {
    const slope = calculateTrend(newestFirst([0, 2, 4, 6, 8]));
    expect(slope).toBeGreaterThan(0);
    expect(slope).toBeCloseTo(2, 5);
  });

  it('returns 0 for a flat sequence and for fewer than two rounds', () => {
    expect(calculateTrend(newestFirst([3, 3, 3, 3]))).toBeCloseTo(0, 5);
    expect(calculateTrend(newestFirst([5]))).toBe(0);
    expect(calculateTrend([])).toBe(0);
  });

  it('clamps the slope to [-3, 3]', () => {
    expect(calculateTrend(newestFirst([40, 20, 0]))).toBe(-3);
    expect(calculateTrend(newestFirst([0, 20, 40]))).toBe(3);
  });

  it('treats a null score_to_par as 0 (unchanged behaviour)', () => {
    const rounds = [
      { score_to_par: null, round_date: '2026-05-02' },
      { score_to_par: 2, round_date: '2026-05-01' },
    ];
    // Chronologically 2 → 0: improving.
    expect(calculateTrend(rounds)).toBeCloseTo(-2, 5);
  });
});
