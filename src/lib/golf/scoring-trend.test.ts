import { describe, it, expect } from 'vitest';
import { computeScoringTrendFromRounds, SCORE_TREND_THRESHOLD } from './scoring-trend';

function round(total_score: number | null, holes_played: number | null = 18) {
  return { total_score, holes_played };
}

describe('computeScoringTrendFromRounds', () => {
  it('is improving when recent scores are meaningfully lower (18-hole rounds)', () => {
    const rounds = [
      round(70), round(71), round(70), round(72), round(71), // recent avg 70.8
      round(76), round(75), round(77), round(76), round(75), // previous avg 75.8
    ];
    const result = computeScoringTrendFromRounds(rounds);
    expect(result.trend).toBe('improving');
    expect(result.delta).toBeLessThan(-SCORE_TREND_THRESHOLD);
  });

  it('is declining when recent scores are meaningfully higher', () => {
    const rounds = [
      round(80), round(81), round(79), round(80), round(81),
      round(72), round(73), round(72), round(71), round(73),
    ];
    const result = computeScoringTrendFromRounds(rounds);
    expect(result.trend).toBe('declining');
  });

  it('normalizes a 9-hole round to an 18-hole-equivalent score', () => {
    // A 9-hole round of 36 normalizes to 72 (36 * 18/9), not compared raw.
    const rounds = [
      round(72), round(36, 9), round(72), round(72), round(72), // recent avg ~72
      round(80), round(80), round(80), round(80), round(80), // previous avg 80
    ];
    const result = computeScoringTrendFromRounds(rounds);
    expect(result.trend).toBe('improving');
  });

  it('skips rounds with a null score rather than coercing to 0', () => {
    const rounds = [
      round(null), round(70), round(70), round(70), round(70), round(70),
      round(80), round(80), round(80),
    ];
    const result = computeScoringTrendFromRounds(rounds);
    // 5 recent (70s), 3 previous (80s) — clears the ≥3-previous floor.
    expect(result.trend).toBe('improving');
  });

  it('is stable with fewer than 3 previous rounds (insufficient history), hasSignal false', () => {
    const rounds = [round(70), round(70), round(70), round(70), round(70), round(90), round(90)];
    const result = computeScoringTrendFromRounds(rounds);
    expect(result.trend).toBe('stable');
    expect(result.delta).toBe(0);
    expect(result.hasSignal).toBe(false);
  });

  it('is stable with no rounds at all', () => {
    expect(computeScoringTrendFromRounds([])).toEqual({ trend: 'stable', delta: 0, hasSignal: false });
  });

  it('is stable when the move is under SCORE_TREND_THRESHOLD', () => {
    const rounds = [
      round(75), round(75), round(75), round(75), round(75),
      round(75.1), round(75.1), round(75.1), round(75.1), round(75.1),
    ];
    const result = computeScoringTrendFromRounds(rounds);
    expect(result.trend).toBe('stable');
  });
});
