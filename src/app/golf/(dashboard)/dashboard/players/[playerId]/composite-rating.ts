/**
 * ============================================================================
 * Player Insight · composite-rating  (pure, testable)
 * ----------------------------------------------------------------------------
 * The coach Player Insight composite performance rating, extracted from the
 * route page so it can be unit-tested deterministically (P2-16 acceptance
 * tests). Pure: no IO, no Supabase, no React.
 *
 * P2-16 — "Coach player drill-down uses invented ratings":
 *   • A player with no recorded rounds returns `null` (the caller renders an
 *     honest "awaiting first round" state — never a fabricated 50).
 *   • An ACTIVE FOCUS AREA is a coaching *intention*, not measured improvement.
 *     It must NOT raise the performance score (the old `progressBonus` made a
 *     player look better the moment a coach opened a development plan). The
 *     rating now derives strictly from observed results: recent scoring relative
 *     to par, minus a penalty for severe observed patterns.
 * ========================================================================== */

/** Only the round fields the rating reads. */
export interface CompositeRoundInput {
  score_to_par: number | null;
  holes_played: number | null;
}

/** Only the pattern fields the rating reads. */
export interface CompositePatternInput {
  severity: string | null;
}

/**
 * Composite performance rating (0–100) from observed results only.
 *
 * @returns a 0–100 integer, or `null` when the player has no recorded rounds
 *          (so the caller can show "insufficient data" instead of a synthetic
 *          50). Active focus areas intentionally do NOT factor in.
 */
export function computeCompositeRating(
  rounds: CompositeRoundInput[],
  patterns: CompositePatternInput[],
): number | null {
  if (rounds.length === 0) return null;

  // Score based on recent scoring relative to par
  const recentRounds = rounds.slice(0, 5);
  let scoreComponent = 50;
  const scoringDiffs = recentRounds
    .filter((r) => r.score_to_par != null)
    .map((r) => (r.score_to_par ?? 0) / (r.holes_played === 9 ? 0.5 : 1));

  if (scoringDiffs.length > 0) {
    const avgOverPar = scoringDiffs.reduce((a, b) => a + b, 0) / scoringDiffs.length;
    // +0 → 80, +10 → 50, +20 → 20, -5 → 95
    scoreComponent = Math.max(0, Math.min(100, 80 - avgOverPar * 3));
  }

  // Penalty for severe observed patterns
  const severeCount = patterns.filter((p) => p.severity === 'critical' || p.severity === 'high').length;
  const patternPenalty = Math.min(20, severeCount * 5);

  return Math.round(Math.max(0, Math.min(100, scoreComponent - patternPenalty)));
}
