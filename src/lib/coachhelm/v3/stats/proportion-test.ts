/**
 * DB-free statistical helpers for distance-controlled putt-bias detection.
 *
 * WHY: comparing make-% across BREAK directions without controlling distance is
 * a distance artifact. Verified in prod (Nick Rini): straight putts average
 * 1.5 ft (96.7% make) while left/right breakers sit at ~13-15 ft (~21% make),
 * so a naive straight-vs-break "gap" of ~76pp is entirely explained by length,
 * not green-reading. The honest comparison is LEFT-break vs RIGHT-break WITHIN
 * the same distance band, gated by effect size AND significance.
 */

/** Minimum makes/attempts per side before a directional claim is allowed. */
export const MIN_PUTTS_PER_SIDE = 15;
/** Minimum make-% gap (percentage points) for a coaching-grade claim. */
export const MIN_EFFECT_PP = 12;
/** Two-sided significance level. */
export const ALPHA = 0.05;

export interface DistanceBand {
  label: '4-6 ft' | '7-10 ft' | '11-20 ft' | '20+ ft';
  minFt: number;
  /** Exclusive upper bound; Infinity for the open top band. */
  maxFt: number;
}

export const DISTANCE_BANDS: readonly DistanceBand[] = [
  { label: '4-6 ft', minFt: 4, maxFt: 7 },
  { label: '7-10 ft', minFt: 7, maxFt: 11 },
  { label: '11-20 ft', minFt: 11, maxFt: 21 },
  { label: '20+ ft', minFt: 21, maxFt: Infinity },
] as const;

/**
 * Map a putt distance (feet) to its comparison band, or null when below the
 * shortest band (tap-ins / very short putts are not green-reading tests).
 */
export function bandFor(distFt: number): DistanceBand['label'] | null {
  if (!Number.isFinite(distFt) || distFt < DISTANCE_BANDS[0]!.minFt) return null;
  for (const b of DISTANCE_BANDS) {
    if (distFt >= b.minFt && distFt < b.maxFt) return b.label;
  }
  return null;
}

/** Standard normal CDF via the Abramowitz-Stegun 7.1.26 erf approximation. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

export interface ProportionTestResult {
  /** make%(A) - make%(B), percentage points (signed). */
  gapPp: number;
  /** Two-sided p-value of the pooled z-test. */
  pValue: number;
  /** True only when |gap| >= the effect floor AND both n >= the per-side floor AND p < ALPHA. */
  significant: boolean;
  reason: 'significant' | 'insufficient_n' | 'effect_too_small' | 'not_significant';
}

/**
 * Per-call override of the two module-level gates. Omitted fields fall back
 * to {@link MIN_PUTTS_PER_SIDE} / {@link MIN_EFFECT_PP} — existing callers
 * (PuttBiasGenerator) are unaffected. A caller with a different, still-honest
 * sample-size floor (e.g. a downhill-vs-level slope comparison measured to be
 * reliable at n>=8/side, per production data) passes its own `minPerSide`
 * without changing the break-direction gate's numbers.
 */
export interface ProportionTestOptions {
  minPerSide?: number;
  minEffectPp?: number;
}

/**
 * Pooled two-proportion z-test for makesA/nA vs makesB/nB.
 * Gates a directional claim on three independent conditions so a coach never
 * sees a "you struggle on X breaks" line off noise or an undersampled side.
 */
export function twoProportionZTest(
  makesA: number,
  nA: number,
  makesB: number,
  nB: number,
  opts?: ProportionTestOptions,
): ProportionTestResult {
  const minPerSide = opts?.minPerSide ?? MIN_PUTTS_PER_SIDE;
  const minEffectPp = opts?.minEffectPp ?? MIN_EFFECT_PP;
  const pA = nA > 0 ? makesA / nA : 0;
  const pB = nB > 0 ? makesB / nB : 0;
  const gapPp = (pA - pB) * 100;

  if (nA < minPerSide || nB < minPerSide) {
    return { gapPp, pValue: 1, significant: false, reason: 'insufficient_n' };
  }
  if (Math.abs(gapPp) < minEffectPp) {
    return { gapPp, pValue: 1, significant: false, reason: 'effect_too_small' };
  }

  const pPool = (makesA + makesB) / (nA + nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
  if (se === 0) {
    return { gapPp, pValue: 1, significant: false, reason: 'not_significant' };
  }
  const z = (pA - pB) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const significant = pValue < ALPHA;
  return {
    gapPp,
    pValue,
    significant,
    reason: significant ? 'significant' : 'not_significant',
  };
}
