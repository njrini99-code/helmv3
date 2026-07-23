/**
 * ============================================================================
 * Canonical player COMPOSITE RATING (0-100) + trend.
 * ----------------------------------------------------------------------------
 * Before this module existed, the coach per-player deep-dive
 * (`/dashboard/players/[id]/game`) computed the SAME player's headline
 * "composite rating" TWO different ways depending on which tab was open:
 *
 *   1. Game Fingerprint tab — `computeComposite()` in `player-fingerprint.ts`:
 *      preferred `golf_player_stats_cache.scoring_average_vs_par` (a
 *      DB-materialized rolling average of unspecified recency window) when
 *      present, else fell back to the mean `score_to_par` across every
 *      fetched round (not just the recent ones, no 9-hole normalization). No
 *      penalty for active severe coaching patterns.
 *   2. Scouting Report tab — `computeCompositeRating()` in the old
 *      `players/[playerId]/composite-rating.ts`: always used the 5 MOST
 *      RECENT rounds only, correctly normalized 9-hole rounds to an
 *      18-hole-equivalent, and subtracted a capped penalty for active
 *      critical/high-severity patterns (`golf_patterns_v2`).
 *
 * A coach could flip between the two tabs for the SAME player at the SAME
 * moment and see two different composite numbers — undermining trust in the
 * number entirely (Wave 2 audit, `player-fingerprint.ts:820`).
 *
 * THE CANONICAL CHOICE — formula #2 (recent-rounds + severe-pattern penalty)
 * wins, for three reasons:
 *
 *   - RECENCY: a coach prepping a 1:1 wants to know how the player is
 *     playing NOW, not a possibly-stale cache average over an unspecified
 *     window. Deriving strictly from "the same rounds array the caller
 *     already fetched" also means every call site that feeds this function
 *     the same rounds/patterns gets the SAME number, with no dependency on
 *     whether `golf_player_stats_cache` happens to be freshly refreshed —
 *     which is exactly what makes the two tabs agree.
 *   - HONESTY ABOUT SHAPE: the 9-hole normalization in formula #2 was a real
 *     bug fix formula #1 never had — an un-normalized 9-hole `score_to_par`
 *     silently dragged the naive-average fallback toward par.
 *   - COACHING RELEVANCE: the severe-pattern penalty is KEPT. A player
 *     scoring fine on paper but carrying active critical/high-severity
 *     patterns (e.g. a repeating driver miss under pressure) is not "fine" —
 *     that is exactly the information a coach opens this page to see, and
 *     dropping it would make the composite less useful, not more honest.
 *     P2-16's original guarantee is preserved unchanged: an ACTIVE FOCUS
 *     AREA (a coaching *intention*) is NOT an input, only observed patterns.
 *
 * `trend` — an independent "is the score MOVING" signal, not part of the
 * 0-100 rating itself — is derived through the ALREADY-canonical windowed
 * classifier in `@/lib/coachhelm/trend` (#914) rather than a third
 * hand-rolled threshold, so a player's rating-trend arrow and every other
 * trend arrow in the app (roster, Team Stats, Team Pulse) read the same
 * delta the same way.
 * ========================================================================== */

import { computeSeriesTrend } from './trend';

/** Only the round fields the rating reads. */
export interface CompositeRoundInput {
  score_to_par: number | null;
  holes_played: number | null;
}

/** Only the pattern fields the rating reads. */
export interface CompositePatternInput {
  severity: string | null;
}

export interface CompositeRatingResult {
  /**
   * 0-100, or `null` when the player has no recorded rounds — the caller
   * renders an honest "insufficient data" state, never a fabricated 50/80.
   */
  rating: number | null;
  /** Independent "is the score moving" signal — see module doc. */
  trend: 'up' | 'flat' | 'down';
  /** How many rounds were available — the honest sample size a caller can
   *  render as "N rounds". */
  rounds_in_calculation: number;
}

/** Recent-window size for the score component AND the trend classifier —
 *  the same 5-round window `@/lib/coachhelm/trend`'s TREND_WINDOW_SIZE uses. */
const RECENT_WINDOW = 5;

/** |Δ over-par strokes| below this reads as a flat trend, not real movement
 *  (mirrors the pre-unification fallback's own 1-stroke threshold). */
const TREND_THRESHOLD = 1;

/**
 * Composite performance rating (0-100) from observed results, plus an
 * independent trend direction.
 *
 * `rounds` MUST be ordered MOST-RECENT-FIRST (both call sites already fetch
 * rounds this way — `.order('round_date', { ascending: false })`).
 *
 * An ACTIVE FOCUS AREA is a coaching *intention*, not measured improvement —
 * intentionally NOT an input here (P2-16). The rating derives strictly from
 * observed results, minus a penalty for severe observed patterns.
 */
export function computeCompositeRating(
  rounds: CompositeRoundInput[],
  patterns: CompositePatternInput[] = [],
): CompositeRatingResult {
  if (rounds.length === 0) {
    return { rating: null, trend: 'flat', rounds_in_calculation: 0 };
  }

  // ---- score component: recent-5 scoring relative to par ------------------
  const recentRounds = rounds.slice(0, RECENT_WINDOW);
  let scoreComponent = 50;
  const scoringDiffs = recentRounds
    .filter((r) => r.score_to_par != null)
    .map((r) => (r.score_to_par ?? 0) / (r.holes_played === 9 ? 0.5 : 1));

  if (scoringDiffs.length > 0) {
    const avgOverPar = scoringDiffs.reduce((a, b) => a + b, 0) / scoringDiffs.length;
    // +0 → 80, +10 → 50, +20 → 20, −5 → 95
    scoreComponent = Math.max(0, Math.min(100, 80 - avgOverPar * 3));
  }

  // ---- penalty for severe observed patterns --------------------------------
  const severeCount = patterns.filter((p) => p.severity === 'critical' || p.severity === 'high').length;
  const patternPenalty = Math.min(20, severeCount * 5);

  const rating = Math.round(Math.max(0, Math.min(100, scoreComponent - patternPenalty)));

  // ---- trend: the canonical windowed classifier over score_to_par ---------
  const series = rounds
    .filter((r): r is CompositeRoundInput & { score_to_par: number } => r.score_to_par != null)
    .map((r) => r.score_to_par);
  const { trend: verdict, hasSignal } = computeSeriesTrend(series, {
    lowerIsBetter: true,
    threshold: TREND_THRESHOLD,
    windowSize: RECENT_WINDOW,
  });
  const trend: CompositeRatingResult['trend'] = !hasSignal
    ? 'flat'
    : verdict === 'improving'
      ? 'up'
      : verdict === 'declining'
        ? 'down'
        : 'flat';

  return { rating, trend, rounds_in_calculation: rounds.length };
}
