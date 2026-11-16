import type { ChRound } from '../data/season';
import type { ChRoundCache } from '../data/stats-common';

/**
 * A stats row (`golf_round_stats_cache`) for each round, copied from the round's own columns: for tests whose rounds carry their figures.
 * Clubhouse reads greens, fairways and putts from the stats row only (launch readiness DF-P-01), so a fixture that sets them on the round
 * hands them over here.
 */
export function statsRowsOf(rounds: readonly ChRound[]): Map<string, ChRoundCache> {
  return new Map(
    rounds.map((r) => [
      r.id,
      {
        round_id: r.id,
        greens_hit: r.total_gir,
        greens_total: r.total_gir_possible,
        fairways_hit: r.total_fairways_hit,
        fairways_total: r.total_fairways,
        total_putts: r.total_putts,
        scramble_attempts: null,
        scrambles_converted: null,
        birdies: null,
        eagles: null,
        sand_attempts: null,
        sand_saves: null,
        three_putts: null,
        penalty_strokes: null,
        double_bogeys: null,
        triple_plus: null,
      },
    ]),
  );
}
