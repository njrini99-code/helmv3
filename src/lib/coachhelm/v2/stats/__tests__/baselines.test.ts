/**
 * `baselines.ts` produces the `BaselineMetric` that `detectAnomalies` consumes,
 * so it is directly upstream of the anomaly coverage added in 252126fc5. It had
 * no test naming any of its exports while `buildPlayerBaseline` is live in
 * three places:
 *
 *   src/app/golf/actions/coachhelm-data.ts:337
 *   src/app/golf/actions/coachhelm-data.ts:655
 *   src/lib/coachhelm/v2/orchestrator.ts:494
 *
 * Expectations are hand-computed from the definitions, not captured from the
 * implementation, so a behaviour change fails here instead of re-baselining.
 *
 * Filed as part of #1481.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateEWMA,
  buildPlayerBaseline,
  compareToBaseline,
} from '@/lib/coachhelm/v2/stats/baselines';

describe('calculateEWMA', () => {
  /**
   * alpha = 0.15, seeded on values[0] and folded forward:
   *   [10, 20]      → 0.15*20 + 0.85*10                  = 11.5
   *   [10, 20, 30]  → 0.15*30 + 0.85*11.5                = 14.275
   */
  it('folds forward from the first value at alpha 0.15', () => {
    expect(calculateEWMA([10, 20])).toBeCloseTo(11.5, 10);
    expect(calculateEWMA([10, 20, 30])).toBeCloseTo(14.275, 10);
  });

  /**
   * THE LOAD-BEARING PROPERTY. The last element carries the most weight, so
   * callers MUST pass rounds oldest-first or the "baseline" tracks the player's
   * oldest form instead of their current form.
   *
   * All three live call sites order `round_date` ascending — verified
   * 2026-08-17 (coachhelm-data.ts:292, and the orchestrator's own query). This
   * test exists so that contract is written down somewhere other than three
   * separate `.order()` calls: reversing the input moves the answer by more
   * than 11 on this fixture.
   */
  it('is order-dependent — newest-last is not the same as newest-first', () => {
    const oldestFirst = calculateEWMA([10, 20, 30]);
    const newestFirst = calculateEWMA([30, 20, 10]);
    expect(oldestFirst).toBeCloseTo(14.275, 10);
    expect(newestFirst).toBeCloseTo(25.725, 10);
    expect(Math.abs(oldestFirst - newestFirst)).toBeGreaterThan(11);
  });

  it('returns the lone value unchanged, and 0 for no values', () => {
    expect(calculateEWMA([7])).toBe(7);
    expect(calculateEWMA([])).toBe(0);
  });

  it('honours a custom alpha — 1 means "only the latest round counts"', () => {
    expect(calculateEWMA([10, 20, 30], 1)).toBeCloseTo(30, 10);
    expect(calculateEWMA([10, 20, 30], 0)).toBeCloseTo(10, 10);
  });
});

describe('buildPlayerBaseline', () => {
  const VALUES = [2, 4, 4, 4, 5, 5, 7, 9];
  const rounds = VALUES.map((v) => ({ metrics: { scoreToPar: v } }));

  /**
   * mean 5; squared deviations sum to 32.
   *   stdDev     uses SAMPLE variance   32/(8-1) → sqrt(4.571428…) = 2.13809…
   *   volatility uses POPULATION variance 32/8   → sqrt(4)         = 2
   *
   * Both in the same function, on the same numbers. That is not obviously
   * intentional, so it is pinned rather than left to be discovered: anyone
   * unifying them will see this fail and have to decide deliberately.
   *
   * It also differs from `anomaly-detector.ts`, whose `stdDev` is population.
   * `detectAnomalies` divides by THIS sample stdDev when it z-scores, so the
   * two conventions do meet.
   */
  it('uses SAMPLE variance for stdDev but POPULATION for volatility', () => {
    const b = buildPlayerBaseline(rounds).metrics.scoreToPar!;
    expect(b.stdDev).toBeCloseTo(Math.sqrt(32 / 7), 10);
    expect(b.volatility).toBeCloseTo(2, 10);
    expect(b.stdDev).not.toBeCloseTo(b.volatility, 3);
  });

  it('reports mean and sampleSize straight', () => {
    const b = buildPlayerBaseline(rounds).metrics.scoreToPar!;
    expect(b.mean).toBeCloseTo(5, 10);
    expect(b.sampleSize).toBe(8);
  });

  /**
   * Least squares on x = index: slope = (n*Σxy − Σx*Σy) / (n*Σx² − (Σx)²)
   *   n=8, Σx=28, Σy=40, Σxy=174, Σx²=140
   *   → (1392 − 1120) / (1120 − 784) = 272 / 336 = 0.809523…
   */
  it('computes the trend as a least-squares slope over round index', () => {
    const b = buildPlayerBaseline(rounds).metrics.scoreToPar!;
    expect(b.trend).toBeCloseTo(272 / 336, 10);
  });

  it('builds a metric per key and skips keys with no values', () => {
    // Annotated explicitly: the heterogeneous literals otherwise infer a union
    // where `b?: undefined`, which is not assignable to Record<string, number>.
    const mixed: Array<{ metrics: Record<string, number> }> = [
      { metrics: { a: 1, b: 10 } },
      { metrics: { a: 3 } },
      { metrics: { a: 5, b: 30 } },
    ];
    const out = buildPlayerBaseline(mixed);
    expect(Object.keys(out.metrics).sort()).toEqual(['a', 'b']);
    expect(out.metrics.a!.sampleSize).toBe(3);
    expect(out.metrics.b!.sampleSize).toBe(2); // the middle round had no b
  });

  it('returns an empty profile rather than throwing on no rounds', () => {
    const out = buildPlayerBaseline([], 'player-1');
    expect(out.metrics).toEqual({});
    expect(out.playerId).toBe('player-1');
  });

  it('does not divide by zero on a single round', () => {
    const b = buildPlayerBaseline([{ metrics: { x: 42 } }]).metrics.x!;
    expect(Number.isFinite(b.stdDev)).toBe(true);
    expect(b.stdDev).toBe(0);
    expect(b.mean).toBe(42);
    expect(b.trend).toBe(0);
  });
});

describe('compareToBaseline', () => {
  const base = { ewma: 4, mean: 4, stdDev: 2, trend: 0, volatility: 0, sampleSize: 20 };

  it('z-scores against the EWMA, not the mean', () => {
    const r = compareToBaseline(10, { ...base, ewma: 4, mean: 999 });
    expect(r.deviation).toBeCloseTo(6, 10);
    expect(r.zScore).toBeCloseTo(3, 10);
  });

  it('calls |z| >= 2 significant, and less than that not', () => {
    expect(compareToBaseline(8, base).isSignificant).toBe(true); // z = 2
    expect(compareToBaseline(7.9, base).isSignificant).toBe(false); // z = 1.95
  });

  it('treats a near-baseline value as "at", not a direction', () => {
    expect(compareToBaseline(4, base).direction).toBe('at');
    expect(compareToBaseline(4.1, base).direction).toBe('at'); // |z| = 0.05 < 0.1
    expect(compareToBaseline(4.3, base).direction).toBe('above'); // |z| = 0.15
    expect(compareToBaseline(3.7, base).direction).toBe('below');
  });

  it('returns a finite zero rather than Infinity when the baseline has no spread', () => {
    const r = compareToBaseline(99, { ...base, stdDev: 0 });
    expect(r.zScore).toBe(0);
    expect(r.isSignificant).toBe(false);
    expect(r.direction).toBe('at');
    expect(Number.isFinite(r.deviation)).toBe(true);
  });
});
