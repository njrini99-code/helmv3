import { describe, it, expect } from 'vitest';
import {
  classifyTrendDelta,
  computeSeriesTrend,
  TREND_WINDOW_SIZE,
  DEFAULT_MIN_PREVIOUS,
  TREND_ARROW,
  TREND_TEXT_TONE,
  TREND_LABEL,
  type TrendVerdict,
} from './trend';

describe('classifyTrendDelta', () => {
  it('reads a negative delta as improving when lower is better', () => {
    expect(classifyTrendDelta(-1.5, { lowerIsBetter: true, threshold: 0.5 })).toBe('improving');
  });

  it('reads a positive delta as declining when lower is better', () => {
    expect(classifyTrendDelta(1.5, { lowerIsBetter: true, threshold: 0.5 })).toBe('declining');
  });

  it('reads a positive delta as improving when higher is better', () => {
    expect(classifyTrendDelta(2, { lowerIsBetter: false, threshold: 0.5 })).toBe('improving');
  });

  it('reads a negative delta as declining when higher is better', () => {
    expect(classifyTrendDelta(-2, { lowerIsBetter: false, threshold: 0.5 })).toBe('declining');
  });

  it('is stable when |delta| is under the threshold', () => {
    expect(classifyTrendDelta(0.2, { lowerIsBetter: true, threshold: 0.5 })).toBe('stable');
    expect(classifyTrendDelta(-0.2, { lowerIsBetter: true, threshold: 0.5 })).toBe('stable');
  });

  it('is NOT stable exactly at the threshold — the comparison is strict (< threshold, not ≤)', () => {
    expect(classifyTrendDelta(0.5, { lowerIsBetter: true, threshold: 0.5 })).toBe('declining');
    expect(classifyTrendDelta(0.49, { lowerIsBetter: true, threshold: 0.5 })).toBe('stable');
  });

  it('treats a non-finite delta as stable, never throws', () => {
    expect(classifyTrendDelta(NaN, { lowerIsBetter: true, threshold: 0.5 })).toBe('stable');
    expect(classifyTrendDelta(Infinity, { lowerIsBetter: true, threshold: 0.5 })).toBe('stable');
  });

  it('the SAME delta reads the SAME verdict regardless of caller (coherence contract)', () => {
    // This is the actual bug #914 fixes: four surfaces reimplementing this
    // decision independently. Lock in that one function, one answer.
    const opts = { lowerIsBetter: true, threshold: 0.5 } as const;
    const delta = -0.8;
    expect(classifyTrendDelta(delta, opts)).toBe(classifyTrendDelta(delta, opts));
    expect(classifyTrendDelta(delta, opts)).toBe('improving');
  });
});

describe('computeSeriesTrend', () => {
  const opts = { lowerIsBetter: true, threshold: 0.5 } as const;

  it('computes recentAvg - previousAvg over the canonical 5-vs-5 window', () => {
    // recent (index 0-4): avg 70; previous (index 5-9): avg 74 → delta -4 (improving, lower is better)
    const series = [70, 70, 70, 70, 70, 74, 74, 74, 74, 74];
    const result = computeSeriesTrend(series, opts);
    expect(result.delta).toBeCloseTo(-4, 10);
    expect(result.trend).toBe('improving');
  });

  it('is stable with insufficient previous samples (< DEFAULT_MIN_PREVIOUS), and flags hasSignal false', () => {
    // Only 2 previous values — below the canonical 3-sample floor.
    const series = [70, 70, 70, 70, 70, 90, 90];
    expect(series.length).toBeGreaterThan(TREND_WINDOW_SIZE);
    const result = computeSeriesTrend(series, opts);
    expect(result.trend).toBe('stable');
    expect(result.delta).toBe(0);
    expect(result.hasSignal).toBe(false);
  });

  it('is stable with zero recent samples', () => {
    expect(computeSeriesTrend([], opts)).toEqual({ trend: 'stable', delta: 0, hasSignal: false });
  });

  it('flags hasSignal true once there is enough history, even for a genuinely flat delta', () => {
    // A REAL zero-movement result must be distinguishable from "not enough
    // data yet" — both read as delta 0, so hasSignal is the honest tell.
    const series = [75, 75, 75, 75, 75, 75, 75, 75, 75, 75];
    const result = computeSeriesTrend(series, opts);
    expect(result.delta).toBe(0);
    expect(result.trend).toBe('stable');
    expect(result.hasSignal).toBe(true);
  });

  it('honors an explicit minPrevious override (e.g. category insights: 1)', () => {
    // recent avg 70, previous (single sample) 90 → delta -20 → improving
    // (lower is better) — and it resolves at all only because minPrevious:1
    // relaxes the canonical 3-sample floor.
    const series = [70, 70, 70, 70, 70, 90];
    const result = computeSeriesTrend(series, { ...opts, minPrevious: 1 });
    expect(result.trend).toBe('improving');
    expect(result.delta).toBeCloseTo(-20, 10);
  });

  it('honors an explicit windowSize override', () => {
    // 3-vs-3 window: recent [70,70,70] avg 70; previous [80,80,80] avg 80 → -10 improving
    const series = [70, 70, 70, 80, 80, 80];
    const result = computeSeriesTrend(series, { ...opts, windowSize: 3, minPrevious: 3 });
    expect(result.delta).toBeCloseTo(-10, 10);
    expect(result.trend).toBe('improving');
  });

  it('defaults minPrevious to DEFAULT_MIN_PREVIOUS (3)', () => {
    expect(DEFAULT_MIN_PREVIOUS).toBe(3);
    // Exactly 3 previous samples clears the floor.
    const series = [70, 70, 70, 70, 70, 90, 90, 90];
    const result = computeSeriesTrend(series, opts);
    expect(result.trend).not.toBe('stable');
  });

  it('flips direction correctly for a higher-is-better metric (e.g. fairway %)', () => {
    // recent avg 60%, previous avg 50% → +10, higher is better → improving
    const series = [60, 60, 60, 60, 60, 50, 50, 50, 50, 50];
    const result = computeSeriesTrend(series, { lowerIsBetter: false, threshold: 0.5 });
    expect(result.delta).toBeCloseTo(10, 10);
    expect(result.trend).toBe('improving');
  });
});

// ============================================================================
// Canonical glyph/tone rendering (#945) — the ONE arrow-to-verdict mapping
// every surface (Players roster, Team Stats trajectory + player cards, Team
// Pulse) must render through. The rule: the arrow is the PERFORMANCE
// direction, never the raw metric's own sign.
// ============================================================================

describe('TREND_ARROW / TREND_TEXT_TONE / TREND_LABEL', () => {
  const verdicts: TrendVerdict[] = ['improving', 'stable', 'declining'];

  it('defines a glyph, tone, and label for every verdict', () => {
    for (const v of verdicts) {
      expect(TREND_ARROW[v]).toEqual(expect.any(String));
      expect(TREND_TEXT_TONE[v]).toEqual(expect.any(String));
      expect(TREND_LABEL[v]).toEqual(expect.any(String));
    }
  });

  it('improving and declining never share an arrow or tone (the actual #945 regression)', () => {
    expect(TREND_ARROW.improving).not.toBe(TREND_ARROW.declining);
    expect(TREND_TEXT_TONE.improving).not.toBe(TREND_TEXT_TONE.declining);
  });

  it('declining is amber/warning, never the destructive-red error tone', () => {
    expect(TREND_TEXT_TONE.declining).not.toMatch(/destructive|red/i);
    expect(TREND_TEXT_TONE.declining).toContain('warning');
  });
});
