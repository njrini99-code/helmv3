/**
 * Tail probabilities the support layer needs (02-accuracy-standard §2, §11):
 * the standard normal, Student's t, the exact binomial and the exact Poisson.
 *
 * The existing v3 helpers (`stats/proportion-test.ts`) carry a 7-digit
 * Abramowitz–Stegun normal; a one-sided p that feeds Benjamini–Hochberg is
 * compared against thresholds like 0.10 × 3/60 = 0.005, so these use the
 * higher-accuracy forms below (Chebyshev erfc, Lentz continued fractions).
 *
 * Pure: numbers in, numbers out. No Supabase, no I/O.
 */

/** Complementary error function: the Numerical Recipes (3rd ed., §6.2.2)
 *  `erfccheb` Chebyshev fit, accurate to ~1e-15 over the whole line (pinned
 *  against reference values in the tests). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;
  const cof = [
    -1.3026537197817094, 0.6419697923564902, 1.9476473204185836e-2, -9.56151478680863e-3,
    -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5, -2.0278578112534e-5,
    -1.624290004647e-6, 1.30365583558e-6, 1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9,
    5.059343495e-9, -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-12,
    -6.886027e-12, 8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15, -1.523e-15,
    -9.4e-17, 1.21e-16, -2.8e-17,
  ];
  let d = 0;
  let dd = 0;
  for (let j = cof.length - 1; j > 0; j--) {
    const tmp = d;
    d = ty * d - dd + cof[j]!;
    dd = tmp;
  }
  const res = t * Math.exp(-z * z + 0.5 * (cof[0]! + ty * d) - dd);
  return x >= 0 ? res : 2 - res;
}

/** P(Z <= z) for a standard normal. */
export function normalCdf(z: number): number {
  if (Number.isNaN(z)) return NaN;
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  return 0.5 * erfc(-z / Math.SQRT2);
}

/** P(Z >= z) for a standard normal (upper tail, computed without 1 − cdf
 *  cancellation). */
export function normalSf(z: number): number {
  if (Number.isNaN(z)) return NaN;
  if (z === Infinity) return 0;
  if (z === -Infinity) return 1;
  return 0.5 * erfc(z / Math.SQRT2);
}

/** ln Γ(x) for x > 0 (Lanczos, g = 7, n = 9; relative error ~1e-15). */
export function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection: Γ(x)Γ(1 − x) = π / sin(πx).
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  }
  const xx = x - 1;
  let a = c[0]!;
  const t = xx + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the regularized incomplete beta (modified Lentz). */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAX_ITER = 300;
  const EPS = 1e-15;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnFront =
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(lnFront);
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a;
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** P(T >= t) for Student's t with `df` degrees of freedom. `df` of Infinity
 *  (or non-finite) falls back to the normal. */
export function studentTSf(t: number, df: number): number {
  if (Number.isNaN(t)) return NaN;
  if (!Number.isFinite(df) || df > 1e6) return normalSf(t);
  if (df <= 0) return NaN;
  const x = df / (df + t * t);
  const tail = 0.5 * regularizedBeta(x, df / 2, 0.5);
  return t >= 0 ? tail : 1 - tail;
}

/** Two-sided 97.5th-percentile t quantile, by bisection on {@link studentTSf}. */
export function tQuantile975(df: number): number {
  if (!Number.isFinite(df) || df > 1e6) return 1.959963984540054;
  let lo = 0;
  let hi = 700;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (studentTSf(mid, df) > 0.025) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function logChoose(n: number, k: number): number {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/** P(X <= k) for X ~ Binomial(n, p), summed exactly in log space. */
export function binomialCdf(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  const lp = Math.log(p);
  const lq = Math.log(1 - p);
  let s = 0;
  for (let i = 0; i <= k; i++) s += Math.exp(logChoose(n, i) + i * lp + (n - i) * lq);
  return Math.min(1, s);
}

/** P(X >= k) for X ~ Binomial(n, p). */
export function binomialSf(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const lp = Math.log(p);
  const lq = Math.log(1 - p);
  let s = 0;
  for (let i = k; i <= n; i++) s += Math.exp(logChoose(n, i) + i * lp + (n - i) * lq);
  return Math.min(1, s);
}

/** P(X <= k) for X ~ Poisson(mu). */
export function poissonCdf(k: number, mu: number): number {
  if (k < 0) return 0;
  if (mu <= 0) return 1;
  let s = 0;
  const lmu = Math.log(mu);
  for (let i = 0; i <= k; i++) s += Math.exp(i * lmu - mu - logGamma(i + 1));
  return Math.min(1, s);
}

/** P(X >= k) for X ~ Poisson(mu). */
export function poissonSf(k: number, mu: number): number {
  if (k <= 0) return 1;
  return Math.max(0, 1 - poissonCdf(k - 1, mu));
}

/**
 * Exact (Garwood) 95% interval for a Poisson mean given `k` observed events:
 * the lower bound solves P(X >= k | L) = 0.025, the upper P(X <= k | U) =
 * 0.025 — the χ² form in 02 §11, found by bisection so no χ² quantile table
 * is needed.
 */
export function poissonExactInterval(k: number): { low: number; high: number } {
  const target = 0.025;
  const solve = (f: (mu: number) => number, increasing: boolean): number => {
    let lo = 0;
    let hi = Math.max(10, k * 3 + 20);
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const v = f(mid);
      if (increasing ? v < target : v > target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const low = k <= 0 ? 0 : solve((mu) => poissonSf(k, mu), true);
  const high = solve((mu) => poissonCdf(k, mu), false);
  return { low, high };
}
