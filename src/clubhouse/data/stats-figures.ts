import { roundTypeFromDb } from '@/lib/golf/round-type-utils';
import { DEFAULT_MIN_PLAYS, rankHoleAnalyses } from '@/lib/golf/worst-hole-ranking';
import type { HoleAnalysis } from '@/app/golf/actions/stats-data-types';
import { isFull18, shortDate, type ChRound } from './season';

/**
 * The figures on the production player stats page that come from a player's
 * round rows and hole scores rather than from shots: personal bests, the
 * per-round series, this window against the one before, the pressure gap,
 * the opening hole, and the toughest holes. Each is computed over the rounds
 * it is given (the window's 18-hole rounds), with production's formulas
 * (getTrendAnalysis, getWorstHoleAnalysis, the standing refresh).
 */

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
  return rounds.filter(isFull18).sort((a, b) => (a.round_date < b.round_date ? -1 : a.round_date > b.round_date ? 1 : a.id.localeCompare(b.id)));
}

export function girPct(r: ChRound): number | null {
  return r.total_gir != null && r.total_gir_possible != null && r.total_gir_possible > 0 ? Math.round((r.total_gir / r.total_gir_possible) * 1000) / 10 : null;
}
export function fairwayPct(r: ChRound): number | null {
  return r.total_fairways_hit != null && r.total_fairways != null && r.total_fairways > 0 ? Math.round((r.total_fairways_hit / r.total_fairways) * 1000) / 10 : null;
}

/** Best score, best to par, best GIR and fewest putts over the rounds; a round with no value for a figure is not in it. */
export function personalBests(rounds: ChRound[]): ChBests {
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
    gir: best(girPct, false),
    putts: best((r) => (r.total_putts != null && r.total_putts > 0 ? r.total_putts : null), true),
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

/** One point per round, oldest first; a round with no value for a figure has no point in it. */
export function perRoundSeries(rounds: ChRound[]): ChSeries {
  const list = oldestFirst(rounds);
  const points = (pick: (r: ChRound) => number | null): ChSeriesPoint[] =>
    list.flatMap((r) => {
      const v = pick(r);
      return v == null ? [] : [{ label: shortDate(r.round_date), value: v }];
    });
  return {
    score: points((r) => r.total_score),
    gir: points(girPct),
    fairway: points(fairwayPct),
    putts: points((r) => (r.total_putts != null && r.total_putts > 0 ? r.total_putts : null)),
  };
}

export interface ChCompareRow {
  label: string;
  last: number | null;
  previous: number | null;
  unit: '' | '%';
  digits: number;
  lowerIsBetter: boolean;
}
export interface ChCompare {
  lastRounds: number;
  previousRounds: number;
  rows: ChCompareRow[];
}

/** Scoring average, GIR, fairways and putts over a set of 18-hole rounds: summed numerators over summed denominators, never a mean of percentages. */
function periodFigures(rounds: ChRound[]): { avg: number | null; gir: number | null; fairways: number | null; putts: number | null } {
  const list = rounds.filter(isFull18);
  let gir = 0;
  let girOpp = 0;
  let fw = 0;
  let fwOpp = 0;
  let putts = 0;
  let puttRounds = 0;
  for (const r of list) {
    if (r.total_gir != null && r.total_gir_possible != null) {
      gir += r.total_gir;
      girOpp += r.total_gir_possible;
    }
    if (r.total_fairways_hit != null && r.total_fairways != null) {
      fw += r.total_fairways_hit;
      fwOpp += r.total_fairways;
    }
    if (r.total_putts != null && r.total_putts > 0) {
      putts += r.total_putts;
      puttRounds += 1;
    }
  }
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return {
    avg: list.length ? round1(list.reduce((a, r) => a + (r.total_score as number), 0) / list.length) : null,
    gir: girOpp > 0 ? round1((gir / girOpp) * 100) : null,
    fairways: fwOpp > 0 ? round1((fw / fwOpp) * 100) : null,
    putts: puttRounds > 0 ? round1(putts / puttRounds) : null,
  };
}

/** The window's rounds against the window before them; null when there is no earlier window to compare with. */
export function windowCompare(last: ChRound[], previous: ChRound[] | null): ChCompare | null {
  if (!previous) return null;
  const a = periodFigures(last);
  const b = periodFigures(previous);
  return {
    lastRounds: last.filter(isFull18).length,
    previousRounds: previous.filter(isFull18).length,
    rows: [
      { label: 'Scoring avg', last: a.avg, previous: b.avg, unit: '', digits: 1, lowerIsBetter: true },
      { label: 'Greens in regulation', last: a.gir, previous: b.gir, unit: '%', digits: 1, lowerIsBetter: false },
      { label: 'Fairways hit', last: a.fairways, previous: b.fairways, unit: '%', digits: 1, lowerIsBetter: false },
      { label: 'Putts per round', last: a.putts, previous: b.putts, unit: '', digits: 1, lowerIsBetter: true },
    ],
  };
}

/** Production's floors for the pressure gap (the standing refresh): 3 tournament or qualifier rounds, 3 practice rounds, 5 rounds in all. */
export const PRESSURE_MIN = { pressure: 3, practice: 3, total: 5 } as const;
export const OPENING_MIN_ROUNDS = 5;

export interface ChPressure {
  /** Tournament and qualifier rounds against practice rounds, in strokes to par a round; positive means the tournament rounds are worse. Null under the floors. */
  gap: number | null;
  pressureRounds: number;
  practiceRounds: number;
}

export function pressureGap(rounds: ChRound[]): ChPressure {
  const press: number[] = [];
  const prac: number[] = [];
  for (const r of rounds.filter(isFull18)) {
    if (r.round_type == null || r.score_to_par == null) continue;
    const kind = roundTypeFromDb(r.round_type);
    (kind === 'practice' ? prac : press).push(r.score_to_par);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ok = press.length >= PRESSURE_MIN.pressure && prac.length >= PRESSURE_MIN.practice && press.length + prac.length >= PRESSURE_MIN.total;
  return { gap: ok ? mean(press) - mean(prac) : null, pressureRounds: press.length, practiceRounds: prac.length };
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

export interface ChHole {
  hole: number;
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

/**
 * The five toughest holes by average to par, grouped by hole number as production does (each play keeps its own
 * par: a hole number is a different hole at each course) and ranked with its floor, so one blow-up cannot crown a
 * hole.
 */
export function toughestHoles(holes: ChHoleRow[], minPlays: number = DEFAULT_MIN_PLAYS): ChToughest {
  const byNumber = new Map<number, Array<{ score: number; par: number }>>();
  for (const h of holes) {
    if (h.hole_number < 1 || h.hole_number > 18) continue;
    const list = byNumber.get(h.hole_number) ?? [];
    list.push({ score: h.score, par: h.par });
    byNumber.set(h.hole_number, list);
  }
  const analyses: HoleAnalysis[] = [];
  for (let n = 1; n <= 18; n++) {
    const plays = byNumber.get(n);
    if (!plays?.length) continue;
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
    analyses.push({
      holeNumber: n,
      par,
      averageScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
      averageToPar: Math.round((plays.reduce((a, p) => a + (p.score - p.par), 0) / plays.length) * 100) / 100,
      timesPlayed: plays.length,
      birdieOrBetter: birdie,
      pars,
      bogeys,
      doublePlus,
      trend: 'stable',
    });
  }
  const { worstHoles } = rankHoleAnalyses(analyses, minPlays);
  return {
    holes: worstHoles.map((h) => ({ hole: h.holeNumber, par: h.par, avgToPar: h.averageToPar, plays: h.timesPlayed, doublePlus: h.doublePlus })),
    belowFloor: analyses.length > 0 && worstHoles.length === 0,
    minPlays,
  };
}
