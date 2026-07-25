/**
 * ============================================================================
 * computeSeriesTrend — THE canonical series → delta → verdict path
 * ----------------------------------------------------------------------------
 * AUDIT-0724/stats-visual-accuracy.md findings #2, #6, #7: a KPI card's
 * Sparkline and its MetricCard delta chip were independently classifying the
 * SAME oldest→newest series with TWO DIFFERENT algorithms and could — and
 * did — visibly contradict each other on the same card:
 *
 *   • Coach GIR% card, series [61, 78, 72, 50, 61]: Sparkline diffed the
 *     ENDPOINTS (61 − 61 = 0) and drew "flat"; the delta chip was fed a
 *     locally-computed split-half average (avg(72,50,61)=61.0 vs
 *     avg(61,78)=69.5, Δ=−8.5) and rendered a red "declining" pill right
 *     next to it — same card, same array, contradictory verdicts.
 *   • Player Putts/Rd card, series [32, 38, 32, 33, 35]: same architecture
 *     bug, but the two algorithms didn't just disagree on confidence, they
 *     flipped SIGN — endpoint diff (35−32=+3, putts rose = worse) said
 *     "declining"; split-half avg (33.33 vs 35.0, Δ=−1.67, putts fell on
 *     average = better) said "improving".
 *
 * THE DEFENSIBLE ALGORITHM: split-half average, not endpoint diff.
 *   Endpoint diff keeps only the FIRST and LAST sample and throws every
 *   other point away, so a 5-point series whose last value happens to equal
 *   its first ("61 → 61") reads as a confident "flat" even when the series
 *   visibly swung ±20 points in between — the plotted line and the verdict
 *   would be telling two different stories about the same shape. Split-half
 *   average (recent-half mean vs older-half mean) is ALSO what this repo's
 *   own SERVER-side qualitative `trend` field already uses (`computeTrend()`
 *   / `computeTrendHigherIsBetter()` in dashboard-data.ts) — reusing the
 *   same split client-side means this number can never contradict the
 *   direction the payload already shipped, and a single noisy/short round
 *   (e.g. a rain-shortened 9-hole round with a tiny GIR denominator) gets
 *   smoothed into its half instead of swinging the whole verdict on its own.
 *
 *   A magnitude deadzone (`flatThreshold`) still applies ON TOP of the
 *   split-half average — the audit explicitly calls out that a series this
 *   noisy (endpoint-equals-start, big middle swing) shouldn't claim
 *   "improving"/"declining" with more confidence than the data supports.
 *   Callers size a threshold to the metric's own noise floor and anything
 *   under it reads `flat` regardless of sign — the same deadzone contract
 *   `classifyTrend` already exposes, which this function delegates to for
 *   the actual verdict rather than re-deriving direction ad hoc.
 *
 * Both the Sparkline's color and the MetricCard delta chip's tone + printed
 * number MUST be derived from ONE call to this function on the SAME series —
 * never two independently-computed deltas — so they can never contradict
 * again. See FairwayCoachDashboard.tsx / FairwayPlayerDashboard.tsx for the
 * wiring: the `direction` this returns is handed straight to
 * `<Sparkline direction={...}>` (overriding its own internal endpoint-diff
 * fallback, which only fires when no pre-computed trend exists), and `value`
 * is handed straight to `<MetricCard delta={{ value: ... }}>`.
 * ============================================================================
 */

import { classifyTrend, type GoodDirection, type TrendDirection } from './TrendChip';

/** A trend reduced from a whole series to ONE delta + ONE verdict, plus the
 *  real point count it was computed over (so a chip's window label never
 *  claims a depth the data can't back). */
export interface SeriesTrend {
  /** Split-half-average delta (recent-half mean − older-half mean), in the
   *  series' own units — the ONE number both the sparkline color and the
   *  delta chip's printed value must derive from. */
  value: number;
  /** Classified via the shared `classifyTrend()` — never re-derived ad hoc. */
  direction: TrendDirection;
  /** How many finite points fed the computation. */
  points: number;
}

export interface ComputeSeriesTrendOptions {
  /** Which way the raw number is GOOD (see `classifyTrend`). Default 'up'. */
  goodDirection?: GoodDirection;
  /** Magnitude deadzone below which the split-half delta reads `flat`
   *  regardless of sign. Defaults to `0` (any nonzero split-half delta is a
   *  trend) — callers with a noisy metric should pass a real threshold. */
  flatThreshold?: number;
  /**
   * Minimum finite points required to trust a split-half comparison — fewer
   * returns `null` rather than a shaky read. Defaults to `3` (mirrors the
   * KPI row's own "Need 3+ rounds" honesty gate); never allowed below `2`
   * (a split needs at least one point on each side).
   */
  minPoints?: number;
}

/**
 * Reduce an oldest→newest series to ONE trend: a split-half-average delta
 * plus its classified verdict. Returns `null` when there aren't enough
 * finite points to trust a split-half read — callers should fall back to
 * their own insufficient-data treatment (an honest absence, never a
 * confident verdict computed off a shaky 1-2 point sample).
 */
export function computeSeriesTrend(
  series: ReadonlyArray<number> | null | undefined,
  options: ComputeSeriesTrendOptions = {},
): SeriesTrend | null {
  const { goodDirection = 'up', flatThreshold = 0, minPoints = 3 } = options;
  if (!series) return null;

  const finite = series.filter((v): v is number => Number.isFinite(v));
  if (finite.length < Math.max(2, minPoints)) return null;

  const mid = Math.floor(finite.length / 2);
  const olderHalf = finite.slice(0, mid); // series is oldest → newest
  const recentHalf = finite.slice(mid);
  if (olderHalf.length === 0 || recentHalf.length === 0) return null;

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const value = avg(recentHalf) - avg(olderHalf);
  const direction = classifyTrend(value, { goodDirection, flatThreshold });

  return { value, direction, points: finite.length };
}
