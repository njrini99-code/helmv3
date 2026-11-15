/**
 * CoachHelm analyst: the few statistics the fact sheet and the notability rules need that are not already in
 * `v3/stats/**` or `v3/support/**`. Everything else is imported from there:
 *
 *   Wilson and Newcombe intervals   v3/stats/intervals.ts (`wilsonInterval`, `proportionDiffInterval`)
 *   normal and Student t tails      v3/support/distributions.ts (`studentTSf`, `tQuantile975`)
 *   two-sample gap, range and p     v3/support/gap.ts (`computeGap`)
 *   Benjamini-Hochberg              v3/support/multiplicity.ts (`benjaminiHochberg`)
 *
 * Pure.
 */
import { studentTSf, tQuantile975 } from '@/lib/coachhelm/v3/support/distributions';

export interface MeanSummary {
  n: number;
  mean: number;
  /** Sample standard deviation (n − 1); null under two values. */
  sd: number | null;
  /** sd / √n; null under two values. */
  se: number | null;
  /** n − 1; null under two values. */
  df: number | null;
}

/** Mean, sample spread and standard error of `values`; null with no values. */
export function meanSummary(values: readonly number[]): MeanSummary | null {
  const n = values.length;
  if (n === 0) return null;
  const mean = values.reduce((a, v) => a + v, 0) / n;
  if (n < 2) return { n, mean, sd: null, se: null, df: null };
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  return { n, mean, sd, se: sd / Math.sqrt(n), df: n - 1 };
}

/** The two-sided 95% range of an estimate with standard error `se` on `df` degrees of freedom: value ± t(0.975, df) × se. */
export function tRange95(value: number, se: number, df: number): { low: number; high: number } {
  const half = tQuantile975(df) * se;
  return { low: value - half, high: value + half };
}

/**
 * The t quantile with `upperTail` probability above it, by bisection on the exact tail (`studentTSf`).
 * `tQuantile(0.025, df)` is `tQuantile975(df)`; the notability rules need other levels for a Bonferroni-widened range.
 */
export function tQuantile(upperTail: number, df: number): number {
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (studentTSf(mid, df) > upperTail) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Welch-Satterthwaite degrees of freedom for the sum (or difference) of two independent estimates, from each one's
 * standard error and own degrees of freedom:
 *
 *   df = (seA² + seB²)² / (seA⁴ / dfA + seB⁴ / dfB)
 *
 * For two plain means (se = sd/√n, df = n − 1) this is exactly Welch's formula (`welchStandardError` in
 * v3/stats/intervals.ts computes the same from the raw values).
 */
export function satterthwaiteDf(seA: number, dfA: number, seB: number, dfB: number): number {
  const a = seA * seA;
  const b = seB * seB;
  const denom = (a * a) / dfA + (b * b) / dfB;
  return denom > 0 ? (a + b) ** 2 / denom : dfA + dfB;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median absolute deviation from the median; null with no values. */
export function medianAbsoluteDeviation(values: readonly number[]): number | null {
  const m = median(values);
  if (m === null) return null;
  return median(values.map((v) => Math.abs(v - m)));
}

/**
 * MAD × 1.4826 estimates a standard deviation when the values are roughly normal (1 / Φ⁻¹(0.75) = 1.4826), and one
 * extreme teammate cannot stretch it the way it stretches a standard deviation.
 */
export const MAD_TO_SD = 1.4826;
