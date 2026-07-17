/**
 * ============================================================================
 * Canonical player/team TREND classification.
 * ----------------------------------------------------------------------------
 * Part of #914 — before this module existed, FOUR surfaces each reimplemented
 * "is this player/category improving, steady, or declining" with a DIFFERENT
 * window size, a DIFFERENT minimum-sample floor, and a DIFFERENT threshold:
 *
 *   1. Brief category cards       (team-category-insights.ts)     — 5 vs 5 rounds, |Δ| < 0.5
 *   2. Players tab roster table   (development/page.tsx)          — DB trigger, 5 vs 5, |Δ| < 1.0 stroke
 *   3. Team Stats trajectory tile (stats/team/page.tsx)           — 5 vs 5 rounds (≥3 previous), no threshold applied at compute time
 *   4. Team Stats player cards    (FairwayTeamStats.tsx)          — same numbers as #3, |Δ| < 0.3 stroke
 *
 * Same-shaped data landed on different verdicts depending on which surface
 * you were looking at. This module is the ONE place "recent vs previous
 * average, is the move big enough to call a trend, which direction counts as
 * improving" lives — every surface that reports a trend must route its
 * classification through `classifyTrendDelta` (or `computeSeriesTrend` when it
 * still owns the raw per-round series) so the same underlying delta reads the
 * same verdict everywhere.
 * ========================================================================== */

export type TrendVerdict = 'improving' | 'stable' | 'declining';

export interface TrendResult {
  trend: TrendVerdict;
  /** recentAvg − previousAvg, in the metric's own units (NOT direction-adjusted). */
  delta: number;
  /**
   * False when there wasn't enough history to compute a real trend (fewer
   * than `minPrevious` previous-window samples) — `trend`/`delta` are the
   * honest "no signal yet" defaults (`'stable'` / `0`), NOT a real flat
   * reading. Callers that distinguish "genuinely steady" from "awaiting
   * data" (e.g. an em-dash vs a "Steady" chip) must check this rather than
   * treating `delta === 0` as a real zero-movement result.
   */
  hasSignal: boolean;
}

/** Canonical recent-vs-previous window: the last N rounds vs the N before those. */
export const TREND_WINDOW_SIZE = 5;

/** Canonical minimum number of "previous" samples required before a trend is
 *  asserted. One stale data point is not a trend — this mirrors the ≥3-sample
 *  floor used elsewhere in CoachHelm for "is this reading stable enough to
 *  speak with confidence" (e.g. the composite z-score sample-size guard). */
export const DEFAULT_MIN_PREVIOUS = 3;

export interface ClassifyTrendOptions {
  /** True when a LOWER value is the good direction (scoring average, putts/round). */
  lowerIsBetter: boolean;
  /** Minimum |delta| for the move to count as a trend rather than noise. */
  threshold: number;
}

/**
 * Classify a trend from a raw delta (recentAvg − previousAvg) given the
 * metric's threshold and whether lower values are better. This is the single
 * decision point every surface must share — a given delta always reads as
 * the same verdict everywhere, regardless of which page is asking.
 */
export function classifyTrendDelta(
  delta: number,
  { lowerIsBetter, threshold }: ClassifyTrendOptions,
): TrendVerdict {
  if (!Number.isFinite(delta) || Math.abs(delta) < threshold) return 'stable';
  const improving = lowerIsBetter ? delta < 0 : delta > 0;
  return improving ? 'improving' : 'declining';
}

export interface ComputeSeriesTrendOptions extends ClassifyTrendOptions {
  /** Recent/previous window size. Defaults to the canonical TREND_WINDOW_SIZE. */
  windowSize?: number;
  /** Minimum "previous" samples required. Defaults to DEFAULT_MIN_PREVIOUS. */
  minPrevious?: number;
}

/**
 * Canonical recent-vs-previous windowed trend for a per-round metric series.
 *
 * `series` MUST already be ordered MOST-RECENT-FIRST. Splits into the most
 * recent `windowSize` values ("recent") and the `windowSize` values before
 * those ("previous"); requires at least `minPrevious` previous values before
 * asserting a verdict. Returns `{ trend: 'stable', delta: 0 }` when there
 * isn't enough history yet — an honest "no trend signal", never a fabricated
 * verdict from one stray data point.
 */
export function computeSeriesTrend(
  series: number[],
  opts: ComputeSeriesTrendOptions,
): TrendResult {
  const windowSize = opts.windowSize ?? TREND_WINDOW_SIZE;
  const minPrevious = opts.minPrevious ?? Math.min(DEFAULT_MIN_PREVIOUS, windowSize);
  const recent = series.slice(0, windowSize);
  const previous = series.slice(windowSize, windowSize * 2);

  if (recent.length === 0 || previous.length < minPrevious) {
    return { trend: 'stable', delta: 0, hasSignal: false };
  }

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const prevAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
  const delta = recentAvg - prevAvg;

  return { trend: classifyTrendDelta(delta, opts), delta, hasSignal: true };
}
