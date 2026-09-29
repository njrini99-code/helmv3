/**
 * Which roster players are CURRENT: a countable completed round in the last
 * `RECENT_PLAYER_WINDOW_DAYS` days.
 *
 * Team figures on the coach surfaces (category averages, team leak cards,
 * strokes available, chat coverage) are about the players who are playing.
 * The 2026-09 accuracy audit found 29 of 86 active roster members with no
 * round in 60 days still moving team means and team leak totals. Pure: the
 * caller reads the rounds (completed, non-test) and passes today's date.
 */
import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';

export const RECENT_PLAYER_WINDOW_DAYS = 60;

/** ISO date `days` before `todayIso` (both YYYY-MM-DD, UTC arithmetic). */
export function isoDaysBefore(todayIso: string, days: number): string {
  const d = new Date(`${todayIso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** First day of the recent window for `todayIso`. */
export function recentWindowStart(todayIso: string, days = RECENT_PLAYER_WINDOW_DAYS): string {
  return isoDaysBefore(todayIso, days);
}

export interface RecentRoundInput extends CountableRoundInput {
  player_id: string | null;
  round_date: string | null;
}

/** Players with at least one countable round on or after `sinceIso`. */
export function recentlyActivePlayerIds(rounds: readonly RecentRoundInput[], sinceIso: string): Set<string> {
  const out = new Set<string>();
  for (const r of rounds) {
    if (!r.player_id || !r.round_date) continue;
    if (r.round_date.slice(0, 10) < sinceIso) continue;
    if (!isCountableRound(r)) continue;
    out.add(r.player_id);
  }
  return out;
}
