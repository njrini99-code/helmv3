import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { TEAM_FIGURES_KEY, type PlayerFigures, type FigureWindow, type PuttBandsRead } from '@/lib/coachhelm/v3/chat/read-tools';
import { figureSetOver } from './figure-window';
import { holeRounds } from './round-scope';
import { countsForScoring, groupByPlayer, loadSeasonRounds, seasonStartDate, type ChRound } from './season';
import { bandPutts, loadPutts, loadRoundCache, loadSince, practiceCut, roundsInFilter, type ChPuttRow, type ChRoundCache } from './stats-common';
import { DETAIL_MAX_ROUNDS } from './stats-player';
import { filterFor, type ChFilter } from './stats-filter';
import { teamStrokesGained } from './stats-team-sg';

/**
 * One player's scoring, putts and strokes gained for a window, the figures Stats prints for it (QA-1): the player's rounds in the
 * filter's window (`roundsInFilter`), practice left out as Stats leaves it, the mean per 18 holes, strokes gained over the rounds with
 * their holes and under the floor of three. Ask's `get_player_metrics` reads these instead of the stats cache for the figures a round
 * holds, because the cache lags (its last refresh ends where it ends) and counts nine-hole rounds as full ones: for the same
 * player it said 27.1 putts a round beside Stats' 32.6.
 *
 * The figures themselves are the one figures helper's (`figure-window.ts` `figureSetOver`): greens, fairways and putts from each
 * round's stats row, never the round header's columns (launch readiness 2026-11-15, DF-P-01, DF-P-11). This file only cuts the window
 * as Stats' filter does and names the figures as Ask's tools read them.
 */
export function filterForFigureWindow(window: FigureWindow): ChFilter {
  return window === 'season' ? filterFor('season') : filterFor('last10', window === 'last5' ? 5 : window === 'last20' ? 20 : 10);
}

/** Each round's stats row by round id: where greens, fairways and putts come from. */
export type ChStatsRows = ReadonlyMap<string, ChRoundCache>;

/** The figures of a window of rounds that is already cut (one player's, or every player's pooled), in Ask's names. */
function figuresOfWindow(window: readonly ChRound[], rows: ChStatsRows): PlayerFigures {
  const set = figureSetOver(window, rows);
  return {
    rounds: set.n,
    hole_rounds: set.holeN,
    scoring_average: set.scoring,
    putts_per_round: set.putts.value,
    putt_rounds: set.putts.rounds,
    gir_pct: set.gir.pct,
    gir_holes: set.gir.chances,
    fairway_pct: set.fairways.pct,
    fairway_holes: set.fairways.chances,
    to_par: set.toPar,
    scrambling_pct: set.scrambling.pct,
    scramble_chances: set.scrambling.chances,
    sand_pct: set.sand.pct,
    sand_chances: set.sand.chances,
    // Per 18 holes over the rounds whose putts were recorded is a share of those holes: one-putts per 18 over 18.
    one_putt_pct: set.onePutts.value === null ? null : (set.onePutts.value / 18) * 100,
    three_putt_pct: set.threePutts.value === null ? null : (set.threePutts.value / 18) * 100,
    putt_holes: Math.round(set.threePutts.rounds * 18),
    penalties_per_round: set.penalties.value,
    penalty_rounds: set.penalties.rounds,
    sg_total: set.sg.total,
    sg_rounds: set.sg.rounds,
    legs: set.sg.legs,
    window_start: set.from,
    window_end: set.to,
    round_ids: set.roundIds,
  };
}

/** One player's rounds in the filter's window, practice out as Stats leaves it. */
export function playerWindow(rounds: readonly ChRound[], f: ChFilter, seasonStart: string): ChRound[] {
  const scoring = practiceCut(f) ? rounds.filter(countsForScoring) : [...rounds];
  return roundsInFilter(scoring, f, seasonStart);
}

export function playerFiguresOver(rounds: readonly ChRound[], f: ChFilter, seasonStart: string, rows: ChStatsRows): PlayerFigures {
  return figuresOfWindow(playerWindow(rounds, f, seasonStart), rows);
}

/**
 * The team's figures for a window, the way Team Stats pools them: each player's rounds in the filter (so "Last 10" is every player's newest ten),
 * practice left out as Stats leaves it, all those rounds pooled, and the same calculation a player's own figures use over the pool. Its strokes
 * gained is `teamStrokesGained`'s (the function Team Stats, CoachHelm Team and `teamStrokesGainedOver` call), so Ask's team value is the number Stats prints.
 */
export function teamFiguresOver(rounds: readonly ChRound[], playerIds: readonly string[], f: ChFilter, seasonStart: string, rows: ChStatsRows): PlayerFigures & { players: number } {
  const byPlayer = groupByPlayer([...rounds]);
  const window: ChRound[] = [];
  for (const id of playerIds) window.push(...playerWindow(byPlayer.get(id) ?? [], f, seasonStart));
  // Strokes gained is the one team figure (`teamStrokesGained`): only the players with three rounds that have it count, as on Team
  // Stats. Scoring, putts and the rates stay every round's, pooled, which is Team Stats' rule for those.
  const sg = teamStrokesGained(holeRounds(window), playerIds);
  return {
    ...figuresOfWindow(window, rows),
    sg_total: sg.total,
    sg_rounds: sg.rounds,
    legs: { tee: sg.legs[0], approach: sg.legs[1], around: sg.legs[2], putting: sg.legs[3] },
    players: new Set(holeRounds(window).map((r) => r.player_id)).size,
  };
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
  // The stats rows of every round the windows hold with its holes: one read for the players and the team pooled from them.
  const ids = playerIds.flatMap((id) => holeRounds(playerWindow(byPlayer.get(id) ?? [], f, start)).map((r) => r.id));
  const cache = await loadRoundCache(sb, ids, 'ask.player_figures');
  if (cache.error) return null;
  const figures = new Map(playerIds.map((id) => [id, playerFiguresOver(byPlayer.get(id) ?? [], f, start, cache.byRound)]));
  // The team's pooled figures ride beside the players' under a key no player id can be, for a comparison with the team (see `TEAM_FIGURES_KEY`).
  if (playerIds.length >= 2) figures.set(TEAM_FIGURES_KEY, teamFiguresOver(loaded.rounds, playerIds, f, start, cache.byRound));
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
