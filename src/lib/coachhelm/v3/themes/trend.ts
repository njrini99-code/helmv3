/**
 * ============================================================================
 * CoachHelm v3 · THEMES — per-category Strokes-Gained TREND (PLAY G)
 * ----------------------------------------------------------------------------
 * PURE, deterministic read-time helper. Takes a player's per-round SG series
 * and, for each of the 4 SG categories, computes an HONEST direction
 * (improving / declining / steady) by comparing a RECENT window of rounds to a
 * PRIOR window. NO IO, NO 'use server', NO Date.now / Math.random.
 *
 * SG SIGN CONVENTION (important — the OPPOSITE of `classifyScoringTrend`):
 *   For strokes-gained, HIGHER is BETTER. So a RISING average means the player
 *   is GAINING more strokes → `improving`. A FALLING average → `declining`.
 *   (Scoring trend uses lower-is-better, where a falling score is improving;
 *    we are deliberately the inverse here.)
 *
 * HONESTY RULES:
 *   - A category needs ≥ {@link MIN_WINDOW} real (non-null) SG samples in BOTH
 *     the recent AND the prior window, or it gets NO trend (we never call a
 *     direction off 1 round, or off only-recent / only-prior data).
 *   - `steady` when |recentAvg − priorAvg| < {@link STEADY_THRESHOLD}; only a
 *     materially-different mean reads as a direction.
 *   - Categories with no qualifying window are simply ABSENT from the output
 *     map (never a fabricated trend).
 *
 * Maps each SG category → its per-round `golf_rounds` SG column:
 *   putting    → strokes_gained_putting
 *   approach   → strokes_gained_approach
 *   tee        → strokes_gained_tee
 *   short_game → strokes_gained_around_green
 * The 3 outcome categories (scoring / course_management / pressure) have no SG
 * metric and therefore never receive a trend.
 * ========================================================================== */

import type { InsightCategory } from '@/lib/coachhelm/v2/insights/types';
import type { ThemeTrend, ThemeTrendDirection } from '@/lib/coachhelm/v3/themes/types';

/**
 * Minimum number of REAL (non-null, finite) SG samples required in EACH of the
 * recent and prior windows for a category to get a trend. Below this we return
 * no trend rather than over-claim a direction off too-few rounds.
 */
export const MIN_WINDOW = 3;

/**
 * MAXIMUM window size (in qualifying rounds) on EACH side of the recent-vs-prior
 * split. We split the qualifying series into a recent half and a prior half,
 * each capped at this many rounds — so the most-recent up-to-WINDOW rounds form
 * the RECENT window and the up-to-WINDOW before them form the PRIOR window.
 *
 * The split is BALANCED (recent and prior are the same size) so the comparison
 * is apples-to-apples: with 6 qualifying rounds → 3 recent vs 3 prior; with ≥10
 * → 5 vs 5. Older rounds beyond 2*WINDOW are ignored for the trend.
 */
export const WINDOW = 5;

/**
 * |Δmean| (strokes/round) below which the two windows are statistically
 * indistinguishable for our purposes → `steady`. Roughly the noise floor of a
 * per-category SG average over a handful of college rounds.
 */
export const STEADY_THRESHOLD = 0.15;

/**
 * A single round's per-category SG beyond this (per 18 holes) is not golf: the
 * best Tour rounds gain about 10 strokes in total, not in one category. Such a
 * sample is a mis-stored round (a nine-hole score saved as 18 holes produced
 * +17.9 off the tee) and is left out of the trend rather than headlined.
 */
export const MAX_PLAUSIBLE_ROUND_SG = 10;

/** Direction of a per-category SG trend — canonical definition lives in `./types`;
 *  re-exported here so existing `import { ThemeTrendDirection } from './trend'` callers keep working. */
export type { ThemeTrendDirection };

/**
 * One per-round SG sample. Each SG field is the round's per-round strokes-gained
 * for that category (the raw `golf_rounds.strokes_gained_*` value), nullable
 * because a round may not have computed SG for every category.
 *
 * ORDER CONTRACT: the input array MUST be ordered NEWEST-FIRST (index 0 is the
 * most recent round), matching the `order('round_date', { ascending: false })`
 * the delivery layer already uses. The helper is robust to any extra fields.
 */
export interface SgRoundSample {
  /** ISO round date — carried for documentation/debugging; the helper does NOT
   *  re-sort on it (it trusts the newest-first order contract). */
  date?: string | null;
  sgPutting: number | null;
  sgApproach: number | null;
  sgTee: number | null;
  sgAroundGreen: number | null;
  /** Holes the round covered. A partial round's SG is scaled to 18 holes so a
   *  nine-hole round (half the strokes gained by construction) does not read
   *  as a jump when it sits next to 18-hole rounds. Absent or null = 18. */
  holes?: number | null;
}

/** Per-18 scale for a round: 18 / holes for a partial round, 1 otherwise. */
function per18(holes: number | null | undefined): number {
  return typeof holes === 'number' && Number.isFinite(holes) && holes > 0 && holes < 18 ? 18 / holes : 1;
}

/** A category that has an SG field, and which field of {@link SgRoundSample} it reads. */
type SgField = keyof Pick<
  SgRoundSample,
  'sgPutting' | 'sgApproach' | 'sgTee' | 'sgAroundGreen'
>;
type SgCategory = 'putting' | 'approach' | 'tee' | 'short_game';

/** The 4 SG categories paired with their per-round SG field. Outcome categories
 *  (scoring / course_management / pressure) are intentionally absent. */
const SG_CATEGORY_FIELDS: ReadonlyArray<{ category: SgCategory; field: SgField }> = [
  { category: 'putting', field: 'sgPutting' },
  { category: 'approach', field: 'sgApproach' },
  { category: 'tee', field: 'sgTee' },
  { category: 'short_game', field: 'sgAroundGreen' },
];

/** Arithmetic mean of a non-empty number array. */
function mean(xs: readonly number[]): number {
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/**
 * Compute per-category SG trends from a NEWEST-FIRST per-round SG series.
 *
 * For each SG category independently:
 *   1. Collect that category's non-null, finite samples IN ORDER (newest first),
 *      each scaled to 18 holes (a nine-hole round's SG is doubled), skipping
 *      any beyond {@link MAX_PLAUSIBLE_ROUND_SG}.
 *   2. BALANCED split: window size = min(WINDOW, floor(available / 2)). The
 *      most-recent `size` samples form the RECENT window; the `size` before
 *      them form the PRIOR window (recent and prior are always equal-sized, so
 *      the comparison is apples-to-apples). Samples beyond 2*size are ignored.
 *   3. If `size` < {@link MIN_WINDOW} (i.e. fewer than 2*MIN_WINDOW qualifying
 *      samples) → no trend for this category (absent from the result).
 *   4. `delta = recentAvg − priorAvg`. |delta| < {@link STEADY_THRESHOLD} →
 *      `steady`; delta > 0 (SG rising, higher is better) → `improving`;
 *      delta < 0 → `declining`.
 *
 * PURE + deterministic: identical input → identical output. Never throws on a
 * short, empty, or all-null series (such categories are simply absent).
 */
export function computeSgTrends(
  rounds: readonly SgRoundSample[],
): Partial<Record<InsightCategory, ThemeTrend>> {
  const out: Partial<Record<InsightCategory, ThemeTrend>> = {};
  if (!Array.isArray(rounds) || rounds.length === 0) return out;

  for (const { category, field } of SG_CATEGORY_FIELDS) {
    // 1. Pull this category's real samples, preserving the newest-first order.
    const series: number[] = [];
    for (const r of rounds) {
      const v = r?.[field];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const scaled = v * per18(r.holes);
      if (Math.abs(scaled) <= MAX_PLAUSIBLE_ROUND_SG) series.push(scaled);
    }

    // 2. BALANCED split: equal-sized recent vs prior windows, each capped at
    //    WINDOW. With 6 samples → 3 vs 3; with ≥10 → 5 vs 5.
    const size = Math.min(WINDOW, Math.floor(series.length / 2));

    // 3. Min-window guard — honest: never a trend off too-few rounds. Requires at
    //    least 2*MIN_WINDOW qualifying samples so each window has ≥ MIN_WINDOW.
    if (size < MIN_WINDOW) continue;

    const recent = series.slice(0, size);
    const prior = series.slice(size, size * 2);

    // 4. Classify on the difference of means. SG up = improving (higher is better).
    const recentAvg = mean(recent);
    const priorAvg = mean(prior);
    const delta = recentAvg - priorAvg;

    let direction: ThemeTrendDirection;
    if (Math.abs(delta) < STEADY_THRESHOLD) {
      direction = 'steady';
    } else if (delta > 0) {
      direction = 'improving';
    } else {
      direction = 'declining';
    }

    out[category] = {
      direction,
      recentAvg,
      priorAvg,
      delta,
      recentN: recent.length,
      priorN: prior.length,
    };
  }

  return out;
}
