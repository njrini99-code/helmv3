/**
 * Sampling intervals for the rates and averages v3 insights publish.
 *
 * A make-% or green-hit % over 8-30 attempts moves several points on a single
 * putt or shot, so the card states the interval next to the number instead of
 * a bare whole-number percent (audit rows 24, 25). Pure, DB-free.
 */

/** Two-sided 95% normal quantile. */
export const Z_95 = 1.959963984540054;

export interface RateInterval {
  /** Lower bound, percent points (0-100). */
  low: number;
  /** Upper bound, percent points (0-100). */
  high: number;
}

/**
 * Wilson score interval for `successes` of `n`, in percent points. Chosen over
 * the normal (Wald) interval because it stays inside [0, 100] and behaves at
 * 0% / 100% and small n, which is exactly where these bands live. n <= 0
 * returns the uninformative [0, 100].
 */
export function wilsonInterval(successes: number, n: number, z: number = Z_95): RateInterval {
  if (!Number.isFinite(n) || n <= 0) return { low: 0, high: 100 };
  const k = Math.min(Math.max(0, successes), n);
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    low: Math.max(0, (centre - half) * 100),
    high: Math.min(100, (centre + half) * 100),
  };
}

export interface MeanInterval {
  mean: number;
  /** Standard error of the mean; NaN when n < 2. */
  se: number;
  low: number;
  high: number;
  n: number;
}

/**
 * Normal-approximation 95% interval for the mean of `values` (sample SD,
 * n − 1). With fewer than two values there is no spread estimate, so the
 * interval is unbounded — a caller gating on "excludes zero" then correctly
 * refuses to claim anything.
 */
export function meanInterval(values: readonly number[], z: number = Z_95): MeanInterval {
  const n = values.length;
  const mean = n > 0 ? values.reduce((a, v) => a + v, 0) / n : NaN;
  if (n < 2) return { mean, se: NaN, low: -Infinity, high: Infinity, n };
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  return { mean, se, low: mean - z * se, high: mean + z * se, n };
}

/** " (95% range 61-83%)" — the prose form of a rate interval. */
export function rateIntervalText(ci: RateInterval): string {
  return ` (95% range ${Math.round(ci.low)}-${Math.round(ci.high)}%)`;
}
