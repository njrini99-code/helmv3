import { holeRounds, isScoreCountable } from './round-scope';
import { countsForScoring, MIN_SG_ROUNDS, seasonStartDate, shortDate, type ChRound } from './season';
import { cachedPutts, type ChRoundCache } from './stats-common';
import { effectiveCount, sgOver, weightedMean } from './stats-weight';

/**
 * One source for "how many rounds" and "strokes gained" (SYS-7, QA-1). The same player read 2, 3 and 10 rounds and +0.5 and −6.1 on
 * different pages, because each page chose its own rounds. Every page now passes its window through here, so two figures can differ
 * only by the window each names.
 */

/**
 * The rounds a figure may read: rounds that count toward a score, with practice left out. An 18-hole total posted without its holes is
 * one of them; only strokes gained leaves it out, through `holeRounds`. Round lists still show everything.
 */
export function roundsForFigures<T extends { round_type: string | null; status?: string | null }>(rounds: readonly T[]): T[] {
  return rounds.filter((r) => (r.status == null || r.status === 'completed') && countsForScoring(r) && isScoreCountable(r as never));
}

/** The window a strokes-gained figure reads unless a page names another: the newest ten counted rounds, ending on the newest. */
export const LAST_TEN = 10;

/**
 * The rounds in the default window, newest first: 18-hole rounds, as Stats' default filter reads them (`filterFor`), so a nine-hole round
 * neither moves the figure nor pushes an older 18 out of the ten. Ties on a date keep a stable order, so two pages never pick different rounds.
 */
export function lastTenRounds<T extends { round_type: string | null; status?: string | null; round_date: string; id: string; holes_played?: number | null }>(rounds: readonly T[]): T[] {
  return roundsForFigures(rounds)
    .filter((r) => (r.holes_played ?? 18) === 18)
    .sort((a, b) => (a.round_date < b.round_date ? 1 : a.round_date > b.round_date ? -1 : a.id.localeCompare(b.id)))
    .slice(0, LAST_TEN);
}

/**
 * The rounds a Last 10 hole-level figure reads (fairways, greens, putts, scrambling, each part's strokes gained): the ones with their holes
 * among the newest ten. One definition for Home's Your game and My stats' Last 10 (prod audit 2026-11-15, N13P-64: Home read the newest ten
 * rounds that had holes, back past the ten, and printed 42% fairways against My stats' 43%).
 */
export function lastTenHoleRounds<T extends { round_type: string | null; status?: string | null; round_date: string; id: string; holes_played?: number | null; total_only?: boolean }>(rounds: readonly T[]): T[] {
  return holeRounds(lastTenRounds(rounds));
}

/**
 * A player's strokes gained, the one source (QA-1): Team view, their Home, Roster and Stats' default all read this, so a player's
 * number is the same wherever it is drawn. Baseline: the stored per-round figures. Filter: `roundsForFigures`. Window: `lastTenRounds`.
 */
export function playerStrokesGained(rounds: readonly ChRound[]): ChFigures {
  return figuresOver(lastTenRounds(rounds));
}

/**
 * A player's scoring average over the same window (dashboard cuts: one place per number). My stats' default draws it; Home's Your game
 * line reads this, so the two print one value. Per-18 weighted, as Stats' mean is.
 */
export function playerScoringAverage(rounds: readonly ChRound[]): { avg: number | null; n: number } {
  const last = lastTenRounds(rounds).filter((r) => r.total_score != null);
  return { avg: last.length ? weightedMean(last as ChRound[], (r) => r.total_score) : null, n: last.length };
}

export type ChLegKey = 'tee' | 'approach' | 'around' | 'putting';
export type ChFigures = {
  /** Every round the window holds, the number a page prints beside the figures. */
  rounds: number;
  /** Of those, the ones with hole scores: the only ones strokes gained can read. */
  holeRounds: number;
  /** Per round, over the hole rounds; null under the floor of MIN_SG_ROUNDS. */
  legs: Record<ChLegKey, number | null>;
  /** The stored total's mean over the same rounds. Never the legs added up. */
  total: number | null;
};

/** One figure over some rounds: the mean, and how many rounds it rests on. Null under the floor, so a page shows no figure rather than a thin one. */
export function figureOver<T extends ChRound>(rounds: readonly T[], pick: (r: T) => number | null | undefined): { value: number | null; n: number } {
  const n = effectiveCount(rounds as T[], pick);
  return { value: n >= MIN_SG_ROUNDS ? weightedMean(rounds as T[], pick) : null, n };
}

/** Strokes gained and round counts for one player's rounds in one window. Pass rounds already cut to the window. */
export function figuresOver(rounds: readonly ChRound[]): ChFigures {
  const holes = holeRounds(rounds);
  const sg = sgOver(holes);
  return { rounds: rounds.length, holeRounds: holes.length, legs: sg.legs, total: sg.total };
}

/*
 * The figures helper (launch readiness 2026-11-15, section 3): one function for every number a page prints about a player's or a team's
 * play, so two pages can differ only by the window each names. Before it, the same player's greens in regulation came from
 * `golf_round_stats_cache` on My stats' table and from the `golf_rounds` columns on its compare card, Home's legs and Ask (DF-P-01), and
 * the parts of Home's team game counted practice that its headline left out (DF-C-01).
 *
 * The rules, once:
 *   - Rounds: completed, not a test round (the loader), counting toward a score (practice out; a round with no type counts), score-
 *     countable. Eighteen holes unless the caller asks for any length; then a nine-hole round weighs half a round and is never doubled.
 *     A round posted as a total only feeds the score figures and no hole figure.
 *   - Window: the newest N by date, ties by id; or the season from 1 August in the team's zone; or every round.
 *   - One source per rate: greens, fairways, putts, three-putts, scrambling, sand saves and penalties come from the round's
 *     `golf_round_stats_cache` row, never the `golf_rounds` columns. Rates pool made over chances; per-round counts are per 18.
 *   - Nothing is rounded here: a page rounds when it draws.
 */

export type ChFigureWindow = 'last5' | 'last10' | 'last20' | 'season' | 'all' | { last: number };

export interface ChFigureSpec {
  window: ChFigureWindow;
  /** 18 (the default) keeps eighteen-hole rounds; 'any' keeps nine-hole rounds too, at half weight. */
  holes?: 18 | 'any';
  /** The team's zone (loadTeamZone), for the season's first day. */
  tz: string;
  now?: Date;
}

/** A pooled rate: made over chances across the window's hole rounds, and how many rounds had a chance. */
export interface ChRateFigure {
  pct: number | null;
  made: number;
  chances: number;
  rounds: number;
}

/** A per-18 count (putts, three-putts, penalties) and the whole rounds it rests on. */
export interface ChPer18Figure {
  value: number | null;
  rounds: number;
}

export interface ChFigureSet {
  /** Rounds in the window (score figures read every one). */
  n: number;
  /** Of those, the rounds with their holes scored (every hole figure reads these). */
  holeN: number;
  /** The window's oldest and newest round days (YYYY-MM-DD), null with no rounds. */
  from: string | null;
  to: string | null;
  /** Newest first. */
  roundIds: string[];
  /** Per-18 mean of the score and of the score to par. */
  scoring: number | null;
  toPar: number | null;
  /** Strokes gained over the hole rounds: the stored per-round figures, null under the floor of MIN_SG_ROUNDS whole rounds. */
  sg: { total: number | null; legs: Record<ChLegKey, number | null>; rounds: number };
  gir: ChRateFigure;
  fairways: ChRateFigure;
  scrambling: ChRateFigure;
  sand: ChRateFigure;
  putts: ChPer18Figure;
  threePutts: ChPer18Figure;
  penalties: ChPer18Figure;
}

const byNewest = <T extends { round_date: string; id: string }>(a: T, b: T) => (a.round_date < b.round_date ? 1 : a.round_date > b.round_date ? -1 : a.id.localeCompare(b.id));

/** How many rounds a "last N" window holds, or null for a dated one. */
export function windowSize(w: ChFigureWindow): number | null {
  if (typeof w === 'object') return w.last;
  return w === 'last5' ? 5 : w === 'last10' ? 10 : w === 'last20' ? 20 : null;
}

/** The rounds a window holds, newest first: the figure rounds of the asked length, then the newest N or the season's. */
export function figureWindowRounds<T extends ChRound>(rounds: readonly T[], spec: ChFigureSpec): T[] {
  const kept = roundsForFigures(rounds)
    .filter((r) => spec.holes === 'any' || (r.holes_played ?? 18) === 18)
    .sort(byNewest);
  const n = windowSize(spec.window);
  if (n != null) return kept.slice(0, n);
  if (spec.window === 'season') {
    const start = seasonStartDate(spec.now ?? new Date(), spec.tz);
    return kept.filter((r) => r.round_date.slice(0, 10) >= start);
  }
  return kept;
}

type CacheRead = ReadonlyMap<string, ChRoundCache>;
type RatePick = { made: keyof ChRoundCache; total: keyof ChRoundCache };
export const RATE_COLUMNS = {
  gir: { made: 'greens_hit', total: 'greens_total' },
  fairways: { made: 'fairways_hit', total: 'fairways_total' },
  scrambling: { made: 'scrambles_converted', total: 'scramble_attempts' },
  sand: { made: 'sand_saves', total: 'sand_attempts' },
} as const satisfies Record<string, RatePick>;

/** One hole round's made and chances for a rate, from its cache row; null when the round has no chance at it or no row. */
export function roundRate(r: { id: string; total_only?: boolean }, cache: CacheRead, kind: keyof typeof RATE_COLUMNS): { made: number; total: number } | null {
  if (r.total_only) return null;
  const c = cache.get(r.id);
  const { made, total } = RATE_COLUMNS[kind];
  const m = c?.[made];
  const t = c?.[total];
  return typeof m === 'number' && typeof t === 'number' && t > 0 ? { made: m, total: t } : null;
}

/** A rate pooled over rounds: made over chances, never a mean of percentages. */
export function pooledRate(rounds: readonly { id: string; total_only?: boolean }[], cache: CacheRead, kind: keyof typeof RATE_COLUMNS): ChRateFigure {
  let made = 0;
  let chances = 0;
  let n = 0;
  for (const r of rounds) {
    const p = roundRate(r, cache, kind);
    if (!p) continue;
    made += p.made;
    chances += p.total;
    n += 1;
  }
  return { pct: chances > 0 ? (made / chances) * 100 : null, made, chances, rounds: n };
}

/** A hole round's putts, three-putts or penalty strokes from its cache row: putts only when recorded (`cachedPutts`). */
export function roundCount(r: { id: string; total_only?: boolean }, cache: CacheRead, kind: 'putts' | 'threePutts' | 'penalties'): number | null {
  if (r.total_only) return null;
  const c = cache.get(r.id);
  if (kind === 'putts') return cachedPutts(c, 'total_putts');
  if (kind === 'threePutts') return cachedPutts(c, 'three_putts');
  return typeof c?.penalty_strokes === 'number' ? c.penalty_strokes : null;
}

function per18Over(holes: readonly ChRound[], cache: CacheRead, kind: 'putts' | 'threePutts' | 'penalties'): ChPer18Figure {
  const pick = (r: ChRound) => roundCount(r, cache, kind);
  return { value: weightedMean(holes as ChRound[], pick), rounds: effectiveCount(holes as ChRound[], pick) };
}

/** The figures of rounds already cut to a window (one player's, or a team's pooled). */
export function figureSetOver(window: readonly ChRound[], cache: CacheRead): ChFigureSet {
  const list = [...window].filter((r) => r.total_score != null).sort(byNewest);
  const holes = holeRounds(list);
  const sg = sgOver(holes);
  return {
    n: list.length,
    holeN: holes.length,
    from: list.length ? list[list.length - 1]!.round_date.slice(0, 10) : null,
    to: list.length ? list[0]!.round_date.slice(0, 10) : null,
    roundIds: list.map((r) => r.id),
    scoring: weightedMean(list, (r) => r.total_score),
    toPar: weightedMean(list, (r) => r.score_to_par),
    sg: { total: sg.total, legs: sg.legs, rounds: sg.effective },
    gir: pooledRate(holes, cache, 'gir'),
    fairways: pooledRate(holes, cache, 'fairways'),
    scrambling: pooledRate(holes, cache, 'scrambling'),
    sand: pooledRate(holes, cache, 'sand'),
    putts: per18Over(holes, cache, 'putts'),
    threePutts: per18Over(holes, cache, 'threePutts'),
    penalties: per18Over(holes, cache, 'penalties'),
  };
}

/** One player's figures for a window. `rounds` are the player's (any order); `cache` holds their rounds' stats rows. */
export function playerFigures(rounds: readonly ChRound[], cache: CacheRead, spec: ChFigureSpec): ChFigureSet {
  return figureSetOver(figureWindowRounds(rounds, spec), cache);
}

/**
 * A team's figures for a window: each player's own window ("Last 10" is every player's newest ten), pooled. Strokes gained counts only
 * the players with MIN_SG_ROUNDS whole rounds that have it, as Team Stats does; the other figures read every round of the pool.
 */
export function teamFigures(rounds: readonly ChRound[], cache: CacheRead, playerIds: readonly string[], spec: ChFigureSpec): ChFigureSet & { players: number } {
  const byPlayer = new Map<string, ChRound[]>();
  for (const r of rounds) {
    const list = byPlayer.get(r.player_id);
    if (list) list.push(r);
    else byPlayer.set(r.player_id, [r]);
  }
  const pool: ChRound[] = [];
  const sgReady: ChRound[] = [];
  for (const id of playerIds) {
    const mine = figureWindowRounds(byPlayer.get(id) ?? [], spec);
    pool.push(...mine);
    const holes = holeRounds(mine);
    if (effectiveCount(holes, (r) => r.strokes_gained_total) >= MIN_SG_ROUNDS) sgReady.push(...holes);
  }
  const set = figureSetOver(pool, cache);
  const sg = sgOver(sgReady);
  return { ...set, sg: { total: sg.total, legs: sg.legs, rounds: sg.effective }, players: new Set(pool.map((r) => r.player_id)).size };
}

/** "Last 10", "This season", "All rounds": the window's name as a label says it. */
export function figureWindowName(w: ChFigureWindow): string {
  const n = windowSize(w);
  if (n != null) return `Last ${n}`;
  return w === 'season' ? 'This season' : 'All rounds';
}

/**
 * The label a figure prints beside it, so a reader can tell two windows apart: "Last 10 · 22 Aug to 9 Nov · hole stats from 8". The
 * hole count is said only when it is fewer than the rounds; a window with no rounds is its name alone.
 */
export function figureWindowLabel(set: Pick<ChFigureSet, 'n' | 'holeN' | 'from' | 'to'>, w: ChFigureWindow): string {
  const parts = [figureWindowName(w)];
  if (set.from && set.to) parts.push(set.from === set.to ? shortDate(set.from) : `${shortDate(set.from)} to ${shortDate(set.to)}`);
  if (set.holeN < set.n) parts.push(`hole stats from ${set.holeN}`);
  return parts.join(' · ');
}
