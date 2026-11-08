import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import type { PlayerFigures, FigureWindow } from '@/lib/coachhelm/v3/chat/read-tools';
import { holeRounds, recordedPutts } from './round-scope';
import { countsForScoring, loadSeasonRounds, seasonStartDate, type ChRound } from './season';
import { loadSince, practiceCut, roundsInFilter } from './stats-common';
import { filterFor, type ChFilter } from './stats-filter';
import { summarizeWindow, weightedMean } from './stats-weight';

/**
 * One player's scoring, putts and strokes gained for a window, the figures Stats prints for it (QA-1): the player's rounds in the
 * filter's window (`roundsInFilter`), practice left out as Stats leaves it, the mean per 18 holes, strokes gained over the rounds with
 * their holes and under the floor of three. Ask's `get_player_metrics` reads these instead of the stats cache for the figures a round
 * holds, because the cache lags (its last refresh ends where it ends) and counts nine-hole rounds as full ones: for the same
 * player it said 27.1 putts a round beside Stats' 32.6.
 */
export function filterForFigureWindow(window: FigureWindow): ChFilter {
  return window === 'season' ? filterFor('season') : filterFor('last10');
}

export function playerFiguresOver(rounds: readonly ChRound[], f: ChFilter, seasonStart: string): PlayerFigures {
  const scoring = practiceCut(f) ? rounds.filter(countsForScoring) : [...rounds];
  const window = roundsInFilter(scoring, f, seasonStart);
  const s = summarizeWindow(window);
  const holes = holeRounds(window);
  const putts = weightedMean(holes, (r) => recordedPutts(r.total_putts));
  const puttRounds = holes.filter((r) => recordedPutts(r.total_putts) !== null).length;
  const dates = window.map((r) => r.round_date.slice(0, 10)).sort();
  return {
    rounds: s.rounds,
    hole_rounds: s.holeRounds,
    scoring_average: s.avg,
    putts_per_round: puttRounds >= 1 ? putts : null,
    putt_rounds: puttRounds,
    sg_total: s.sgPerRound,
    sg_rounds: s.sgRounds,
    legs: s.sgLegs,
    window_start: dates[0] ?? null,
    window_end: dates[dates.length - 1] ?? null,
  };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Ask's player-figures source. Null when the rounds could not be read. The route hands it in; CoachHelm's own code does not import Clubhouse. */
export async function loadPlayerFigures(sb: Supabase, who: { playerId: string; timezone: string }, window: FigureWindow): Promise<PlayerFigures | null> {
  const f = filterForFigureWindow(window);
  const start = seasonStartDate(new Date(), who.timezone);
  const loaded = await loadSeasonRounds(sb, [who.playerId], { surface: 'ask.player_figures', since: loadSince(f, start) });
  return loaded.error ? null : playerFiguresOver(loaded.rounds, f, start);
}
