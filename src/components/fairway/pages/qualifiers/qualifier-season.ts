/**
 * ============================================================================
 * Fairway · pages/qualifiers · season averages (pure, server-side input)
 * ----------------------------------------------------------------------------
 * The leaderboard's coach-only "season avg" line: each entrant's scoring
 * average over their OTHER countable 18-hole rounds in the season, by the
 * same countable rule as every headline average (`aggregateCountableRounds`:
 * complete 9/18-hole rounds with their nines recorded, a plausible total,
 * a plausible SG: Total). This qualifier's own rounds are left out, so the
 * line compares the qualifier against the rest of the season.
 *
 * The route page reads the rows (status completed, not test, the season's
 * dates) and passes them here; the result is sent to a coach only.
 * ========================================================================== */

import { aggregateCountableRounds, type CountableRoundRow } from '@/lib/golf/countable-round-stats';

export interface SeasonRoundRow extends CountableRoundRow {
  player_id: string;
  qualifier_id: string | null;
}

export interface PlayerSeasonAverage {
  /** Mean 18-hole score over the countable rounds. */
  average: number;
  /** Countable 18-hole rounds behind it. */
  rounds: number;
}

export function seasonAveragesFromRounds(
  rows: ReadonlyArray<SeasonRoundRow>,
  qualifierId: string,
): Record<string, PlayerSeasonAverage> {
  const byPlayer = new Map<string, SeasonRoundRow[]>();
  for (const row of rows) {
    if (row.qualifier_id === qualifierId) continue;
    const list = byPlayer.get(row.player_id) ?? [];
    list.push(row);
    byPlayer.set(row.player_id, list);
  }

  const out: Record<string, PlayerSeasonAverage> = {};
  for (const [playerId, rounds] of byPlayer) {
    // aggregateCountableRounds reads rounds newest first.
    const newestFirst = [...rounds].sort((a, b) => b.round_date.localeCompare(a.round_date));
    const headline = aggregateCountableRounds(newestFirst);
    if (headline.scoringAverage !== null && headline.scoringAverageRounds > 0) {
      out[playerId] = { average: headline.scoringAverage, rounds: headline.scoringAverageRounds };
    }
  }
  return out;
}
