
/*
 * Which rounds a Clubhouse figure counts (Q-123).
 *
 * `isCountableRound` (lib/golf/round-countable.ts, shared with the rest of the app) wants every declared hole scored, so a round posted
 * as a total only (no nines, no golf_holes) is never countable there. The owner's rule for Clubhouse: such a round counts in the SCORE
 * figures (scoring average, to par, the trend and day series, form, the rounds list, the personal best score, the Home brief, the
 * team's scoring) and never in a HOLE-level one (birdies, pars, doubles, greens, fairways, putts, scrambling, strokes gained, scoring
 * by par, what an average round looks like, putting). The shared rule is left as it is; this is the Clubhouse's own notion on top of it.
 *
 * Pure: no Supabase, no React.
 */

// The rule itself lives in lib (shared with CoachHelm's program pulse); Clubhouse re-exports it.
export { isScoreCountable, isTotalOnlyCountable } from '@/lib/golf/round-score-countable';

/**
 * A loaded round that counts in the hole-level figures too. `loadSeasonRounds` marks the total-only ones (`total_only`); a round with no
 * mark is read as hole by hole, which is what every other source of a round row is.
 */
export function hasHoleScores(r: { total_only?: boolean }): boolean {
  return r.total_only !== true;
}

/**
 * A round's putts as the Stats pages count them (`cachedPutts`): a round whose holes carry no putt count is written 0 putts (or, once
 * 20261017110000 is applied, none), and the Fairway pages leave such a round out of putts per round, so 0 is "not recorded", never a
 * round holed in no putts. The cache's total is the round's own whenever it has one, so this is the same basis read from golf_rounds.
 */
export function recordedPutts(putts: number | null | undefined): number | null {
  return typeof putts === 'number' && putts > 0 ? putts : null;
}

/** The rounds the hole-level figures read: the window's rounds without the ones posted as a total only. Order is kept. */
export function holeRounds<T extends { total_only?: boolean }>(rounds: readonly T[]): T[] {
  return rounds.filter(hasHoleScores);
}

/**
 * "Hole stats from 3 of 5 rounds": what a hole-level figure says under it when the window holds rounds it cannot read. Null when every
 * round has its holes (nothing to say).
 */
export function holeCoverage(holeCount: number, windowCount: number): string | null {
  if (holeCount >= windowCount) return null;
  return `Hole stats from ${holeCount} of ${windowCount} ${windowCount === 1 ? 'round' : 'rounds'}`;
}
