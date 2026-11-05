import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { isScoreCountable } from '@/lib/golf/round-score-countable';
import { withCanonicalRoundTotal } from '@/lib/golf/round-total';
import { roundTypeFromDb } from '@/lib/golf/round-type-utils';

/*
 * Roster's season rule, for Ask. Code outside src/clubhouse may not import src/clubhouse/data, so this states the rule from the same lib
 * pieces: `countsForScoring`, `seasonStartDate`, `isFull18` and `loadSeasonRounds` in src/clubhouse/data/season.ts.
 * __tests__/season-reads.test.ts runs both over the same rows and fails if they part. If a third reader needs it, move it to lib and have
 * season.ts re-export it, as round-score-countable.ts does.
 */

export interface SeasonRound {
  id: string;
  player_id: string;
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  front_nine: number | null;
  back_nine: number | null;
  holes_played: number | null;
  total_putts: number | null;
  strokes_gained_total: number | null;
}

const COLUMNS = 'id, player_id, round_date, round_type, total_score, score_to_par, front_nine, back_nine, holes_played, total_putts, strokes_gained_total';

/** Practice stays out of an average. An unknown type reads as practice, a missing one does not. */
export function countsForScoring(r: { round_type: string | null }): boolean {
  return r.round_type == null || roundTypeFromDb(r.round_type) !== 'practice';
}

/** 1 August of this year from August on, else of last year, on the team's calendar. */
export function seasonStartDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(now);
  const year = Number(parts.find((x) => x.type === 'year')!.value);
  const month = Number(parts.find((x) => x.type === 'month')!.value);
  return `${month >= 8 ? year : year - 1}-08-01`;
}

export function isFull18(r: Pick<SeasonRound, 'holes_played' | 'total_score'>): boolean {
  return (r.holes_played ?? 18) === 18 && r.total_score != null;
}

/** The rounds a season average reads: full 18-hole countable rounds, practice left out. */
export const inSeasonAverage = (r: SeasonRound): boolean => isFull18(r) && countsForScoring(r);

/** Every round that counts in a score since `since`, with its canonical total. `error` means a page failed and nothing should be read from `rounds`. */
export async function loadCountedRounds(sb: SupabaseClient<Database>, playerIds: readonly string[], since: string): Promise<{ rounds: SeasonRound[]; error: boolean }> {
  const rows: SeasonRound[] = [];
  for (const ids of chunkIds(playerIds)) {
    const res = await fetchAllRowsResult<SeasonRound>((from, to) =>
      sb
        .from('golf_rounds')
        .select(COLUMNS)
        .in('player_id', ids)
        .eq('is_test', false)
        .eq('status', 'completed')
        .not('total_score', 'is', null)
        .gte('round_date', since)
        .order('round_date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: SeasonRound[] | null; error: { message: string } | null }>,
    );
    if (res.error) return { rounds: [], error: true };
    rows.push(...(res.data ?? []));
  }
  return { rounds: rows.filter((r) => r.total_score != null && isScoreCountable(r)).map(withCanonicalRoundTotal), error: false };
}
