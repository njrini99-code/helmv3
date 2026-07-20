/**
 * Per-hole sample floor for worst/best-hole ranking. A hole played once (or
 * twice) has a `timesPlayed` too thin to call "toughest" or "easiest" — one
 * blow-up or one lucky birdie shouldn't crown a hole. `rankHoleAnalyses`
 * filters `holes` down to those meeting `minPlays` BEFORE ranking, so a
 * single-play hole never appears in `worstHoles`/`bestHoles` even if it has
 * the most extreme `averageToPar` in the set.
 */

import type { HoleAnalysis } from '@/app/golf/actions/stats-data-types';

/** Fewer plays than this and a hole's average-to-par is noise, not a ranking. */
export const DEFAULT_MIN_PLAYS = 3;

/** Worst/best lists are capped at 5 — the UI (ScoringDrill) renders a top-5 list. */
const RANKED_LIST_SIZE = 5;

export interface RankedHoleAnalyses {
  worstHoles: HoleAnalysis[];
  bestHoles: HoleAnalysis[];
}

/**
 * Filters `holes` to those with `timesPlayed >= minPlays`, then returns the
 * top/bottom `RANKED_LIST_SIZE` by `averageToPar` — worst first (highest
 * to-par) and best first (lowest to-par). Holes under the floor are excluded
 * from both lists entirely (not just pushed down).
 */
export function rankHoleAnalyses(
  holes: HoleAnalysis[],
  minPlays: number = DEFAULT_MIN_PLAYS,
): RankedHoleAnalyses {
  const qualified = holes.filter((h) => h.timesPlayed >= minPlays);
  const sortedByToPar = [...qualified].sort((a, b) => b.averageToPar - a.averageToPar);
  const worstHoles = sortedByToPar.slice(0, RANKED_LIST_SIZE);
  const bestHoles = [...sortedByToPar].reverse().slice(0, RANKED_LIST_SIZE);
  return { worstHoles, bestHoles };
}
