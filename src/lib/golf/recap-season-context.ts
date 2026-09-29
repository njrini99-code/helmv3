/**
 * The season figures a round recap compares a round against ("N strokes below
 * the season average", "sets a new low"), computed from the player's OTHER
 * countable, non-test rounds.
 *
 * Until 2026-09-28 the recap read these from `golf_player_stats_cache`, whose
 * trigger counts every completed round — including OD-03 `is_test` rounds and
 * the impossible Sep 17 card (91301a75: 37 over 18, −35). For that player the
 * cache held best_round 37 (real: 69) and an average of 72.55 (real: 74.26),
 * and the recap for the 37 itself read "37 on the card, 35.8 strokes below the
 * season average". Until the cache adopts the countable/is_test rule (a held
 * migration), the recap aggregates here instead.
 *
 * The round being recapped is left out of its own baseline, so "new low" can
 * fire and the average is the one the round is being compared against.
 *
 * Server only (takes the caller's RLS client). A failed read returns null:
 * the recap then makes no season comparison rather than a wrong one.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { aggregateCountableRounds, type CountableRoundRow } from '@/lib/golf/countable-round-stats';
import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';

export interface RecapSeasonContext {
  scoring_average: number | null;
  best_round: number | null;
  rounds_played: number | null;
}

/** Enough history for an average; a player past this is compared to their recent rounds. */
export const RECAP_SEASON_ROUND_LIMIT = 200;

const COLUMNS = 'id, round_date, status, holes_played, total_score, front_nine, back_nine, total_putts, is_test';

/**
 * Pure. `rounds` newest first. Drops `is_test` and non-countable rounds and the
 * recapped round itself; null when nothing is left to compare against.
 */
export function seasonContextFromRounds(
  rounds: ReadonlyArray<CountableRoundRow & { is_test?: boolean | null }>,
  excludeRoundId: string,
): RecapSeasonContext | null {
  const eligible = rounds.filter((r) => r.id !== excludeRoundId && r.is_test !== true);
  const headline = aggregateCountableRounds(eligible);
  if (headline.roundsCounted === 0) return null;
  return {
    scoring_average: headline.scoringAverage,
    best_round: headline.bestRound,
    rounds_played: headline.roundsCounted,
  };
}

/**
 * Season context for `round`, or null when the round itself is not countable
 * (an implausible or half-entered card must not be compared at all) or no
 * other countable round exists.
 */
export async function loadRecapSeasonContext(
  sb: SupabaseClient<Database>,
  round: CountableRoundInput & { id: string; player_id: string },
): Promise<RecapSeasonContext | null> {
  if (!isCountableRound(round)) return null;
  const { data, error } = await sb
    .from('golf_rounds')
    .select(COLUMNS)
    .eq('player_id', round.player_id)
    .eq('is_test', false)
    .eq('status', 'completed')
    .order('round_date', { ascending: false })
    .limit(RECAP_SEASON_ROUND_LIMIT);
  if (error || !data) return null;
  return seasonContextFromRounds(data as Array<CountableRoundRow & { is_test: boolean | null }>, round.id);
}
