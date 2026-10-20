/**
 * The WHAT axis of a read (02-accuracy-standard §2): the gap to the benchmark
 * with a two-sided 95% range for display and a one-sided p-value for the
 * decision.
 *
 * Sign convention (02 §2): `gap > 0` ALWAYS means "the player is worse than
 * the benchmark", whatever the metric's polarity. A strength read is the
 * mirror test (`direction: 'strength'`), and its gap is reported with the
 * same sign convention, so a strength has a negative gap.
 *
 * Four input shapes cover what today's evidence can carry:
 *   - one proportion against a fixed benchmark rate (make %, green hit %,
 *     save %): Wilson range, exact binomial one-sided p;
 *   - two proportions within the player (downhill vs level, driver vs
 *     non-driver): Newcombe range, pooled-z one-sided p;
 *   - a mean with a standard error against a benchmark (pressure delta,
 *     opening-hole delta): t range and t one-sided p;
 *   - a count per round against a benchmark rate (penalties): exact Poisson
 *     range and exact Poisson one-sided p.
 *
 * Pure. Reuses the existing Wilson / Newcombe intervals from
 * `stats/intervals.ts`.
 */
import { proportionDiffInterval, wilsonInterval } from '@/lib/coachhelm/v3/stats/intervals';
import {
  binomialCdf,
  binomialSf,
  normalSf,
  poissonExactInterval,
  poissonSf,
  studentTSf,
  tQuantile975,
} from './distributions';

export type Polarity = 'higher_better' | 'lower_better';
export type Direction = 'weakness' | 'strength';

export type GapInput =
  | {
      kind: 'proportion';
      /** Successes (makes, greens, saves). */
      k: number;
      n: number;
      /** Benchmark rate, a fraction strictly inside (0, 1). */
      benchmark: number;
      polarity: Polarity;
    }
  | {
      kind: 'two_proportion';
      /** The side the read is about (downhill, driver). */
      kA: number;
      nA: number;
      /** The player's own reference side (level, non-driver). */
      kB: number;
      nB: number;
      /** Polarity of the RATE (make %, fairway %). */
      polarity: Polarity;
    }
  | {
      kind: 'mean';
      /** Player estimate in the metric's unit. */
      value: number;
      /** Standard error of `value`. */
      se: number;
      /** Degrees of freedom for the t critical value; Infinity → normal. */
      df: number;
      benchmark: number;
      polarity: Polarity;
    }
  | {
      kind: 'rate_per_round';
      /** Events counted (penalties). */
      events: number;
      rounds: number;
      /** Benchmark events per round. */
      benchmark: number;
      polarity: Polarity;
    };

export type GapMethod = 'wilson' | 'newcombe' | 'welch' | 'poisson';
export type GapTest = 'exact_binomial' | 'pooled_z' | 't' | 'exact_poisson';
export type GapUnit = 'pct_points' | 'metric_unit' | 'per_round';

export interface GapResult {
  /** Positive = player worse than the benchmark (02 §2). */
  gap: number;
  gap_unit: GapUnit;
  /** Two-sided 95% range of `gap`. */
  range_lo: number;
  range_hi: number;
  /** One-sided p-value for the read's direction (worse, or better for a strength). */
  p_one_sided: number;
  direction: Direction;
  method: GapMethod;
  test: GapTest;
}

/**
 * Decide the read's direction from the point gap: a gap at or above zero is a
 * weakness read, below zero a strength read (the mirror test, 02 §2 and §6).
 * `allowStrength: false` (within-player contrasts, where the generator names
 * the side it suspects) keeps the weakness test even when the point gap is
 * negative, so the p-value is simply large.
 */
function pickDirection(gap: number, allowStrength: boolean): Direction {
  return allowStrength && gap < 0 ? 'strength' : 'weakness';
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Returns null when the input cannot be tested (empty sample, degenerate benchmark). */
export function computeGap(input: GapInput, opts: { allowStrength?: boolean } = {}): GapResult | null {
  const allowStrength = opts.allowStrength ?? true;
  switch (input.kind) {
    case 'proportion': {
      const { n, benchmark: b, polarity } = input;
      if (!(n > 0) || !(b > 0 && b < 1) || !Number.isFinite(input.k)) return null;
      const k = Math.min(Math.max(0, Math.round(input.k)), n);
      const ci = wilsonInterval(k, n);
      if (!ci) return null;
      const y = (k / n) * 100;
      const bp = b * 100;
      const hb = polarity === 'higher_better';
      const gap = hb ? bp - y : y - bp;
      const lo = hb ? bp - ci.high : ci.low - bp;
      const hi = hb ? bp - ci.low : ci.high - bp;
      const direction = pickDirection(gap, allowStrength);
      // "Worse" for a higher-better rate is a LOW count: P(X <= k | b).
      const pWorse = hb ? binomialCdf(k, n, b) : binomialSf(k, n, b);
      const pBetter = hb ? binomialSf(k, n, b) : binomialCdf(k, n, b);
      return {
        gap: round(gap),
        gap_unit: 'pct_points',
        range_lo: round(lo),
        range_hi: round(hi),
        p_one_sided: direction === 'weakness' ? pWorse : pBetter,
        direction,
        method: 'wilson',
        test: 'exact_binomial',
      };
    }
    case 'two_proportion': {
      const { nA, nB, polarity } = input;
      if (!(nA > 0) || !(nB > 0)) return null;
      const kA = Math.min(Math.max(0, Math.round(input.kA)), nA);
      const kB = Math.min(Math.max(0, Math.round(input.kB)), nB);
      const diff = proportionDiffInterval(kA, nA, kB, nB); // pA − pB, points
      if (!diff) return null;
      const pA = kA / nA;
      const pB = kB / nB;
      const hb = polarity === 'higher_better';
      // Worse = side A below side B for a higher-better rate.
      const gap = (hb ? pB - pA : pA - pB) * 100;
      const lo = hb ? -diff.high : diff.low;
      const hi = hb ? -diff.low : diff.high;
      const direction = pickDirection(gap, allowStrength);
      const pool = (kA + kB) / (nA + nB);
      const se = Math.sqrt(pool * (1 - pool) * (1 / nA + 1 / nB));
      let p: number;
      if (se === 0) {
        p = gap === 0 ? 1 : direction === 'weakness' ? (gap > 0 ? 0 : 1) : gap < 0 ? 0 : 1;
      } else {
        const z = gap / 100 / se;
        p = direction === 'weakness' ? normalSf(z) : normalSf(-z);
      }
      return {
        gap: round(gap),
        gap_unit: 'pct_points',
        range_lo: round(lo),
        range_hi: round(hi),
        p_one_sided: p,
        direction,
        method: 'newcombe',
        test: 'pooled_z',
      };
    }
    case 'mean': {
      const { value, se, df, benchmark: b, polarity } = input;
      if (!Number.isFinite(value) || !Number.isFinite(b) || !(se > 0)) return null;
      const gap = polarity === 'lower_better' ? value - b : b - value;
      const t = tQuantile975(df);
      const direction = pickDirection(gap, allowStrength);
      const stat = gap / se;
      return {
        gap: round(gap),
        gap_unit: 'metric_unit',
        range_lo: round(gap - t * se),
        range_hi: round(gap + t * se),
        p_one_sided: direction === 'weakness' ? studentTSf(stat, df) : studentTSf(-stat, df),
        direction,
        method: 'welch',
        test: 't',
      };
    }
    case 'rate_per_round': {
      const { rounds, benchmark: b, polarity } = input;
      if (!(rounds > 0) || !(b > 0) || !Number.isFinite(input.events)) return null;
      const events = Math.max(0, Math.round(input.events));
      const rate = events / rounds;
      const ci = poissonExactInterval(events);
      const lowRate = ci.low / rounds;
      const highRate = ci.high / rounds;
      const lb = polarity === 'lower_better';
      const gap = lb ? rate - b : b - rate;
      const lo = lb ? lowRate - b : b - highRate;
      const hi = lb ? highRate - b : b - lowRate;
      const direction = pickDirection(gap, allowStrength);
      const mu = b * rounds;
      // Worse for a lower-better count is MANY events: P(X >= events | mu).
      const pWorse = lb ? poissonSf(events, mu) : 1 - poissonSf(events + 1, mu);
      const pBetter = lb ? 1 - poissonSf(events + 1, mu) : poissonSf(events, mu);
      return {
        gap: round(gap),
        gap_unit: 'per_round',
        range_lo: round(lo),
        range_hi: round(hi),
        p_one_sided: Math.min(1, Math.max(0, direction === 'weakness' ? pWorse : pBetter)),
        direction,
        method: 'poisson',
        test: 'exact_poisson',
      };
    }
  }
}

/** True when the 95% range sits entirely on the read's side of zero. */
export function rangeExcludesZero(g: Pick<GapResult, 'range_lo' | 'range_hi' | 'direction'>): boolean {
  return g.direction === 'weakness' ? g.range_lo > 0 : g.range_hi < 0;
}
