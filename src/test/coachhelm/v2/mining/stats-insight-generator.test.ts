import { describe, it, expect } from 'vitest';
import { compareAgainstBaseline } from '@/lib/coachhelm/v2/mining/stats-insight-generator';

describe('compareAgainstBaseline (Task B12)', () => {
  it('prefers per-player baseline EWMA over static D2 benchmarks when provided', () => {
    const result = compareAgainstBaseline({
      currentValue: 0.6,
      baseline: { ewma: 0.55, stdDev: 0.02, sampleSize: 40 },
      staticBenchmark: 0.42,
    });
    expect(result.comparedTo).toBe('player_baseline');
    expect(result.referenceValue).toBeCloseTo(0.55);
    expect(result.direction).toBe('above');
  });

  it('falls back to static benchmark when baseline sample size is too small', () => {
    const result = compareAgainstBaseline({
      currentValue: 0.6,
      baseline: { ewma: 0.55, stdDev: 0.02, sampleSize: 2 },
      staticBenchmark: 0.42,
    });
    expect(result.comparedTo).toBe('static_benchmark');
    expect(result.referenceValue).toBe(0.42);
  });

  it('falls back to static when baseline is not supplied', () => {
    const result = compareAgainstBaseline({
      currentValue: 0.6,
      baseline: undefined,
      staticBenchmark: 0.42,
    });
    expect(result.comparedTo).toBe('static_benchmark');
  });

  it('direction below/above/at the reference value', () => {
    expect(
      compareAgainstBaseline({
        currentValue: 0.3,
        baseline: { ewma: 0.5, stdDev: 0.05, sampleSize: 20 },
        staticBenchmark: 0.42,
      }).direction,
    ).toBe('below');
    expect(
      compareAgainstBaseline({
        currentValue: 0.5,
        baseline: { ewma: 0.5, stdDev: 0.05, sampleSize: 20 },
        staticBenchmark: 0.42,
      }).direction,
    ).toBe('at');
  });
});
