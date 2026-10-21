/**
 * One-sided 90% bounds on a proportion (02-accuracy-standard §11).
 *
 * `p ∓ 1.2816·√(p(1−p)/n)`; the normal approximation is used from n = 20 up,
 * Wilson's bound below that (and whenever p is 0 or 1, where the normal
 * interval has zero width).
 *
 * Pure.
 */

/** z for a one-sided 90% bound. */
export const Z_ONE_SIDED_90 = 1.2816;

/** Below this n the Wilson bound replaces the normal approximation. */
export const NORMAL_APPROX_MIN_N = 20;

export interface ProportionBounds {
  lower: number;
  upper: number;
  method: 'normal' | 'wilson';
}

export function oneSided90Bounds(made: number, n: number): ProportionBounds | null {
  if (!(n > 0) || made < 0 || made > n) return null;
  const p = made / n;
  const z = Z_ONE_SIDED_90;
  if (n >= NORMAL_APPROX_MIN_N && p > 0 && p < 1) {
    const half = z * Math.sqrt((p * (1 - p)) / n);
    return { lower: Math.max(0, p - half), upper: Math.min(1, p + half), method: 'normal' };
  }
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lower: Math.max(0, centre - half), upper: Math.min(1, centre + half), method: 'wilson' };
}
