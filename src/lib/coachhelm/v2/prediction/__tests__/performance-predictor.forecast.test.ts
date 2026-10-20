import { describe, it, expect } from 'vitest';
import {
  forecastScoreToPar,
  naiveLast5,
  isIntervalCalibrated,
  isPatternApplicableTo,
  INTERVAL_CALIBRATION_MIN_N,
} from '../performance-predictor';

/**
 * Deterministic fixture shaped like the production population: a player whose
 * true level sits near +3, with right-skewed round-to-round noise (most rounds
 * within a few strokes, an occasional blow-up) and a few 9-hole rounds already
 * put on an 18-hole basis by the loader (x2, so noisier). Chronological.
 */
function fixtureSeason(): number[] {
  // LCG so the fixture is stable across runs without Math.random.
  let seed = 20260928;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const rounds: number[] = [];
  for (let i = 0; i < 80; i++) {
    // Symmetric core noise in [-3, 3] ...
    let s = 3 + Math.round((rand() - 0.5) * 6);
    // ... a blow-up round roughly one in eight ...
    if (rand() < 0.125) s += 6 + Math.round(rand() * 6);
    // ... and a 9-hole round (normalized x2) roughly one in ten.
    if (rand() < 0.1) s = 2 * Math.round(s / 2 + (rand() - 0.5) * 2);
    rounds.push(s);
  }
  return rounds;
}

/** Walk forward: forecast round i from the rounds before it (newest first). */
function walkForward(season: number[]) {
  const model: number[] = [];
  const naive: number[] = [];
  const signed: number[] = [];
  let within = 0;
  let graded = 0;
  for (let i = 5; i < season.length; i++) {
    const history = season.slice(0, i).reverse();
    const f = forecastScoreToPar(history);
    const n5 = naiveLast5(history);
    if (!f || n5 == null) continue;
    const actual = season[i]!;
    model.push(Math.abs(f.center - actual));
    naive.push(Math.abs(n5 - actual));
    signed.push(f.center - actual);
    graded += 1;
    if (actual >= f.low && actual <= f.high) within += 1;
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mae: mean(model), naiveMae: mean(naive), bias: mean(signed), coverage: within / graded };
}

describe('forecastScoreToPar — beats the naive last-5 baseline', () => {
  const r = walkForward(fixtureSeason());

  it('has MAE no worse than the mean of the last 5 rounds', () => {
    expect(r.mae).toBeLessThanOrEqual(r.naiveMae);
  });

  it('keeps the signed error small on right-skewed scoring', () => {
    expect(Math.abs(r.bias)).toBeLessThan(1);
  });

  it('the stated 80% band covers roughly 80% of outcomes', () => {
    expect(r.coverage).toBeGreaterThan(0.7);
    expect(r.coverage).toBeLessThan(0.95);
  });
});

describe('forecastScoreToPar — shape', () => {
  it('refuses fewer than 5 rounds', () => {
    expect(forecastScoreToPar([1, 2, 3, 4])).toBeNull();
  });

  it('centres on the median, so one blow-up does not move the estimate', () => {
    const f = forecastScoreToPar([2, 3, 4, 3, 2, 3, 30])!;
    expect(f.center).toBe(3);
  });

  it('uses only the newest 20 rounds', () => {
    const f = forecastScoreToPar([...Array(20).fill(1), ...Array(20).fill(40)])!;
    expect(f.center).toBe(1);
    expect(f.n).toBe(20);
  });

  it('uses the sample (n-1) standard deviation', () => {
    const f = forecastScoreToPar([0, 2, 0, 2, 0, 2])!;
    expect(f.sd).toBeCloseTo(Math.sqrt(6 / 5), 6);
  });
});

describe('isIntervalCalibrated', () => {
  it('hides the band until enough outcomes are graded', () => {
    expect(isIntervalCalibrated(null)).toBe(false);
    expect(isIntervalCalibrated({ within: 8, total: 10 })).toBe(false);
  });
  it('shows it only when measured coverage is within 5 points of 80%', () => {
    const n = INTERVAL_CALIBRATION_MIN_N * 10;
    expect(isIntervalCalibrated({ within: Math.round(n * 0.78), total: n })).toBe(true);
    expect(isIntervalCalibrated({ within: Math.round(n * 0.7), total: n })).toBe(false);
    expect(isIntervalCalibrated({ within: Math.round(n * 0.92), total: n })).toBe(false);
  });
});

describe('isPatternApplicableTo — strict, round-level only', () => {
  it('never applies a shot-level pattern (lie / distance_range) to a round forecast', () => {
    expect(
      isPatternApplicableTo(
        [
          { field: 'lie', operator: 'eq', value: 'rough' },
          { field: 'distance_range', operator: 'between', value: [100, 150] },
        ],
        { daysSinceLast: 3 },
      ),
    ).toBe(false);
  });
  it('does not apply a round_type pattern when the next round type is unknown', () => {
    expect(
      isPatternApplicableTo([{ field: 'round_type', operator: 'eq', value: 'tournament' }], {
        daysSinceLast: 3,
      }),
    ).toBe(false);
  });
  it('applies a rest pattern only when its condition holds', () => {
    const cond = [{ field: 'days_since_last', operator: 'gte', value: 7 }];
    expect(isPatternApplicableTo(cond, { daysSinceLast: 9 })).toBe(true);
    expect(isPatternApplicableTo(cond, { daysSinceLast: 2 })).toBe(false);
  });
  it('treats an unknown operator as not holding', () => {
    expect(
      isPatternApplicableTo([{ field: 'days_since_last', operator: 'between', value: [1, 3] }], {
        daysSinceLast: 2,
      }),
    ).toBe(false);
  });
});
