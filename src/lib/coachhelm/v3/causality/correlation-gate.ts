/**
 * The significance gate behind CoachHelm's "moves with" relationships.
 *
 * Owner decision "honest correlation" (2026-09-28, audit rows 33/34):
 * `golf_causal_relationships` rows are CORRELATIONS within one player's own
 * rounds, not causes. A row is stored only when
 *
 *   - at least {@link MIN_PAIRED_ROUNDS} rounds carry both values,
 *   - the Pearson r has a two-sided t-test p-value whose Benjamini-Hochberg
 *     adjusted q (across that player's hypotheses in the same run) is below
 *     {@link FDR_Q}, and
 *   - |r| >= {@link MIN_ABS_R} (a significant but tiny r is not worth a card).
 *
 * The sign of r is kept (evidence.correlation). Hypotheses whose cause is an
 * arithmetic component of the score and whose effect is the score are not
 * tested at all ({@link isScoreArithmetic}): "more putts, higher score" is the
 * scorecard, not a finding.
 *
 * Pure and dependency-free so the engine (writer), the read action, the chain
 * composer and the panel all apply the same rule.
 */

/** Evidence `method` written by the engine for rows that passed this gate. */
export const CORRELATION_METHOD_VERSION = 'correlation_v1';
/** Minimum rounds with both values present. */
export const MIN_PAIRED_ROUNDS = 15;
/** Benjamini-Hochberg false-discovery rate per player per run. */
export const FDR_Q = 0.05;
/** Minimum |r| worth showing. */
export const MIN_ABS_R = 0.3;

/**
 * Read-path freshness (audit defect 3). A row is hidden when its player has no
 * completed non-test round inside this window...
 */
export const ACTIVE_PLAYER_WINDOW_DAYS = 60;
/** ...or when the engine has not re-confirmed it (updated_at) inside this window. */
export const MAX_ROW_AGE_DAYS = 60;

/** Score components: a correlation between one of these and score_to_par is arithmetic. */
const SCORE_COMPONENT_METRICS = new Set([
  'total_putts',
  'total_gir',
  'total_fairways_hit',
  'total_penalties',
]);
const SCORE_METRICS = new Set(['score_to_par', 'total_score']);

export function isScoreArithmetic(
  causeMetric: string | null | undefined,
  effectMetric: string | null | undefined,
): boolean {
  if (!causeMetric || !effectMetric) return false;
  return SCORE_COMPONENT_METRICS.has(causeMetric) && SCORE_METRICS.has(effectMetric);
}

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i]!;
    my += ys[i]!;
  }
  mx /= n;
  my /= n;
  let num = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    num += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }
  const den = Math.sqrt(sx * sy);
  return den === 0 ? 0 : num / den;
}

// ── Student t distribution via the regularized incomplete beta ────────────

function lnGamma(z: number): number {
  // Lanczos approximation (g = 7, n = 9).
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const x = z - 1;
  let a = c[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAX_ITER = 300;
  const EPS = 3e-14;
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

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(a, b, x)) / a;
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-sided p-value of a Student t statistic with `df` degrees of freedom. */
export function studentTTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  if (df <= 0) return 1;
  return regularizedIncompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** Two-sided critical value t* with P(|T| > t*) = alpha. */
export function studentTCritical(df: number, alpha = 0.05): number {
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (studentTTwoSidedP(mid, df) > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Two-sided p-value for H0: rho = 0, via t = r * sqrt((n-2)/(1-r^2)). */
export function correlationPValue(r: number, n: number): number {
  if (n < 3) return 1;
  const df = n - 2;
  if (Math.abs(r) >= 1) return 0;
  const t = r * Math.sqrt(df / (1 - r * r));
  return studentTTwoSidedP(t, df);
}

/** Benjamini-Hochberg adjusted q-values, returned in the input order. */
export function benjaminiHochberg(pValues: number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const q = new Array<number>(m).fill(1);
  let running = 1;
  for (let k = m - 1; k >= 0; k--) {
    const { p, i } = order[k]!;
    running = Math.min(running, (p * m) / (k + 1));
    q[i] = Math.min(1, running);
  }
  return q;
}

export function passesCorrelationGate(args: { r: number; n: number; q: number }): boolean {
  return (
    args.n >= MIN_PAIRED_ROUNDS &&
    Number.isFinite(args.r) &&
    Math.abs(args.r) >= MIN_ABS_R &&
    Number.isFinite(args.q) &&
    args.q < FDR_Q
  );
}

/**
 * Temporal precedence done properly: the CENTRED lag-1 cross-correlation
 * between the previous round's cause and the next round's effect, with its own
 * t-test. `supports` only when it is significant at 0.05 AND in the same
 * direction as the same-round correlation (`expectedSign`). Descriptive
 * evidence; it is not part of the storage gate.
 */
export function lagOneCrossCorrelation(
  cause: number[],
  effect: number[],
  expectedSign: number,
): { r: number; n: number; pValue: number; supports: boolean } {
  const prev = cause.slice(0, -1);
  const next = effect.slice(1);
  const n = Math.min(prev.length, next.length);
  if (n < 3) return { r: 0, n, pValue: 1, supports: false };
  const r = pearson(prev, next);
  const pValue = correlationPValue(r, n);
  const supports = pValue < 0.05 && r !== 0 && Math.sign(r) === Math.sign(expectedSign);
  return { r, n, pValue, supports };
}

/** Signed correlation evidence stored in `golf_causal_relationships.evidence`. */
export interface CorrelationEvidenceFields {
  method: string;
  correlation: number;
  sampleN: number;
  pValue: number;
  qValue: number;
}

/**
 * Pull the gate's fields back out of a stored evidence jsonb. Returns null for
 * a row written before this gate existed (no `method`), which readers treat as
 * not passing: it was never tested this way.
 */
export function readCorrelationEvidence(evidence: unknown): CorrelationEvidenceFields | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const e = evidence as Record<string, unknown>;
  if (e.method !== CORRELATION_METHOD_VERSION) return null;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const correlation = num(e.correlation);
  const sampleN = num(e.sampleN);
  const pValue = num(e.pValue);
  const qValue = num(e.qValue);
  if (correlation === null || sampleN === null || pValue === null || qValue === null) return null;
  return { method: CORRELATION_METHOD_VERSION, correlation, sampleN, pValue, qValue };
}
