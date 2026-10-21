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
 * Direction (post-merge review, blocker 1): the direction a read is tested in
 * must not be picked from the same data the test then judges, or the
 * false-positive rate fed to Benjamini-Hochberg doubles under H0. So the
 * caller pre-declares it (`opts.direction`, from the row's own framing, see
 * `candidate.ts`). When it cannot and strengths are allowed, the direction
 * follows the point gap but BH gets the two-sided p, `min(1, 2·min(pWorse,
 * pBetter))` (`p_bh`), which is what a data-picked direction costs.
 *
 * Four input shapes cover what today's evidence can carry:
 *   - one proportion against a benchmark rate (make %, green hit %,
 *     save %): Wilson range, exact binomial one-sided p;
 *   - two proportions within the player (downhill vs level, driver vs
 *     non-driver): Newcombe range, pooled-z one-sided p;
 *   - a mean with a standard error against a benchmark (pressure delta,
 *     opening-hole delta): t range and t one-sided p;
 *   - a count per round against a benchmark rate (penalties): exact Poisson
 *     range and exact Poisson one-sided p.
 *
 * A benchmark that is itself an estimate (the team's leave-one-out mean)
 * carries its own sample: `benchmarkN` (proportion), `benchmarkRounds`
 * (count per round) or `benchmarkSe` (mean). The test is then a two-sample
 * one, so the benchmark's variance widens the range and the p (02 §3):
 * Newcombe and pooled z for two proportions, MOVER on the two exact Poisson
 * intervals with the conditional binomial test for two rates, and the summed
 * variances for two means. Without it the benchmark is treated as exact.
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
      /** Attempts behind the benchmark when it is itself an estimate; absent = exact. */
      benchmarkN?: number;
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
      /** Standard error of the benchmark when it is itself an estimate; absent = exact. */
      benchmarkSe?: number;
      polarity: Polarity;
    }
  | {
      kind: 'rate_per_round';
      /** Events counted (penalties). */
      events: number;
      rounds: number;
      /** Benchmark events per round. */
      benchmark: number;
      /** Rounds behind the benchmark when it is itself an estimate; absent = exact. */
      benchmarkRounds?: number;
      polarity: Polarity;
    };

export type GapMethod = 'wilson' | 'newcombe' | 'welch' | 'poisson';
export type GapTest = 'exact_binomial' | 'pooled_z' | 't' | 'exact_poisson' | 'conditional_binomial';
export type GapUnit = 'pct_points' | 'metric_unit' | 'per_round';
/** How the read's direction was set: declared before the test, or picked from the point gap. */
export type DirectionBasis = 'declared' | 'data';

export interface GapResult {
  /** Positive = player worse than the benchmark (02 §2). */
  gap: number;
  gap_unit: GapUnit;
  /** Two-sided 95% range of `gap`. */
  range_lo: number;
  range_hi: number;
  /** One-sided p-value for the read's direction (worse, or better for a strength). */
  p_one_sided: number;
  /**
   * The p this read feeds Benjamini-Hochberg: `p_one_sided` for a declared
   * direction, the two-sided `min(1, 2·min(pWorse, pBetter))` for one picked
   * from the data.
   */
  p_bh: number;
  direction: Direction;
  direction_basis: DirectionBasis;
  /** True when the benchmark's own variance is in the range and the p. */
  benchmark_variance: boolean;
  method: GapMethod;
  test: GapTest;
}

export interface GapOptions {
  /** The direction the read is tested in: the side the row's own words claim. */
  direction?: Direction;
  /**
   * How that direction was set. `declared` (the default with a direction): the
   * family only ever claims this side, whatever the data say. `data`: the
   * generator picks the side from the same comparison (a leak or a strength
   * row by the sign), so BH gets the two-sided p.
   */
  basis?: DirectionBasis;
  /** Without a declared direction: may a better-than-benchmark gap be a strength read? */
  allowStrength?: boolean;
}

interface Picked {
  direction: Direction;
  basis: DirectionBasis;
}

/**
 * The read's direction. A declared one wins. Otherwise, with strengths
 * allowed, it follows the point gap (below zero is a strength, the mirror
 * test of 02 §2 and §6) and is marked `data`, so the p fed to BH is
 * two-sided. Without strengths (within-player contrasts, where the generator
 * names the side it suspects) the family pre-declares the weakness test, so a
 * negative point gap simply gives a large p.
 */
function pickDirection(gap: number, opts: GapOptions): Picked {
  if (opts.direction) return { direction: opts.direction, basis: opts.basis ?? 'declared' };
  if (opts.allowStrength ?? true) return { direction: gap < 0 ? 'strength' : 'weakness', basis: 'data' };
  return { direction: 'weakness', basis: 'declared' };
}

function clamp01(p: number): number {
  return Math.min(1, Math.max(0, p));
}

/** The one-sided p for the direction, and the p BH gets. */
function pFor(picked: Picked, pWorse: number, pBetter: number): { p: number; pBh: number } {
  const w = clamp01(pWorse);
  const b = clamp01(pBetter);
  const p = picked.direction === 'weakness' ? w : b;
  return { p, pBh: picked.basis === 'declared' ? p : Math.min(1, 2 * Math.min(w, b)) };
}

/**
 * One-sided tails of a pooled two-proportion z, where `gapPoints` is the
 * worse-minus-better difference in points and (kA, nA) / (kB, nB) are the two
 * samples it was formed from.
 */
function pooledZTails(gapPoints: number, kA: number, nA: number, kB: number, nB: number): { worse: number; better: number } {
  const pool = (kA + kB) / (nA + nB);
  const se = Math.sqrt(pool * (1 - pool) * (1 / nA + 1 / nB));
  if (!(se > 0)) {
    if (gapPoints === 0) return { worse: 1, better: 1 };
    return gapPoints > 0 ? { worse: 0, better: 1 } : { worse: 1, better: 0 };
  }
  const z = gapPoints / 100 / se;
  return { worse: normalSf(z), better: normalSf(-z) };
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function usable(x: number | undefined): x is number {
  return x !== undefined && Number.isFinite(x) && x > 0;
}

/** Returns null when the input cannot be tested (empty sample, degenerate benchmark). */
export function computeGap(input: GapInput, opts: GapOptions = {}): GapResult | null {
  switch (input.kind) {
    case 'proportion': {
      const { n, benchmark: b, polarity } = input;
      if (!(n > 0) || !(b > 0 && b < 1) || !Number.isFinite(input.k)) return null;
      const k = Math.min(Math.max(0, Math.round(input.k)), n);
      const y = (k / n) * 100;
      const bp = b * 100;
      const hb = polarity === 'higher_better';
      const gap = hb ? bp - y : y - bp;
      const picked = pickDirection(gap, opts);
      if (usable(input.benchmarkN)) {
        // The benchmark is an estimate: two proportions, player − benchmark.
        const nB = input.benchmarkN;
        const kB = b * nB;
        const diff = proportionDiffInterval(k, n, kB, nB);
        if (!diff) return null;
        const lo = hb ? -diff.high : diff.low;
        const hi = hb ? -diff.low : diff.high;
        const tails = hb ? pooledZTails(gap, kB, nB, k, n) : pooledZTails(gap, k, n, kB, nB);
        const { p, pBh } = pFor(picked, tails.worse, tails.better);
        return {
          gap: round(gap),
          gap_unit: 'pct_points',
          range_lo: round(lo),
          range_hi: round(hi),
          p_one_sided: p,
          p_bh: pBh,
          direction: picked.direction,
          direction_basis: picked.basis,
          benchmark_variance: true,
          method: 'newcombe',
          test: 'pooled_z',
        };
      }
      const ci = wilsonInterval(k, n);
      if (!ci) return null;
      const lo = hb ? bp - ci.high : ci.low - bp;
      const hi = hb ? bp - ci.low : ci.high - bp;
      // "Worse" for a higher-better rate is a LOW count: P(X <= k | b).
      const pWorse = hb ? binomialCdf(k, n, b) : binomialSf(k, n, b);
      const pBetter = hb ? binomialSf(k, n, b) : binomialCdf(k, n, b);
      const { p, pBh } = pFor(picked, pWorse, pBetter);
      return {
        gap: round(gap),
        gap_unit: 'pct_points',
        range_lo: round(lo),
        range_hi: round(hi),
        p_one_sided: p,
        p_bh: pBh,
        direction: picked.direction,
        direction_basis: picked.basis,
        benchmark_variance: false,
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
      const picked = pickDirection(gap, opts);
      const tails = pooledZTails(gap, kA, nA, kB, nB);
      const { p, pBh } = pFor(picked, tails.worse, tails.better);
      return {
        gap: round(gap),
        gap_unit: 'pct_points',
        range_lo: round(lo),
        range_hi: round(hi),
        p_one_sided: p,
        p_bh: pBh,
        direction: picked.direction,
        direction_basis: picked.basis,
        benchmark_variance: false,
        method: 'newcombe',
        test: 'pooled_z',
      };
    }
    case 'mean': {
      const { value, se: seOwn, df, benchmark: b, polarity } = input;
      if (!Number.isFinite(value) || !Number.isFinite(b) || !(seOwn > 0)) return null;
      const seB = usable(input.benchmarkSe) ? input.benchmarkSe : 0;
      const se = Math.sqrt(seOwn * seOwn + seB * seB);
      const gap = polarity === 'lower_better' ? value - b : b - value;
      const t = tQuantile975(df);
      const picked = pickDirection(gap, opts);
      const stat = gap / se;
      const { p, pBh } = pFor(picked, studentTSf(stat, df), studentTSf(-stat, df));
      return {
        gap: round(gap),
        gap_unit: 'metric_unit',
        range_lo: round(gap - t * se),
        range_hi: round(gap + t * se),
        p_one_sided: p,
        p_bh: pBh,
        direction: picked.direction,
        direction_basis: picked.basis,
        benchmark_variance: seB > 0,
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
      const picked = pickDirection(gap, opts);
      if (usable(input.benchmarkRounds)) {
        // The benchmark is an estimate: two rates. MOVER on the two exact
        // intervals for the range; the conditional binomial test for the p
        // (given T events in all, the player's share under H0 is r / (r + rB)).
        const rB = input.benchmarkRounds;
        const eB = Math.max(0, Math.round(b * rB));
        const rateB = eB / rB;
        const ciB = poissonExactInterval(eB);
        const lB = ciB.low / rB;
        const uB = ciB.high / rB;
        const d = rate - rateB; // player − benchmark
        const dLo = d - Math.sqrt((rate - lowRate) ** 2 + (uB - rateB) ** 2);
        const dHi = d + Math.sqrt((highRate - rate) ** 2 + (rateB - lB) ** 2);
        const total = events + eB;
        const share = rounds / (rounds + rB);
        const pMany = total === 0 ? 1 : binomialSf(events, total, share);
        const pFew = total === 0 ? 1 : binomialCdf(events, total, share);
        const { p, pBh } = pFor(picked, lb ? pMany : pFew, lb ? pFew : pMany);
        return {
          gap: round(lb ? d : -d),
          gap_unit: 'per_round',
          range_lo: round(lb ? dLo : -dHi),
          range_hi: round(lb ? dHi : -dLo),
          p_one_sided: p,
          p_bh: pBh,
          direction: picked.direction,
          direction_basis: picked.basis,
          benchmark_variance: true,
          method: 'poisson',
          test: 'conditional_binomial',
        };
      }
      const lo = lb ? lowRate - b : b - highRate;
      const hi = lb ? highRate - b : b - lowRate;
      const mu = b * rounds;
      // Worse for a lower-better count is MANY events: P(X >= events | mu).
      const pWorse = lb ? poissonSf(events, mu) : 1 - poissonSf(events + 1, mu);
      const pBetter = lb ? 1 - poissonSf(events + 1, mu) : poissonSf(events, mu);
      const { p, pBh } = pFor(picked, pWorse, pBetter);
      return {
        gap: round(gap),
        gap_unit: 'per_round',
        range_lo: round(lo),
        range_hi: round(hi),
        p_one_sided: p,
        p_bh: pBh,
        direction: picked.direction,
        direction_basis: picked.basis,
        benchmark_variance: false,
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
