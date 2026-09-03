import { describe, it, expect } from 'vitest';
import {
  evaluateConnectionSaturation,
  evaluateRollbackRate,
  ROLLBACK_BASELINE_MIN_SAMPLES,
  type ConnectionSaturationSample,
  type RollbackRateSample,
} from '../health-rules';

function sample(pctMax: number | null, sampledAt = '2026-09-03T12:00:00.000Z'): ConnectionSaturationSample {
  return { sampledAt, connectionsPctMax: pctMax };
}

describe('evaluateConnectionSaturation', () => {
  it('returns ok when history is empty', () => {
    expect(evaluateConnectionSaturation([])).toEqual({ level: 'ok', latestPctMax: null, sustainedHigh: false });
  });

  it('returns ok when the latest sample has no recorded max (malformed row, not a crash)', () => {
    const result = evaluateConnectionSaturation([sample(null)]);
    expect(result.level).toBe('ok');
    expect(result.latestPctMax).toBeNull();
  });

  it('stays ok below the 0.70 fraction threshold — NOT the 70 integer scale', () => {
    // 37% is the production snapshot value from the measured-truth doc.
    expect(evaluateConnectionSaturation([sample(0.37)]).level).toBe('ok');
  });

  it('flags warning at 0.70 and above, below 0.80', () => {
    expect(evaluateConnectionSaturation([sample(0.7)]).level).toBe('warning');
    expect(evaluateConnectionSaturation([sample(0.79)]).level).toBe('warning');
  });

  it('does NOT flag high on a single 0.80+ sample — high requires sustained (2 consecutive)', () => {
    const result = evaluateConnectionSaturation([sample(0.85), sample(0.5)]);
    expect(result.level).toBe('warning');
    expect(result.sustainedHigh).toBe(false);
  });

  it('flags high when the latest AND previous sample are both >= 0.80', () => {
    const result = evaluateConnectionSaturation([sample(0.82), sample(0.81)]);
    expect(result.level).toBe('high');
    expect(result.sustainedHigh).toBe(true);
  });

  it('flags critical at 0.90 and above regardless of sustained state', () => {
    const result = evaluateConnectionSaturation([sample(0.9), sample(0.1)]);
    expect(result.level).toBe('critical');
  });

  it('a bare integer 70/80/90 would be misread as ok — this pins the fraction convention', () => {
    // 70 as a raw integer must NOT be treated as "70%" — it is a nonsense
    // fraction far above 1, and this test exists specifically to catch a
    // future accidental switch back to an integer 0-100 scale.
    const result = evaluateConnectionSaturation([sample(70)]);
    expect(result.level).toBe('critical'); // 70 >= 0.90 trivially true, proving the scale is fractional
  });
});

function rollbackSample(commitDelta: number | null, rollbackDelta: number | null): RollbackRateSample {
  return { sampledAt: '2026-09-03T12:00:00.000Z', xactCommitDelta: commitDelta, xactRollbackDelta: rollbackDelta };
}

describe('evaluateRollbackRate', () => {
  it('reports baselineStatus:collecting with fewer than the minimum usable samples', () => {
    const history = Array.from({ length: ROLLBACK_BASELINE_MIN_SAMPLES - 1 }, () => rollbackSample(100, 1));
    const result = evaluateRollbackRate(history);
    expect(result.baselineStatus).toBe('collecting');
    expect(result.baselineRatePct).toBeNull();
    expect(result.isRegression).toBe(false);
  });

  it('a counter-reset sample (null deltas) does not become a zero rate and does not count toward the sample quota', () => {
    const history = [
      rollbackSample(null, null), // reset window — must be excluded, not treated as 0
      ...Array.from({ length: ROLLBACK_BASELINE_MIN_SAMPLES - 1 }, () => rollbackSample(100, 1)),
    ];
    const result = evaluateRollbackRate(history);
    // Only 23 usable samples remain (the null one excluded) — still collecting.
    expect(result.baselineStatus).toBe('collecting');
  });

  it('zero-transaction windows (commit=0, rollback=0) produce a null rate, not a 0% rate', () => {
    const history = [rollbackSample(0, 0)];
    const result = evaluateRollbackRate(history);
    expect(result.latestRatePct).toBeNull();
  });

  it('reaches baselineStatus:ready once the usable sample count meets the minimum', () => {
    const history = Array.from({ length: ROLLBACK_BASELINE_MIN_SAMPLES }, () => rollbackSample(1000, 10));
    const result = evaluateRollbackRate(history);
    expect(result.baselineStatus).toBe('ready');
    expect(result.baselineRatePct).toBeCloseTo(0.0099, 3);
  });

  it('flags a regression only when the rate exceeds both 2x baseline AND the 5% floor', () => {
    // Older half (indices 12..23) stable at a low rate; latest sample spikes
    // to just over 2x that AND over 5%.
    const stable = Array.from({ length: ROLLBACK_BASELINE_MIN_SAMPLES - 1 }, () => rollbackSample(1000, 10)); // 0.0099
    const history = [rollbackSample(90, 10), ...stable]; // latest: 10/100 = 0.10 (>2x baseline, >5%)
    const result = evaluateRollbackRate(history);
    expect(result.isRegression).toBe(true);
  });

  it('does not flag a regression when the multiplier is exceeded but the rate stays under the 5% floor', () => {
    // Baseline ~0.001 (very low), latest 0.003 — >2x baseline but well under 5%.
    const stable = Array.from({ length: ROLLBACK_BASELINE_MIN_SAMPLES - 1 }, () => rollbackSample(10_000, 10)); // 0.000999
    const history = [rollbackSample(1000, 3), ...stable]; // latest: 3/1003 ≈ 0.00299
    const result = evaluateRollbackRate(history);
    expect(result.isRegression).toBe(false);
  });

  it('does not flag a regression when the rate is above 5% but not above 2x baseline', () => {
    const stable = Array.from({ length: ROLLBACK_BASELINE_MIN_SAMPLES - 1 }, () => rollbackSample(940, 60)); // 0.0597
    const history = [rollbackSample(940, 65), ...stable]; // latest ≈ 0.0647, well under 2x baseline
    const result = evaluateRollbackRate(history);
    expect(result.isRegression).toBe(false);
  });
});
