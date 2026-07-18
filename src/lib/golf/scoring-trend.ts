/**
 * Canonical PLAYER SCORING trend — the "is this player's overall score
 * improving, steady, or declining" question, shared by the Team Stats
 * trajectory tile + player cards (FairwayTeamStats.tsx) and the CoachHelm
 * Players tab roster table (development/page.tsx). Part of #914.
 *
 * Both surfaces window the SAME way — last `TREND_WINDOW_SIZE` completed
 * rounds vs the `TREND_WINDOW_SIZE` before those, scores normalized to an
 * 18-hole equivalent so a 9-hole round doesn't skew the average — and
 * classify through the SAME canonical `classifyTrendDelta` threshold, so a
 * player who reads "declining" on one surface cannot read "improving" on
 * another for the same underlying rounds.
 */

import { computeSeriesTrend, type TrendResult } from '@/lib/coachhelm/trend';

/** Minimum |Δ normalized strokes| to call it a trend rather than round-to-round noise. */
export const SCORE_TREND_THRESHOLD = 0.3;

export interface ScoringRoundInput {
  total_score: number | null;
  holes_played: number | null;
}

/**
 * `roundsMostRecentFirst` MUST already be ordered most-recent-first
 * (round_date desc) — same convention `computeSeriesTrend` expects.
 * Rounds with no score are skipped (never coerced to 0); a round with an
 * unset `holes_played` is treated as a full 18.
 */
export function computeScoringTrendFromRounds(
  roundsMostRecentFirst: ScoringRoundInput[],
): TrendResult {
  const normalized: number[] = [];
  for (const r of roundsMostRecentFirst) {
    if (r.total_score == null) continue;
    const holes = r.holes_played ?? 18;
    if (holes <= 0) continue;
    normalized.push(Math.round(r.total_score * (18 / holes)));
  }
  return computeSeriesTrend(normalized, {
    lowerIsBetter: true,
    threshold: SCORE_TREND_THRESHOLD,
  });
}
