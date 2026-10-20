/**
 * DB-free interval and small-sample helpers shared by the v3 generators and
 * the leak maps.
 *
 * A rate printed without its uncertainty reads as a measurement at any n: a
 * 5-attempt sand-save rate moves 20 points per shot, and an 8-shot fairway
 * rate has a standard error near 17 points. These helpers give each caller
 * the interval (or the noise band) that goes next to the number.
 *
 * Pure: no Supabase, no React, no 'use server'.
 */

/** z for a two-sided 95% interval. */
export const Z_95 = 1.959964;

export interface Interval {
  /** Lower bound, same unit as the point estimate. */
  low: number;
  /** Upper bound, same unit as the point estimate. */
  high: number;
}

/**
 * Wilson score interval for k successes in n trials, in PERCENT (0-100).
 * Null when n <= 0. Unlike the Wald interval it stays inside [0, 100] and
 * does not collapse to a point at 0/n or n/n.
 */
export function wilsonInterval(k: number, n: number, z: number = Z_95): Interval | null {
  if (!(n > 0) || !Number.isFinite(k)) return null;
  const p = Math.min(Math.max(k / n, 0), 1);
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    low: Math.max(0, centre - half) * 100,
    high: Math.min(1, centre + half) * 100,
  };
}

/**
 * Newcombe's hybrid score interval (method 10) for pA − pB, in PERCENTAGE
 * POINTS. Built from the two Wilson intervals, so it behaves at small n and
 * at 0% / 100% where the Wald difference interval does not. Null when either
 * side is empty.
 */
export function proportionDiffInterval(
  kA: number,
  nA: number,
  kB: number,
  nB: number,
  z: number = Z_95,
): Interval | null {
  const a = wilsonInterval(kA, nA, z);
  const b = wilsonInterval(kB, nB, z);
  if (!a || !b) return null;
  const pA = (kA / nA) * 100;
  const pB = (kB / nB) * 100;
  const d = pA - pB;
  const low = d - Math.sqrt((pA - a.low) ** 2 + (b.high - pB) ** 2);
  const high = d + Math.sqrt((a.high - pA) ** 2 + (pB - b.low) ** 2);
  return { low, high };
}

/** Sample variance (n − 1 denominator). 0 when fewer than two values. */
export function sampleVariance(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, v) => a + (v - m) ** 2, 0) / (xs.length - 1);
}

/**
 * Welch standard error of mean(A) − mean(B), plus the Welch–Satterthwaite
 * degrees of freedom. Null when either side has fewer than two values (no
 * variance estimate exists).
 */
export function welchStandardError(
  a: readonly number[],
  b: readonly number[],
): { se: number; df: number } | null {
  if (a.length < 2 || b.length < 2) return null;
  const va = sampleVariance(a) / a.length;
  const vb = sampleVariance(b) / b.length;
  const se = Math.sqrt(va + vb);
  const dfDenom = (va * va) / (a.length - 1) + (vb * vb) / (b.length - 1);
  const df = dfDenom > 0 ? ((va + vb) ** 2) / dfDenom : a.length + b.length - 2;
  return { se, df };
}

/** Two-sided 97.5th-percentile t critical values for df 1..30. */
const T_975: readonly number[] = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

/**
 * t critical value for a two-sided 95% test at `df` degrees of freedom.
 * Fractional df (Welch) round DOWN, the conservative direction. Above 30 the
 * normal value is close enough (2.042 → 1.96). The normal approximation at
 * n = 5 would understate the band by about 30%.
 */
export function tCritical95(df: number): number {
  if (!Number.isFinite(df) || df < 1) return T_975[0]!;
  const d = Math.floor(df);
  if (d <= 30) return T_975[d - 1]!;
  if (d <= 60) return 2.0;
  return Z_95;
}
