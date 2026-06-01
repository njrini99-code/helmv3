/**
 * Unit tests for the PLAY G per-category SG trend helper (`computeSgTrends`).
 *
 * Pins the SG sign convention (higher is better → improving = SG UP), the
 * recent-vs-prior window split, the min-window honesty guard, steady-threshold
 * classification, determinism, and never-throws on short/empty/null series.
 *
 * Run: npm test -- trend
 */
import { describe, test, expect } from 'vitest';
import {
  computeSgTrends,
  MIN_WINDOW,
  WINDOW,
  STEADY_THRESHOLD,
  type SgRoundSample,
} from './trend';

/* ───────────────────────────────────────────────────────────────────────────
 * Fixture builder — build a NEWEST-FIRST series for ONE category, the others
 * all null. `putting` values come first (index 0 = newest round).
 * ────────────────────────────────────────────────────────────────────────── */

/** A round sample with all SG fields null except the ones the caller sets. */
function sample(over: Partial<SgRoundSample> = {}): SgRoundSample {
  return {
    date: null,
    sgPutting: null,
    sgApproach: null,
    sgTee: null,
    sgAroundGreen: null,
    ...over,
  };
}

/** Build a putting-only series from a NEWEST-FIRST list of SG values. */
function puttingSeries(newestFirst: Array<number | null>): SgRoundSample[] {
  return newestFirst.map((v) => sample({ sgPutting: v }));
}

describe('computeSgTrends — sign convention (higher SG is better)', () => {
  test('recent SG HIGHER than prior → improving (SG up = good)', () => {
    // newest-first: recent window [1.0,1.0,1.0,1.0,1.0] avg 1.0,
    // prior window [0,0,0,0,0] avg 0.0 → delta +1.0 → improving.
    const rounds = puttingSeries([1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
    const trends = computeSgTrends(rounds);
    expect(trends.putting?.direction).toBe('improving');
    expect(trends.putting?.recentAvg).toBeCloseTo(1.0, 10);
    expect(trends.putting?.priorAvg).toBeCloseTo(0.0, 10);
    expect(trends.putting?.delta).toBeCloseTo(1.0, 10);
  });

  test('recent SG LOWER than prior → declining (SG down = bad)', () => {
    const rounds = puttingSeries([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
    const trends = computeSgTrends(rounds);
    expect(trends.putting?.direction).toBe('declining');
    expect(trends.putting?.delta).toBeCloseTo(-1.0, 10);
  });

  test('small difference (< steady threshold) → steady, no magnitude meaning', () => {
    // delta well under STEADY_THRESHOLD → steady.
    const eps = STEADY_THRESHOLD / 2;
    const rounds = puttingSeries([
      eps, eps, eps, eps, eps, // recent avg = eps
      0, 0, 0, 0, 0, // prior avg = 0
    ]);
    const trends = computeSgTrends(rounds);
    expect(Math.abs(eps - 0)).toBeLessThan(STEADY_THRESHOLD);
    expect(trends.putting?.direction).toBe('steady');
  });

  test('a delta exactly at the steady threshold is NOT steady (boundary is exclusive on <)', () => {
    // delta == STEADY_THRESHOLD → |delta| < threshold is false → directional.
    const rounds = puttingSeries([
      STEADY_THRESHOLD, STEADY_THRESHOLD, STEADY_THRESHOLD,
      0, 0, 0,
    ]);
    const trends = computeSgTrends(rounds);
    expect(trends.putting?.direction).toBe('improving');
  });
});

describe('computeSgTrends — min-window honesty guard', () => {
  test('fewer than 2*MIN_WINDOW qualifying samples → no trend (balanced split cannot fill both windows)', () => {
    // 2*MIN_WINDOW - 1 = 5 samples → balanced split size = floor(5/2) = 2 < MIN_WINDOW → no trend.
    const rounds = puttingSeries(Array(2 * MIN_WINDOW - 1).fill(1));
    expect(rounds).toHaveLength(2 * MIN_WINDOW - 1);
    const trends = computeSgTrends(rounds);
    expect(trends.putting).toBeUndefined();
  });

  test('a single prior round can never anchor a trend (never off 1 round)', () => {
    // 4 samples → size = floor(4/2) = 2 < MIN_WINDOW → no trend. The balanced
    // split refuses to compare a fat recent window against a 1-2 round prior.
    const rounds = puttingSeries([1, 1, 1, 0]);
    const trends = computeSgTrends(rounds);
    expect(trends.putting).toBeUndefined();
  });

  test('exactly MIN_WINDOW in each window → a trend IS produced', () => {
    const rounds = puttingSeries([
      ...Array(MIN_WINDOW).fill(1), // recent
      ...Array(MIN_WINDOW).fill(0), // prior
    ]);
    const trends = computeSgTrends(rounds);
    expect(trends.putting).toBeDefined();
    expect(trends.putting?.recentN).toBe(MIN_WINDOW);
    expect(trends.putting?.priorN).toBe(MIN_WINDOW);
    expect(trends.putting?.direction).toBe('improving');
  });

  test('nulls do NOT count toward the window — they are skipped, not treated as 0', () => {
    // Interleave nulls; only the real values fill the windows. 6 real values
    // (3 recent @1, 3 prior @0) → improving despite the nulls between them.
    const rounds = puttingSeries([
      1, null, 1, null, 1, // 3 real recent
      null, 0, 0, 0, null, // 3 real prior
    ]);
    const trends = computeSgTrends(rounds);
    expect(trends.putting?.direction).toBe('improving');
    expect(trends.putting?.recentN).toBe(MIN_WINDOW);
    expect(trends.putting?.priorN).toBe(MIN_WINDOW);
  });

  test('all-null series for a category → that category absent', () => {
    const rounds = puttingSeries([null, null, null, null, null, null]);
    const trends = computeSgTrends(rounds);
    expect(trends.putting).toBeUndefined();
  });
});

describe('computeSgTrends — per-category independence', () => {
  test('each SG category is computed from its OWN field; categories are independent', () => {
    // putting improving, approach declining, tee/short_game absent (no data).
    const n = WINDOW;
    const rounds: SgRoundSample[] = [];
    // recent window (newest)
    for (let i = 0; i < n; i++) rounds.push(sample({ sgPutting: 1, sgApproach: 0 }));
    // prior window
    for (let i = 0; i < n; i++) rounds.push(sample({ sgPutting: 0, sgApproach: 1 }));

    const trends = computeSgTrends(rounds);
    expect(trends.putting?.direction).toBe('improving');
    expect(trends.approach?.direction).toBe('declining');
    expect(trends.tee).toBeUndefined();
    expect(trends.short_game).toBeUndefined();
  });

  test('short_game reads strokes_gained_around_green (sgAroundGreen field)', () => {
    const rounds: SgRoundSample[] = [
      ...Array(MIN_WINDOW).fill(0).map(() => sample({ sgAroundGreen: 1 })),
      ...Array(MIN_WINDOW).fill(0).map(() => sample({ sgAroundGreen: 0 })),
    ];
    const trends = computeSgTrends(rounds);
    expect(trends.short_game?.direction).toBe('improving');
  });

  test('outcome categories never receive a trend', () => {
    const rounds = puttingSeries([1, 1, 1, 0, 0, 0]);
    const trends = computeSgTrends(rounds);
    expect(trends.scoring).toBeUndefined();
    expect(trends.course_management).toBeUndefined();
    expect(trends.pressure).toBeUndefined();
  });
});

describe('computeSgTrends — windowing only uses 2*WINDOW most-recent samples', () => {
  test('rounds older than 2*WINDOW do not affect the prior window', () => {
    // recent @1 (WINDOW), prior @0 (WINDOW), then ancient @5 values that must be ignored.
    const rounds = puttingSeries([
      ...Array(WINDOW).fill(1),
      ...Array(WINDOW).fill(0),
      ...Array(WINDOW).fill(5), // ancient — ignored
    ]);
    const trends = computeSgTrends(rounds);
    expect(trends.putting?.priorAvg).toBeCloseTo(0, 10); // not pulled toward 5
    expect(trends.putting?.direction).toBe('improving');
  });
});

describe('computeSgTrends — robustness & determinism', () => {
  test('empty array → empty map, no throw', () => {
    expect(() => computeSgTrends([])).not.toThrow();
    expect(computeSgTrends([])).toEqual({});
  });

  test('never throws on malformed / partial samples (missing or non-number fields)', () => {
    const junk = [
      undefined,
      null,
      {},
      { sgPutting: 'x' },
      { sgPutting: NaN },
      { sgPutting: Infinity },
      sample({ sgPutting: 1 }),
    ] as unknown as SgRoundSample[];
    expect(() => computeSgTrends(junk)).not.toThrow();
  });

  test('NaN / Infinity are treated as non-samples (not counted)', () => {
    // Mix in NaN/Infinity around 6 real values → still a clean improving trend.
    const rounds = [
      sample({ sgPutting: Number.NaN }),
      sample({ sgPutting: 1 }),
      sample({ sgPutting: 1 }),
      sample({ sgPutting: 1 }),
      sample({ sgPutting: Number.POSITIVE_INFINITY }),
      sample({ sgPutting: 0 }),
      sample({ sgPutting: 0 }),
      sample({ sgPutting: 0 }),
    ];
    const trends = computeSgTrends(rounds);
    expect(trends.putting?.recentN).toBe(MIN_WINDOW);
    expect(trends.putting?.priorN).toBe(MIN_WINDOW);
    expect(trends.putting?.direction).toBe('improving');
  });

  test('deterministic: identical input → identical output', () => {
    const rounds = puttingSeries([0.9, 0.8, 0.7, 0.2, 0.1, 0.0]);
    const a = computeSgTrends(rounds);
    const b = computeSgTrends(rounds);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('delta sign matches direction for negative SG values too', () => {
    // All negative SG; recent (-0.2) is HIGHER (better) than prior (-1.0) → improving.
    const rounds = puttingSeries([
      -0.2, -0.2, -0.2, -0.2, -0.2,
      -1.0, -1.0, -1.0, -1.0, -1.0,
    ]);
    const trends = computeSgTrends(rounds);
    expect(trends.putting?.delta).toBeCloseTo(0.8, 10);
    expect(trends.putting?.direction).toBe('improving');
  });
});
