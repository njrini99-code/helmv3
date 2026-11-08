import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { TEAM_FIGURES_KEY, type PlayerFigures, type FigureWindow, type PuttBandsRead } from '@/lib/coachhelm/v3/chat/read-tools';
import { holeRounds, recordedPutts } from './round-scope';
import { countsForScoring, groupByPlayer, loadSeasonRounds, seasonStartDate, type ChRound } from './season';
import { bandPutts, loadPutts, loadSince, practiceCut, roundsInFilter, type ChPuttRow } from './stats-common';
import { DETAIL_MAX_ROUNDS } from './stats-player';
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
  return window === 'season' ? filterFor('season') : filterFor('last10', window === 'last5' ? 5 : window === 'last20' ? 20 : 10);
}

/** Greens and fairways pooled over the holes of the rounds that have them, as Stats' rates are. */
function pooled(holes: readonly ChRound[]) {
  const rate = (made: (r: ChRound) => number | null, total: (r: ChRound) => number | null) => {
    let m = 0;
    let t = 0;
    for (const r of holes) {
      const a = made(r);
      const b = total(r);
      if (a != null && b != null && b > 0) {
        m += a;
        t += b;
      }
    }
    return { pct: t > 0 ? (m / t) * 100 : null, holes: t };
  };
  const gir = rate((r) => r.total_gir, (r) => r.total_gir_possible);
  const fw = rate((r) => r.total_fairways_hit, (r) => r.total_fairways);
  return { gir_pct: gir.pct, gir_holes: gir.holes, fairway_pct: fw.pct, fairway_holes: fw.holes };
}

/** The figures of a window of rounds that is already cut (one player's, or every player's pooled): the one calculation behind a player's and a team's. */
function figuresOfWindow(window: readonly ChRound[]): PlayerFigures {
  const list = [...window];
  const s = summarizeWindow(list);
  const holes = holeRounds(list);
  const putts = weightedMean(holes, (r) => recordedPutts(r.total_putts));
  const puttRounds = holes.filter((r) => recordedPutts(r.total_putts) !== null).length;
  const dates = list.map((r) => r.round_date.slice(0, 10)).sort();
  return {
    rounds: s.rounds,
    hole_rounds: s.holeRounds,
    scoring_average: s.avg,
    putts_per_round: puttRounds >= 1 ? putts : null,
    putt_rounds: puttRounds,
    ...pooled(holes),
    sg_total: s.sgPerRound,
    sg_rounds: s.sgRounds,
    legs: s.sgLegs,
    window_start: dates[0] ?? null,
    window_end: dates[dates.length - 1] ?? null,
  };
}

export function playerFiguresOver(rounds: readonly ChRound[], f: ChFilter, seasonStart: string): PlayerFigures {
  const scoring = practiceCut(f) ? rounds.filter(countsForScoring) : [...rounds];
  return figuresOfWindow(roundsInFilter(scoring, f, seasonStart));
}

/**
 * The team's figures for a window, the way Team Stats pools them: each player's rounds in the filter (so "Last 10" is every player's newest ten),
 * practice left out as Stats leaves it, all those rounds pooled, and the same calculation a player's own figures use over the pool. Its strokes
 * gained legs are `teamStrokesGainedOver`'s (the same rounds through the same `sgOver`), so Ask's team value is the number Stats prints.
 */
export function teamFiguresOver(rounds: readonly ChRound[], playerIds: readonly string[], f: ChFilter, seasonStart: string): PlayerFigures & { players: number } {
  const scoring = practiceCut(f) ? rounds.filter(countsForScoring) : [...rounds];
  const byPlayer = groupByPlayer(scoring);
  const window: ChRound[] = [];
  for (const id of playerIds) window.push(...roundsInFilter(byPlayer.get(id) ?? [], f, seasonStart));
  return { ...figuresOfWindow(window), players: new Set(holeRounds(window).map((r) => r.player_id)).size };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Ask's players-figures source: one read of the rounds for all the players asked about. Null when the rounds could not be read. The route hands it in; CoachHelm's own code does not import Clubhouse. */
export async function loadPlayersFigures(sb: Supabase, who: { timezone: string }, playerIds: readonly string[], window: FigureWindow): Promise<Map<string, PlayerFigures> | null> {
  const f = filterForFigureWindow(window);
  const start = seasonStartDate(new Date(), who.timezone);
  if (playerIds.length === 0) return new Map();
  const loaded = await loadSeasonRounds(sb, [...playerIds], { surface: 'ask.player_figures', since: loadSince(f, start) });
  if (loaded.error) return null;
  const byPlayer = groupByPlayer(loaded.rounds);
  const figures = new Map(playerIds.map((id) => [id, playerFiguresOver(byPlayer.get(id) ?? [], f, start)]));
  // The team's pooled figures ride beside the players' under a key no player id can be, for a comparison with the team (see `TEAM_FIGURES_KEY`).
  if (playerIds.length >= 2) figures.set(TEAM_FIGURES_KEY, teamFiguresOver(loaded.rounds, playerIds, f, start));
  return figures;
}

/**
 * The rounds whose putts Stats counts for a window: the player's rounds in the filter (practice out unless the filter keeps it), only those with
 * holes scored, newest `DETAIL_MAX_ROUNDS`. The same cut `stats-player.ts` makes for its `scopeIds`, so the bands below are the ones it draws.
 */
export function puttScopeRounds(rounds: readonly ChRound[], f: ChFilter, seasonStart: string): ChRound[] {
  const counted = practiceCut(f) ? rounds.filter(countsForScoring) : f.span === 'all' ? holeRounds(rounds) : [...rounds];
  return holeRounds(roundsInFilter(counted, f, seasonStart)).slice(0, DETAIL_MAX_ROUNDS);
}

/** The window's putts counted into Stats' six bands (`bandPutts` with its default `PUTT_BANDS`), with the rounds and dates behind them. */
export function playerPuttBandsOver(scope: readonly ChRound[], putts: readonly ChPuttRow[]): PuttBandsRead {
  const dates = scope.map((r) => r.round_date.slice(0, 10)).sort();
  return {
    bands: bandPutts([...putts], new Map()).map((b) => ({ label: b.label, attempts: b.attempts, made: b.made })),
    rounds: scope.length,
    window_start: dates[0] ?? null,
    window_end: dates[dates.length - 1] ?? null,
  };
}

/** Ask's putting-by-distance source: one player's rounds, then those rounds' putts, as Stats reads them. Null when either could not be read. */
export async function loadPlayerPuttBands(sb: Supabase, who: { timezone: string }, playerId: string, window: FigureWindow): Promise<PuttBandsRead | null> {
  const f = filterForFigureWindow(window);
  const start = seasonStartDate(new Date(), who.timezone);
  const loaded = await loadSeasonRounds(sb, [playerId], { surface: 'ask.putt_bands', since: loadSince(f, start) });
  if (loaded.error) return null;
  const scope = puttScopeRounds(groupByPlayer(loaded.rounds).get(playerId) ?? [], f, start);
  if (scope.length === 0) return playerPuttBandsOver([], []);
  const putts = await loadPutts(sb, scope.map((r) => r.id));
  if (putts.error) return null;
  return playerPuttBandsOver(scope, putts.rows);
}
