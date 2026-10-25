/**
 * @vitest-environment node
 *
 * scoring_trend stores its change's standard error (Welch, from each window's own spread), so Clubhouse's Momentum can
 * say Improving or Regressing only past its noise (review of #2361, should-fix 1).
 */
import { describe, it, expect } from 'vitest';
import scoringTrend from '@/lib/coachhelm/v3/genome/dimensions/scoring-trend';
import type { GenomeContext } from '@/lib/coachhelm/v3/genome/types';

const day = (ago: number) => new Date(Date.now() - ago * 86400_000).toISOString().slice(0, 10);
const ctx = (recent: number[], earlier: number[]) =>
  ({
    rounds: [
      ...recent.map((s) => ({ round_date: day(2), score_to_par: s })),
      ...earlier.map((s) => ({ round_date: day(60), score_to_par: s })),
    ],
  }) as unknown as GenomeContext;

describe('scoring_trend standard error', () => {
  it('is the Welch error of the two windows', () => {
    const r = scoringTrend.compute(ctx([0, 2, 4], [4, 6, 8]));
    // Each window: variance 4 over 3 rounds, so sqrt(4/3 + 4/3).
    expect(r.value).toBe(-2);
    expect(r.se).toBeCloseTo(Math.sqrt(8 / 3), 3);
  });

  it('is zero when every round in both windows is the same score', () => {
    expect(scoringTrend.compute(ctx([1, 1, 1], [1, 1, 1])).se).toBe(0);
  });

  it('is absent when a window is too small to compute', () => {
    expect(scoringTrend.compute(ctx([1, 1], [1, 1, 1])).se).toBeUndefined();
  });
});
