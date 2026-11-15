import { DEFAULT_MIN_PLAYS, rankHoleAnalyses } from '@/lib/golf/worst-hole-ranking';
import type { HoleAnalysis } from '@/app/golf/actions/stats-data-types';
import { shortDate, type ChRound } from './season';
import { holeRounds, roundKindOf } from './round-scope';
import { pooledRate, roundCount, roundRate } from './figure-window';
import type { ChRoundCache } from './stats-common';
import { effectiveCount, hasScore, per18, weightedMean, windowChangeSe } from './stats-weight';
import { changeSe } from '../lib/stats-signal';

/**
 * The figures on the production player stats page that come from a player's
 * round rows and hole scores rather than from shots: personal bests, the
 * per-round series, this window against the one before, the pressure gap,
 * the opening hole, and the toughest holes. Each is computed over the rounds
 * it is given (the window's rounds, of one length or both), with production's formulas
 * (getTrendAnalysis, getWorstHoleAnalysis, the standing refresh). Averages are per 18
 * holes, a nine-hole round counting as half a round (stats-weight); personal bests are
 * taken over the rounds they are given, so the caller lists each length on its own.
 *
 * Scores (the best score and to par, the score series, the scoring average) count a round posted as a total only; greens,
 * fairways and putts never do (Q-123): a round marked `total_only` has no value for them, whatever its row holds.
 *
 * Greens, fairways and putts come from each round's stats row (`golf_round_stats_cache`, the caller's `rows`), never the round
 * header's `total_gir` / `total_fairways_hit` / `total_putts` (launch readiness 2026-11-15, DF-P-01): the 17 Oct GIR rule change
 * rewrote the rows and not the headers, so My stats' table and its compare card printed two GIR figures for the same rounds.
 */

/** Each round's stats row by round id: the one source of a round's greens, fairways and putts. */
export type ChStatsRows = ReadonlyMap<string, ChRoundCache>;

const COURSE_FALLBACK = 'Course not recorded';

export interface ChBest {
  value: number;
  date: string;
  course: string;
}
export interface ChBests {
  score: ChBest | null;
  toPar: ChBest | null;
  gir: ChBest | null;
  putts: ChBest | null;
}

/** Oldest first, so a tie goes to the earliest round (production sorts oldest first and keeps the first). */
function oldestFirst(rounds: ChRound[]): ChRound[] {
  return rounds.filter(hasScore).sort((a, b) => (a.round_date < b.round_date ? -1 : a.round_date > b.round_date ? 1 : a.id.localeCompare(b.id)));
}

const pct1 = (p: { made: number; total: number } | null): number | null => (p ? Math.round((p.made / p.total) * 1000) / 10 : null);

/** A round's greens in regulation, in percent to one decimal, from its stats row; null for a round posted as a total only or with no row. */
export function girPct(r: ChRound, rows: ChStatsRows): number | null {
  return pct1(roundRate(r, rows, 'gir'));
}
export function fairwayPct(r: ChRound, rows: ChStatsRows): number | null {
  return pct1(roundRate(r, rows, 'fairways'));
}

/** A round's putts from its stats row: a hole-level count, so none for a round posted as a total only or with no putt recorded. */
function puttsOf(r: ChRound, rows: ChStatsRows): number | null {
  return roundCount(r, rows, 'putts');
}

/** Best score, best to par, best GIR and fewest putts over the rounds; a round with no value for a figure is not in it. */
export function personalBests(rounds: ChRound[], rows: ChStatsRows): ChBests {
  const list = oldestFirst(rounds);
  const best = (pick: (r: ChRound) => number | null, lowerIsBetter: boolean): ChBest | null => {
    let top: { r: ChRound; v: number } | null = null;
    for (const r of list) {
      const v = pick(r);
      if (v == null) continue;
      if (!top || (lowerIsBetter ? v < top.v : v > top.v)) top = { r, v };
    }
    return top ? { value: top.v, date: shortDate(top.r.round_date), course: top.r.course_name ?? COURSE_FALLBACK } : null;
  };
  return {
    score: best((r) => r.total_score, true),
    toPar: best((r) => r.score_to_par, true),
    gir: best((r) => girPct(r, rows), false),
    putts: best((r) => puttsOf(r, rows), true),
  };
}

export interface ChSeriesPoint {
  label: string;
  value: number;
}
export interface ChSeries {
  score: ChSeriesPoint[];
  gir: ChSeriesPoint[];
  fairway: ChSeriesPoint[];
  putts: ChSeriesPoint[];
}

/** One point per round, oldest first, a score or putt count per 18 holes (a nine-hole round's doubled); a round with no value for a figure has no point in it. */
export function perRoundSeries(rounds: ChRound[], rows: ChStatsRows): ChSeries {
  const list = oldestFirst(rounds);
  const points = (pick: (r: ChRound) => number | null): ChSeriesPoint[] =>
    list.flatMap((r) => {
      const v = pick(r);
      return v == null ? [] : [{ label: shortDate(r.round_date), value: v }];
    });
  return {
    score: points((r) => (r.total_score == null ? null : per18(r.total_score, r.holes_played))),
    gir: points((r) => girPct(r, rows)),
    fairway: points((r) => fairwayPct(r, rows)),
    putts: points((r) => {
      const p = puttsOf(r, rows);
      return p == null ? null : per18(p, r.holes_played);
    }),
  };
}

export interface ChCompareRow {
  label: string;
  last: number | null;
  previous: number | null;
  unit: '' | '%';
  digits: number;
  lowerIsBetter: boolean;
  /** The change's standard error (decision Q4): it is toned only past it; null when the windows can't measure their spread. */
  se: number | null;
}
export interface ChCompare {
  lastRounds: number;
  previousRounds: number;
  /** Of those, the rounds with their holes scored: greens, fairways and putts read these (a total-only round has none, Q-123). Equal to the counts above when every round has. */
  lastHoleRounds: number;
  previousHoleRounds: number;
  rows: ChCompareRow[];
}

/** Scoring average and putts per 18, GIR and fairways over a set of rounds: summed numerators over summed denominators, never a mean of percentages. */
function periodFigures(rounds: ChRound[], rows: ChStatsRows): { avg: number | null; gir: number | null; fairways: number | null; putts: number | null } {
  const list = rounds.filter(hasScore);
  const holes = holeRounds(list);
  const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
  return {
    avg: round1(weightedMean(list, (r) => r.total_score)),
    gir: round1(pooledRate(holes, rows, 'gir').pct),
    fairways: round1(pooledRate(holes, rows, 'fairways').pct),
    putts: round1(weightedMean(list, (r) => puttsOf(r, rows))),
  };
}

/** The window's rounds against the window before them; null when there is no earlier window to compare with. */
export function windowCompare(last: ChRound[], previous: ChRound[] | null, rows: ChStatsRows): ChCompare | null {
  if (!previous) return null;
  const a = periodFigures(last, rows);
  const b = periodFigures(previous, rows);
  const lastScored = last.filter(hasScore);
  const prevScored = previous.filter(hasScore);
  // A rate's spread is its per-round rates' (a nine-hole round's 50% is 50%, never doubled), measured from five rounds.
  const rates = (rounds: ChRound[], pick: (r: ChRound) => number | null) => holeRounds(rounds).flatMap((r) => (pick(r) == null ? [] : [pick(r)!]));
  const rateSe = (pick: (r: ChRound) => number | null) => changeSe(rates(lastScored, pick), rates(prevScored, pick), null);
  return {
    lastRounds: last.filter(hasScore).length,
    previousRounds: previous.filter(hasScore).length,
    lastHoleRounds: holeRounds(last.filter(hasScore)).length,
    previousHoleRounds: holeRounds(previous.filter(hasScore)).length,
    rows: [
      { label: 'Scoring avg', last: a.avg, previous: b.avg, unit: '', digits: 1, lowerIsBetter: true, se: windowChangeSe(lastScored, prevScored, (r) => r.total_score, 'score') },
      { label: 'Greens in regulation', last: a.gir, previous: b.gir, unit: '%', digits: 1, lowerIsBetter: false, se: rateSe((r) => girPct(r, rows)) },
      { label: 'Fairways hit', last: a.fairways, previous: b.fairways, unit: '%', digits: 1, lowerIsBetter: false, se: rateSe((r) => fairwayPct(r, rows)) },
      { label: 'Putts per round', last: a.putts, previous: b.putts, unit: '', digits: 1, lowerIsBetter: true, se: windowChangeSe(holeRounds(lastScored), holeRounds(prevScored), (r) => puttsOf(r, rows), null) },
    ],
  };
}

/** Production's floors for the pressure gap (the standing refresh): 3 tournament or qualifier rounds, 3 practice rounds, 5 rounds in all (whole rounds: a nine-hole round is half). */
export const PRESSURE_MIN = { pressure: 3, practice: 3, total: 5 } as const;
export const OPENING_MIN_ROUNDS = 5;

export interface ChPressure {
  /** Tournament and qualifier rounds against practice rounds, in strokes to par a round; positive means the tournament rounds are worse. Null under the floors. */
  gap: number | null;
  pressureRounds: number;
  practiceRounds: number;
}

export function pressureGap(rounds: ChRound[]): ChPressure {
  const press: ChRound[] = [];
  const prac: ChRound[] = [];
  for (const r of rounds.filter(hasScore)) {
    // DF-C-18: a round with no type counts in the averages but is neither a named competition nor practice (`roundKindOf`).
    const kind = roundKindOf(r);
    if (kind == null || r.score_to_par == null) continue;
    (kind === 'practice' ? prac : press).push(r);
  }
  const toPar = (r: ChRound) => r.score_to_par;
  const pressWhole = effectiveCount(press, toPar);
  const pracWhole = effectiveCount(prac, toPar);
  const ok = pressWhole >= PRESSURE_MIN.pressure && pracWhole >= PRESSURE_MIN.practice && pressWhole + pracWhole >= PRESSURE_MIN.total;
  // Strokes to par per 18 holes on each side, so a nine-hole round's to-par is doubled as a half round.
  return { gap: ok ? (weightedMean(press, toPar) as number) - (weightedMean(prac, toPar) as number) : null, pressureRounds: press.length, practiceRounds: prac.length };
}

export interface ChHoleRow {
  round_id: string;
  hole_number: number;
  par: number;
  score: number;
}

/** Hole 1 against holes 2 to 18, in strokes to par a hole (production's opening_hole_delta); null under five rounds. */
export function openingDelta(holes: ChHoleRow[]): { delta: number | null; rounds: number } {
  const byRound = new Map<string, { first: number | null; rest: number[] }>();
  for (const h of holes) {
    const t = byRound.get(h.round_id) ?? { first: null, rest: [] };
    if (h.hole_number === 1) t.first = h.score - h.par;
    else if (h.hole_number >= 2 && h.hole_number <= 18) t.rest.push(h.score - h.par);
    byRound.set(h.round_id, t);
  }
  const both = [...byRound.values()].filter((t) => t.first != null && t.rest.length > 0);
  if (both.length < OPENING_MIN_ROUNDS) return { delta: null, rounds: both.length };
  const first = both.map((t) => t.first as number);
  const rest = both.flatMap((t) => t.rest);
  return { delta: first.reduce((a, b) => a + b, 0) / first.length - rest.reduce((a, b) => a + b, 0) / rest.length, rounds: both.length };
}

/**
 * Holes played at triple bogey or worse (three or more over par): a part of the calculator's "double or worse", which the
 * scoring mix says when its double or worse is read (stats-visuals spec 4.4). Reads the same scored holes, of the same rounds,
 * as the detail read.
 */
export function triplePlusCount(holes: ChHoleRow[]): number {
  return holes.reduce((n, h) => n + (h.score - h.par >= 3 ? 1 : 0), 0);
}

export interface ChHole {
  hole: number;
  /** The course the hole is on: a hole number is a different hole at each course. */
  course: string;
  par: number;
  avgToPar: number;
  plays: number;
  doublePlus: number;
}
export interface ChToughest {
  holes: ChHole[];
  /** Holes were scored but none has been played often enough to rank. */
  belowFloor: boolean;
  minPlays: number;
}

/** A course's grouping key and name for a round: its course id, else its name folded (case, spacing, a club suffix). */
export function courseKeyOf(r: { course_id?: string | null; course_name: string | null }): { key: string; name: string } | null {
  const name = r.course_name?.trim().replace(/\s+/g, ' ') ?? '';
  if (r.course_id) return { key: r.course_id, name: name || COURSE_FALLBACK };
  if (!name) return null;
  const key = name
    .toLowerCase()
    .replace(/\s+(country club|golf club|golf course|cc|gc)$/, '')
    .trim();
  return { key: `name:${key}`, name };
}

/**
 * The five toughest holes by average to par, each hole on its own course (hole 8 at one course is not hole 8 at
 * another), ranked with its floor, so one blow-up cannot crown a hole. A round with no course is left out. Fairway's
 * getWorstHoleAnalysis still groups by hole number across courses; this deliberately does not (coach audit 13 Nov).
 */
export function toughestHoles(
  holes: ChHoleRow[],
  courseOf: (roundId: string) => { key: string; name: string } | null,
  minPlays: number = DEFAULT_MIN_PLAYS,
): ChToughest {
  const byHole = new Map<string, { hole: number; course: string; plays: Array<{ score: number; par: number }> }>();
  for (const h of holes) {
    if (h.hole_number < 1 || h.hole_number > 18) continue;
    const course = courseOf(h.round_id);
    if (!course) continue;
    const id = `${course.key}#${h.hole_number}`;
    const entry = byHole.get(id) ?? { hole: h.hole_number, course: course.name, plays: [] };
    entry.plays.push({ score: h.score, par: h.par });
    byHole.set(id, entry);
  }
  const analyses: HoleAnalysis[] = [];
  const courseOfAnalysis = new Map<HoleAnalysis, string>();
  for (const { hole, course, plays } of byHole.values()) {
    const parCounts = new Map<number, number>();
    for (const p of plays) parCounts.set(p.par, (parCounts.get(p.par) ?? 0) + 1);
    const par = [...parCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const scores = plays.map((p) => p.score);
    let birdie = 0;
    let pars = 0;
    let bogeys = 0;
    let doublePlus = 0;
    for (const p of plays) {
      const d = p.score - p.par;
      if (d <= -1) birdie++;
      else if (d === 0) pars++;
      else if (d === 1) bogeys++;
      else doublePlus++;
    }
    const analysis: HoleAnalysis = {
      holeNumber: hole,
      par,
      averageScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
      averageToPar: Math.round((plays.reduce((a, p) => a + (p.score - p.par), 0) / plays.length) * 100) / 100,
      timesPlayed: plays.length,
      birdieOrBetter: birdie,
      pars,
      bogeys,
      doublePlus,
      trend: 'stable',
    };
    analyses.push(analysis);
    courseOfAnalysis.set(analysis, course);
  }
  const { worstHoles } = rankHoleAnalyses(analyses, minPlays);
  return {
    holes: worstHoles.map((h) => ({ hole: h.holeNumber, course: courseOfAnalysis.get(h)!, par: h.par, avgToPar: h.averageToPar, plays: h.timesPlayed, doublePlus: h.doublePlus })),
    belowFloor: analyses.length > 0 && worstHoles.length === 0,
    minPlays,
  };
}
