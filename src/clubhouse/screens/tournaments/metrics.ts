/*
 * Tournament metrics (P016, handoff 4.33 section 10). Every row of the 10.1 catalogue, with the inclusion rules of 10.3 and the
 * thresholds of 10.2, so the desk, the comparison and history read one number the same way. Each metric returns
 * `{ value, n, solid, excluded }`: the value, the rounds it rests on, whether it is past the solid threshold, and every round in
 * scope that was left out with the reason, for the evidence drawer (5.13).
 *
 * Inputs mirror the comparison loader's round (`ChCompareRound`, 6.13), so the comparison can pass its rounds straight in. The
 * counting metrics (counting rate, gap to drop, drop differential) never derive a counting set: they read the one the scoring
 * engine already settled for that team round (`counting` on the round).
 *
 * Scales: a rate is a percentage from 0 to 100, Σ made ÷ Σ attempts across rounds (never a mean of per-round percentages), and a
 * difference between two rates is in percentage points ("pts"). Strokes, putts and strokes gained are per round; the par-3, 4
 * and 5 figures are per hole.
 *
 * Pure: no Supabase, no React. Client-safe (no 'use client', no server-only imports).
 */

import { isCountableRound, roundExclusionReason, type CountableRoundInput, type RoundExclusionReason } from '@/lib/golf/round-countable';
import { isScoreCountable, recordedPutts } from '../../data/round-scope';
import { FLOORS, type SampleState } from '../../lib/stats-signal';

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Inputs                                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------------ */

/** The marks the comparison loader may already put on a round (`ChCompareRound.excluded`). */
export type TourLoaderMark = 'nine-holes' | 'individual' | 'wd' | 'dq' | 'no-shot-data' | 'coach-excluded';

export interface TourHoleRow {
  /** Hole number on the course, 1 to 18. */
  n: number;
  par: number;
  score: number | null;
  putts?: number | null;
  gir?: boolean | null;
  /** Fairway hit; null on a par 3 or when not recorded. */
  fir?: boolean | null;
}

/** The scoring engine's verdict on this player's score in a complete team round. Null when the team round is not complete. */
export interface TourRoundCounting {
  counted: boolean;
  /** Tied at the counting boundary (the engine picked who counts by slot). */
  tie: boolean;
  /** The worst counting score of the round (the line a dropped player missed). */
  line: number | null;
  /** The best dropped score of the round (the first score out); null when the drop has no score (a WD). */
  drop: number | null;
  lineupSize: number;
}

export interface TourMetricRound {
  /** `golf_rounds.id`, or `entered:<roundEventId>:<playerId>` for an entered score. */
  id: string;
  playerId: string;
  /** yyyy-mm-dd, in the team's time zone. */
  date: string;
  context?: 'event' | 'qualifier' | 'practice';
  eventId?: string | null;
  roundEventId?: string | null;
  roundNumber?: number | null;
  /** Rounds in the event, so the last one can be told apart (closing nine). */
  roundsInEvent?: number | null;
  /** Declared holes: 9 or 18. */
  holes: number;
  /** Posted as a total (or entered by a coach): counts in score metrics, never in hole or strokes-gained ones. */
  totalOnly: boolean;
  score: number | null;
  toPar: number | null;
  /** Score less that round's field average per player. */
  vsField?: number | null;
  counting?: TourRoundCounting | null;
  sg?: { total: number | null; ott: number | null; app: number | null; arg: number | null; putt: number | null } | null;
  cache?: {
    gir: number | null;
    girOf: number | null;
    fw: number | null;
    fwOf: number | null;
    putts: number | null;
    birdiesPlus?: number | null;
    pars?: number | null;
  } | null;
  holeRows?: TourHoleRow[];
  /** Nine totals and pars, when holes are not loaded (an entered score with its nines). */
  nines?: { front: number | null; back: number | null; frontPar: number | null; backPar: number | null } | null;
  /** First hole played (shotgun or two-tee start), so "the next hole" follows play order. Defaults to the first hole. */
  startHole?: number | null;
  /** Entry role in that event round. Null outside an event. */
  role?: 'lineup' | 'alternate' | 'individual' | null;
  status?: 'ok' | 'wd' | 'dq';
  /** Holes completed before a WD, for "WD after 11". */
  wdThru?: number | null;
  /** D-92: only the A squad feeds team figures. */
  squad?: 'a' | 'b';
  excluded?: TourLoaderMark;
  /** The `golf_rounds` columns of a linked round. When present, the Stats rules apply (`isScoreCountable`, `isCountableRound`). */
  countable?: CountableRoundInput | null;
}

/** `player`: one player's own figures (individual entries count). `team`: a team pool (individual entries and B squads do not). */
export interface MetricOptions {
  subject?: 'player' | 'team';
  /**
   * Gap to drop over every lineup round, with a dropped round contributing `line − score` (zero or below), instead of counting
   * rounds only (10.1, the default).
   */
  includeDropped?: boolean;
}

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Exclusions                                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------------ */

export type TourExclusion =
  | TourLoaderMark
  | 'not-finished'
  | 'test-round'
  | 'unsupported-length'
  | 'holes-missing'
  | 'implausible-score'
  | 'implausible-sg'
  | 'no-score'
  | 'no-par'
  | 'no-field'
  | 'totals-only'
  | 'no-holes'
  | 'no-gir'
  | 'no-fir'
  | 'no-putts'
  | 'no-back-nine'
  | 'not-paired'
  | 'not-lineup'
  | 'b-squad'
  | 'team-incomplete'
  | 'no-drop'
  | 'not-matched';

export interface MetricExclusion {
  /** The round's id; for a team metric (drop differential), the event round's id. */
  roundId: string;
  reason: TourExclusion;
  /** Holes completed before a WD. */
  thru?: number;
}

const EXCLUSION_WORDS: Record<TourExclusion, string> = {
  'nine-holes': 'Excluded: nine holes',
  individual: 'Excluded: individual entry',
  wd: 'Excluded: WD',
  dq: 'Excluded: DQ',
  'no-shot-data': 'Excluded: no shot data',
  'coach-excluded': 'Excluded by the coach',
  'not-finished': 'Excluded: not finished',
  'test-round': 'Excluded: test round',
  'unsupported-length': 'Excluded: not 9 or 18 holes',
  'holes-missing': 'Excluded: holes missing',
  'implausible-score': 'Excluded: score not plausible',
  'implausible-sg': 'Excluded: strokes gained not plausible',
  'no-score': 'Excluded: no score',
  'no-par': 'Excluded: no par',
  'no-field': 'Excluded: no field average',
  'totals-only': 'Excluded: total only',
  'no-holes': 'Excluded: no hole scores',
  'no-gir': 'Excluded: greens not recorded',
  'no-fir': 'Excluded: fairways not recorded',
  'no-putts': 'Excluded: putts not recorded',
  'no-back-nine': 'Excluded: back nine not recorded',
  'not-paired': 'Excluded: no other round that day',
  'not-lineup': 'Excluded: not in the lineup',
  'b-squad': 'Excluded: B team round',
  'team-incomplete': 'Excluded: team round not complete',
  'no-drop': 'Excluded: no dropped score',
  'not-matched': 'Excluded: player not on both sides',
};

/** The evidence drawer's words for an exclusion: "Excluded: nine holes", or "WD after 11" when the holes are known. */
export function exclusionWords(e: Pick<MetricExclusion, 'reason' | 'thru'>): string {
  if (e.reason === 'wd' && e.thru != null) return `WD after ${e.thru}`;
  return EXCLUSION_WORDS[e.reason];
}

const COUNTABLE_REASON: Record<RoundExclusionReason, TourExclusion> = {
  not_completed: 'not-finished',
  test_round: 'test-round',
  unsupported_length: 'unsupported-length',
  holes_missing: 'holes-missing',
  implausible_score: 'implausible-score',
  implausible_sg: 'implausible-sg',
};

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Thresholds (10.2) and floors (10.4)                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------------ */

/** Mirrors `MIN_SG_ROUNDS` in `data/season.ts`, which is server-only and cannot be imported into this client-safe module. */
export const MIN_SG_ROUNDS = 3;

/** 10.2: a value shows from one round (one with holes for a hole metric), and is solid from these counts. */
export const SOLID_AT = { score: 3, holes: 3, sg: MIN_SG_ROUNDS, counting: 4 } as const;

/** 10.4: counting rate has one outcome per team round, so it gets its own comparison floor beside the shared ones. */
export const COUNTING_FLOOR = { show: 2, early: 5, unit: 'team round' } as const;

export const TOUR_FLOORS = { ...FLOORS, counting: COUNTING_FLOOR } as const;
export type TourFloorKind = keyof typeof TOUR_FLOORS;

/** `sampleState` over the shared floors plus the counting one. */
export function tourSampleState(kind: TourFloorKind, n: number | null | undefined): SampleState {
  const f = TOUR_FLOORS[kind];
  if (n == null || Number.isNaN(n) || n < f.show) return 'none';
  return n < f.early ? 'early' : 'steady';
}

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Catalogue (10.1)                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------------ */

export type TourMetricKey =
  | 'score_avg'
  | 'to_par_avg'
  | 'vs_field'
  | 'count_rate'
  | 'gap_drop'
  | 'drop_diff'
  | 'par3'
  | 'par4'
  | 'par5'
  | 'birdie_rate'
  | 'bogey_avoid'
  | 'bounce_back'
  | 'gir'
  | 'fir'
  | 'putts'
  | 'sg_total'
  | 'sg_ott'
  | 'sg_app'
  | 'sg_arg'
  | 'sg_putt'
  | 'r36_split'
  | 'closing9';

export interface MetricDef {
  key: TourMetricKey;
  label: string;
  unit: 'strokes' | '%' | 'putts' | 'sg';
  /** How a difference between two values is written: rates in points, never relative percentages. */
  diffUnit: 'strokes' | 'pts' | 'putts' | 'sg';
  better: 'lower' | 'higher';
  needs: 'totals' | 'field averages' | 'event links' | 'holes' | 'holes with GIR' | 'holes with FIR' | 'putts' | 'shot data' | 'nines';
  /** 10.2's solid threshold for this metric, in rounds (team rounds for the counting ones). */
  solidAt: number;
  /** The comparison floor (10.4). */
  floor: TourFloorKind;
  /** Minimum meaningful difference (10.4). */
  mmd: number;
  /** The figure's formula in words, for the evidence drawer. */
  formula: string;
  /** A team figure (no player-level value). */
  team?: true;
}

const def = (d: MetricDef): MetricDef => d;

export const METRICS: Record<TourMetricKey, MetricDef> = {
  score_avg: def({ key: 'score_avg', label: 'Scoring average', unit: 'strokes', diffUnit: 'strokes', better: 'lower', needs: 'totals', solidAt: SOLID_AT.score, floor: 'score', mmd: 0.3, formula: 'Scoring average = mean of 18-hole round scores' }),
  to_par_avg: def({ key: 'to_par_avg', label: 'To par', unit: 'strokes', diffUnit: 'strokes', better: 'lower', needs: 'totals', solidAt: SOLID_AT.score, floor: 'score', mmd: 0.3, formula: 'To par = mean of 18-hole round scores to par' }),
  vs_field: def({ key: 'vs_field', label: 'Vs field', unit: 'strokes', diffUnit: 'strokes', better: 'lower', needs: 'field averages', solidAt: SOLID_AT.score, floor: 'score', mmd: 0.3, formula: 'Vs field = mean of (round score − field average for that round)' }),
  count_rate: def({ key: 'count_rate', label: 'Counting rate', unit: '%', diffUnit: 'pts', better: 'higher', needs: 'event links', solidAt: SOLID_AT.counting, floor: 'counting', mmd: 1, formula: 'Counting rate = rounds that counted ÷ rounds played in team events' }),
  gap_drop: def({ key: 'gap_drop', label: 'Gap to drop', unit: 'strokes', diffUnit: 'strokes', better: 'higher', needs: 'event links', solidAt: SOLID_AT.counting, floor: 'counting', mmd: 0.3, formula: 'Gap to drop = mean of (dropped score − own score) over rounds that counted' }),
  drop_diff: def({ key: 'drop_diff', label: 'Drop score differential', unit: 'strokes', diffUnit: 'strokes', better: 'lower', needs: 'event links', solidAt: SOLID_AT.score, floor: 'counting', mmd: 0.3, formula: 'Drop score differential = mean of (dropped scores’ mean − counting scores’ mean) per team round', team: true }),
  par3: def({ key: 'par3', label: 'Par-3 scoring', unit: 'strokes', diffUnit: 'strokes', better: 'lower', needs: 'holes', solidAt: SOLID_AT.holes, floor: 'holes', mmd: 0.05, formula: 'Par-3 scoring = mean score to par on par-3 holes' }),
  par4: def({ key: 'par4', label: 'Par-4 scoring', unit: 'strokes', diffUnit: 'strokes', better: 'lower', needs: 'holes', solidAt: SOLID_AT.holes, floor: 'holes', mmd: 0.05, formula: 'Par-4 scoring = mean score to par on par-4 holes' }),
  par5: def({ key: 'par5', label: 'Par-5 scoring', unit: 'strokes', diffUnit: 'strokes', better: 'lower', needs: 'holes', solidAt: SOLID_AT.holes, floor: 'holes', mmd: 0.05, formula: 'Par-5 scoring = mean score to par on par-5 holes' }),
  birdie_rate: def({ key: 'birdie_rate', label: 'Birdies or better', unit: '%', diffUnit: 'pts', better: 'higher', needs: 'holes', solidAt: SOLID_AT.holes, floor: 'holes', mmd: 1, formula: 'Birdies or better = holes at birdie or better ÷ holes' }),
  bogey_avoid: def({ key: 'bogey_avoid', label: 'Bogey avoidance', unit: '%', diffUnit: 'pts', better: 'higher', needs: 'holes', solidAt: SOLID_AT.holes, floor: 'holes', mmd: 1, formula: 'Bogey avoidance = holes at par or better ÷ holes' }),
  bounce_back: def({ key: 'bounce_back', label: 'Bounce back', unit: '%', diffUnit: 'pts', better: 'higher', needs: 'holes', solidAt: SOLID_AT.holes, floor: 'holes', mmd: 1, formula: 'Bounce back = birdie or better on the hole after a bogey or worse ÷ those chances' }),
  gir: def({ key: 'gir', label: 'Greens in regulation', unit: '%', diffUnit: 'pts', better: 'higher', needs: 'holes with GIR', solidAt: SOLID_AT.holes, floor: 'holes', mmd: 1, formula: 'Greens in regulation = greens hit ÷ greens possible' }),
  fir: def({ key: 'fir', label: 'Fairways', unit: '%', diffUnit: 'pts', better: 'higher', needs: 'holes with FIR', solidAt: SOLID_AT.holes, floor: 'holes', mmd: 1, formula: 'Fairways = fairways hit ÷ fairways possible' }),
  putts: def({ key: 'putts', label: 'Putts per round', unit: 'putts', diffUnit: 'putts', better: 'lower', needs: 'putts', solidAt: SOLID_AT.holes, floor: 'score', mmd: 0.3, formula: 'Putts per round = mean putts over 18-hole rounds with putts' }),
  sg_total: def({ key: 'sg_total', label: 'Strokes gained', unit: 'sg', diffUnit: 'sg', better: 'higher', needs: 'shot data', solidAt: SOLID_AT.sg, floor: 'sgLong', mmd: 0.05, formula: 'Strokes gained = mean per 18-hole round with shot data' }),
  sg_ott: def({ key: 'sg_ott', label: 'SG off the tee', unit: 'sg', diffUnit: 'sg', better: 'higher', needs: 'shot data', solidAt: SOLID_AT.sg, floor: 'sgLong', mmd: 0.15, formula: 'SG off the tee = mean per 18-hole round with shot data' }),
  sg_app: def({ key: 'sg_app', label: 'SG approach', unit: 'sg', diffUnit: 'sg', better: 'higher', needs: 'shot data', solidAt: SOLID_AT.sg, floor: 'sgLong', mmd: 0.15, formula: 'SG approach = mean per 18-hole round with shot data' }),
  sg_arg: def({ key: 'sg_arg', label: 'SG around the green', unit: 'sg', diffUnit: 'sg', better: 'higher', needs: 'shot data', solidAt: SOLID_AT.sg, floor: 'sgShort', mmd: 0.15, formula: 'SG around the green = mean per 18-hole round with shot data' }),
  sg_putt: def({ key: 'sg_putt', label: 'SG putting', unit: 'sg', diffUnit: 'sg', better: 'higher', needs: 'shot data', solidAt: SOLID_AT.sg, floor: 'sgShort', mmd: 0.15, formula: 'SG putting = mean per 18-hole round with shot data' }),
  r36_split: def({ key: 'r36_split', label: '36-hole-day split', unit: 'strokes', diffUnit: 'strokes', better: 'lower', needs: 'event links', solidAt: SOLID_AT.score, floor: 'score', mmd: 0.3, formula: '36-hole-day split = mean of (second round − first round) on 36-hole days' }),
  closing9: def({ key: 'closing9', label: 'Closing nine', unit: 'strokes', diffUnit: 'strokes', better: 'lower', needs: 'nines', solidAt: SOLID_AT.score, floor: 'score', mmd: 0.3, formula: 'Closing nine = final-round back nine to par − season back nine to par' }),
};

export const METRIC_KEYS = Object.keys(METRICS) as TourMetricKey[];

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Result                                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------------ */

export interface MetricPoint {
  roundId: string;
  /** The round's own value (a rate in percent, a per-hole mean, a per-round figure). */
  value: number;
  /** Attempts behind it for a rate or a per-hole mean; 1 for a per-round figure. */
  weight: number;
}

export interface MetricResult {
  key: TourMetricKey;
  value: number | null;
  /** Rounds the value rests on (team rounds for the counting metrics). */
  n: number;
  solid: boolean;
  excluded: MetricExclusion[];
  /** Rates: Σ made and Σ attempts. Per-hole means: holes in `of`. */
  made?: number;
  of?: number;
  /** One point per included round, for the drill-down and for round-clustered standard errors. */
  perRound: MetricPoint[];
}

function result(key: TourMetricKey, value: number | null, n: number, excluded: MetricExclusion[], perRound: MetricPoint[], extra?: { made?: number; of?: number }, solidN = n): MetricResult {
  const v = value != null && Number.isFinite(value) ? value : null;
  return { key, value: v, n, solid: v != null && solidN >= METRICS[key].solidAt, excluded, perRound, ...extra };
}

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Shared gates                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------------ */

const statusOf = (r: TourMetricRound): 'ok' | 'wd' | 'dq' => r.status ?? (r.excluded === 'wd' ? 'wd' : r.excluded === 'dq' ? 'dq' : 'ok');
const roleOf = (r: TourMetricRound) => r.role ?? (r.excluded === 'individual' ? 'individual' : null);

function wdExclusion(r: TourMetricRound): MetricExclusion {
  return r.wdThru != null ? { roundId: r.id, reason: 'wd', thru: r.wdThru } : { roundId: r.id, reason: 'wd' };
}

/** Out of every figure: the coach left it out, WD or DQ (10.3), or not countable by the Stats rules. */
function baseGate(r: TourMetricRound): MetricExclusion | null {
  if (r.excluded === 'coach-excluded') return { roundId: r.id, reason: 'coach-excluded' };
  const status = statusOf(r);
  if (status === 'wd') return wdExclusion(r);
  if (status === 'dq') return { roundId: r.id, reason: 'dq' };
  if (r.countable && !isScoreCountable(r.countable)) {
    const why = roundExclusionReason(r.countable);
    return { roundId: r.id, reason: why ? COUNTABLE_REASON[why] : 'holes-missing' };
  }
  if (r.score == null) return { roundId: r.id, reason: 'no-score' };
  return null;
}

/** A team pool leaves out individual entries and B squads (10.3, D-92). */
function subjectGate(r: TourMetricRound, opts: MetricOptions): MetricExclusion | null {
  if (opts.subject !== 'team') return null;
  if (roleOf(r) === 'individual') return { roundId: r.id, reason: 'individual' };
  if (r.squad === 'b') return { roundId: r.id, reason: 'b-squad' };
  return null;
}

/** 18-hole averages leave nine-hole rounds out; they are kept as nine and never doubled. */
function lengthGate(r: TourMetricRound): MetricExclusion | null {
  if (r.holes === 18) return null;
  return { roundId: r.id, reason: r.holes === 9 ? 'nine-holes' : 'unsupported-length' };
}

/** Hole and strokes-gained figures read only rounds scored hole by hole (Q-123): totals and coach entries are out. */
function holeGate(r: TourMetricRound): MetricExclusion | null {
  const totalsOnly = r.totalOnly || (r.countable != null && !isCountableRound(r.countable));
  return totalsOnly ? { roundId: r.id, reason: 'totals-only' } : null;
}

function firstOf(...gates: Array<MetricExclusion | null>): MetricExclusion | null {
  for (const g of gates) if (g) return g;
  return null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Per-round figures (18-hole averages)                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------------ */

type RoundValue = (r: TourMetricRound) => number | MetricExclusion;

/** A mean of one value per 18-hole round. `holeLevel` adds the totals-only gate (putts, strokes gained). */
function perRoundMean(key: TourMetricKey, rounds: readonly TourMetricRound[], opts: MetricOptions, read: RoundValue, holeLevel: boolean): MetricResult {
  const excluded: MetricExclusion[] = [];
  const points: MetricPoint[] = [];
  for (const r of rounds) {
    const gate = firstOf(subjectGate(r, opts), baseGate(r), lengthGate(r), holeLevel ? holeGate(r) : null);
    if (gate) {
      excluded.push(gate);
      continue;
    }
    const v = read(r);
    if (typeof v === 'number') points.push({ roundId: r.id, value: v, weight: 1 });
    else excluded.push(v);
  }
  return result(key, avg(points.map((p) => p.value)), points.length, excluded, points);
}

const scoreOf: RoundValue = (r) => r.score as number;
const toParOf: RoundValue = (r) => (r.toPar != null ? r.toPar : { roundId: r.id, reason: 'no-par' });
const vsFieldOf: RoundValue = (r) => (r.vsField != null ? r.vsField : { roundId: r.id, reason: 'no-field' });

/** A round's putts: the holes' own when every scored hole has them, else the cache's total. Zero is "not recorded". */
function puttsOf(r: TourMetricRound): number | MetricExclusion {
  const scored = (r.holeRows ?? []).filter((h) => h.score != null);
  const fromHoles = scored.length > 0 && scored.every((h) => h.putts != null) ? sum(scored.map((h) => h.putts as number)) : null;
  const putts = recordedPutts(fromHoles ?? r.cache?.putts ?? null);
  return putts != null ? putts : { roundId: r.id, reason: 'no-putts' };
}

type SgKey = 'total' | 'ott' | 'app' | 'arg' | 'putt';
const sgOf =
  (k: SgKey): RoundValue =>
  (r) => {
    const v = r.excluded === 'no-shot-data' ? null : (r.sg?.[k] ?? null);
    return v != null && Number.isFinite(v) ? v : { roundId: r.id, reason: 'no-shot-data' };
  };

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Hole figures (nine-hole rounds included)                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------------ */

interface HoleTally {
  made: number;
  of: number;
}

type HoleRead = (r: TourMetricRound) => HoleTally | MetricExclusion | null;

/**
 * A rate (or a per-hole mean) over holes: Σ made ÷ Σ of across rounds. A round whose holes hold none of what the figure reads
 * (a nine with no par 5) is neither in nor out: it returns null.
 */
function holeFigure(key: TourMetricKey, rounds: readonly TourMetricRound[], opts: MetricOptions, read: HoleRead, scale: number): MetricResult {
  const excluded: MetricExclusion[] = [];
  const points: MetricPoint[] = [];
  let made = 0;
  let of = 0;
  for (const r of rounds) {
    const gate = firstOf(subjectGate(r, opts), baseGate(r), holeGate(r));
    if (gate) {
      excluded.push(gate);
      continue;
    }
    const t = read(r);
    if (t == null) continue;
    if ('reason' in t) {
      excluded.push(t);
      continue;
    }
    if (t.of <= 0) continue;
    made += t.made;
    of += t.of;
    points.push({ roundId: r.id, value: (t.made / t.of) * scale, weight: t.of });
  }
  return result(key, of > 0 ? (made / of) * scale : null, points.length, excluded, points, { made, of });
}

function scoredHoles(r: TourMetricRound): TourHoleRow[] {
  return (r.holeRows ?? []).filter((h) => h.score != null);
}

const noHoles = (r: TourMetricRound): MetricExclusion => ({ roundId: r.id, reason: 'no-holes' });

const parScoring =
  (par: 3 | 4 | 5): HoleRead =>
  (r) => {
    const holes = scoredHoles(r);
    if (!holes.length) return noHoles(r);
    const these = holes.filter((h) => h.par === par);
    if (!these.length) return null;
    return { made: sum(these.map((h) => (h.score as number) - h.par)), of: these.length };
  };

/** Holes meeting `test`, from the holes, else the round's cached counts (`fromCache`). */
const outcomeShare =
  (test: (h: TourHoleRow) => boolean, fromCache: (c: NonNullable<TourMetricRound['cache']>) => number | null): HoleRead =>
  (r) => {
    const holes = scoredHoles(r);
    if (holes.length) return { made: holes.filter(test).length, of: holes.length };
    const cached = r.cache ? fromCache(r.cache) : null;
    return cached != null ? { made: cached, of: r.holes } : noHoles(r);
  };

const birdieRead = outcomeShare(
  (h) => (h.score as number) <= h.par - 1,
  (c) => c.birdiesPlus ?? null,
);
const bogeyAvoidRead = outcomeShare(
  (h) => (h.score as number) <= h.par,
  (c) => (c.birdiesPlus != null && c.pars != null ? c.birdiesPlus + c.pars : null),
);

/**
 * The holes in the order they were played. A shotgun or two-tee start begins at `startHole` and wraps from the last hole of the
 * layout (18, or 9 or 18 for a nine) to its first.
 */
function playOrder(r: TourMetricRound): { holes: TourHoleRow[]; next: (a: TourHoleRow, b: TourHoleRow) => boolean } {
  const rows = [...(r.holeRows ?? [])].sort((a, b) => a.n - b.n);
  const lowest = rows[0]?.n ?? 1;
  const first = r.holes === 9 && lowest >= 10 ? 10 : 1;
  const last = r.holes === 9 ? first + 8 : 18;
  const start = r.startHole != null && rows.some((h) => h.n === r.startHole) ? r.startHole : null;
  const ordered = start == null ? rows : [...rows.filter((h) => h.n >= start), ...rows.filter((h) => h.n < start)];
  return { holes: ordered, next: (a, b) => b.n === a.n + 1 || (a.n === last && b.n === first) };
}

/** Bounce back: a bogey or worse with a scored next hole in the same round is a chance; birdie or better there converts it. */
const bounceRead: HoleRead = (r) => {
  if (!scoredHoles(r).length) return noHoles(r);
  const { holes, next } = playOrder(r);
  let made = 0;
  let of = 0;
  for (let i = 0; i < holes.length - 1; i++) {
    const a = holes[i];
    const b = holes[i + 1];
    if (!a || !b || a.score == null || b.score == null || a.score <= a.par || !next(a, b)) continue;
    of += 1;
    if (b.score <= b.par - 1) made += 1;
  }
  return { made, of };
};

const girRead: HoleRead = (r) => {
  const marked = scoredHoles(r).filter((h) => h.gir != null);
  if (marked.length) return { made: marked.filter((h) => h.gir === true).length, of: marked.length };
  const c = r.cache;
  if (c && c.gir != null && c.girOf != null && c.girOf > 0) return { made: c.gir, of: c.girOf };
  return { roundId: r.id, reason: 'no-gir' };
};

const firRead: HoleRead = (r) => {
  const marked = scoredHoles(r).filter((h) => h.par !== 3 && h.fir != null);
  if (marked.length) return { made: marked.filter((h) => h.fir === true).length, of: marked.length };
  const c = r.cache;
  if (c && c.fw != null && c.fwOf != null && c.fwOf > 0) return { made: c.fw, of: c.fwOf };
  return { roundId: r.id, reason: 'no-fir' };
};

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Counting figures (precomputed counting sets)                                                                              */
/* ------------------------------------------------------------------------------------------------------------------------ */

/**
 * The lineup rounds a counting figure reads: event rounds as a lineup player in a complete A-squad team round. Individuals,
 * alternates who did not play in the lineup, B squads, WD and DQ, and rounds whose team round is not complete are listed out.
 * Rounds outside an event are out of scope and not listed.
 */
function lineupRounds(rounds: readonly TourMetricRound[]): { inScope: Array<TourMetricRound & { counting: TourRoundCounting }>; excluded: MetricExclusion[] } {
  const inScope: Array<TourMetricRound & { counting: TourRoundCounting }> = [];
  const excluded: MetricExclusion[] = [];
  for (const r of rounds) {
    if (!r.roundEventId) continue;
    const role = roleOf(r);
    const status = statusOf(r);
    const gate: MetricExclusion | null =
      r.excluded === 'coach-excluded'
        ? { roundId: r.id, reason: 'coach-excluded' }
        : role === 'individual'
          ? { roundId: r.id, reason: 'individual' }
          : role === 'alternate'
            ? { roundId: r.id, reason: 'not-lineup' }
            : r.squad === 'b'
              ? { roundId: r.id, reason: 'b-squad' }
              : status === 'wd'
                ? wdExclusion(r)
                : status === 'dq'
                  ? { roundId: r.id, reason: 'dq' }
                  : r.counting == null
                    ? { roundId: r.id, reason: 'team-incomplete' }
                    : null;
    if (gate) excluded.push(gate);
    else inScope.push(r as TourMetricRound & { counting: TourRoundCounting });
  }
  return { inScope, excluded };
}

export function countRate(rounds: readonly TourMetricRound[]): MetricResult {
  const { inScope, excluded } = lineupRounds(rounds);
  const made = inScope.filter((r) => r.counting.counted).length;
  const of = inScope.length;
  const points = inScope.map((r) => ({ roundId: r.id, value: r.counting.counted ? 100 : 0, weight: 1 }));
  return result('count_rate', of ? (made / of) * 100 : null, of, excluded, points, { made, of });
}

export function gapToDrop(rounds: readonly TourMetricRound[], opts: MetricOptions = {}): MetricResult {
  const { inScope, excluded } = lineupRounds(rounds);
  const points: MetricPoint[] = [];
  for (const r of inScope) {
    if (!r.counting.counted && !opts.includeDropped) continue;
    const against = r.counting.counted ? r.counting.drop : r.counting.line;
    if (against == null || r.score == null) excluded.push({ roundId: r.id, reason: 'no-drop' });
    else points.push({ roundId: r.id, value: against - r.score, weight: 1 });
  }
  return result('gap_drop', avg(points.map((p) => p.value)), points.length, excluded, points);
}

/** Drop score differential (team): per complete team round, the dropped scores' mean less the counting scores' mean. */
export function dropDiff(rounds: readonly TourMetricRound[]): MetricResult {
  // Player rows out of scope (individuals, alternates, WD, DQ) are simply not scores here; the team round is the unit listed.
  const { inScope } = lineupRounds(rounds);
  const byRound = new Map<string, Array<TourMetricRound & { counting: TourRoundCounting }>>();
  for (const r of inScope) {
    const key = r.roundEventId as string;
    byRound.set(key, [...(byRound.get(key) ?? []), r]);
  }
  const excluded: MetricExclusion[] = [];
  const points: MetricPoint[] = [];
  for (const [roundEventId, rows] of byRound) {
    const counted = rows.filter((r) => r.counting.counted && r.score != null).map((r) => r.score as number);
    const dropped = rows.filter((r) => !r.counting.counted && r.score != null).map((r) => r.score as number);
    const dropMean = avg(dropped);
    const countMean = avg(counted);
    if (dropMean == null || countMean == null) excluded.push({ roundId: roundEventId, reason: 'no-drop' });
    else points.push({ roundId: roundEventId, value: dropMean - countMean, weight: 1 });
  }
  return result('drop_diff', avg(points.map((p) => p.value)), points.length, excluded, points);
}

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Event-shape figures                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------------ */

/**
 * 36-hole-day split: per player and 36-hole day (two rounds of one event on one date), the second round less the first. A day
 * with only one usable round is listed out. Rounds outside such days are out of scope and not listed.
 */
export function r36Split(rounds: readonly TourMetricRound[], opts: MetricOptions = {}): MetricResult {
  const days = new Map<string, TourMetricRound[]>();
  for (const r of rounds) {
    if (!r.eventId || r.roundNumber == null) continue;
    const key = `${r.playerId}|${r.eventId}|${r.date}`;
    days.set(key, [...(days.get(key) ?? []), r]);
  }
  const excluded: MetricExclusion[] = [];
  const points: MetricPoint[] = [];
  for (const day of days.values()) {
    if (new Set(day.map((r) => r.roundNumber)).size < 2) continue;
    const ordered = [...day].sort((a, b) => (a.roundNumber as number) - (b.roundNumber as number));
    const usable: TourMetricRound[] = [];
    for (const r of ordered) {
      const gate = firstOf(subjectGate(r, opts), baseGate(r), lengthGate(r));
      if (gate) excluded.push(gate);
      else usable.push(r);
    }
    const first = usable[0];
    const second = usable[1];
    if (!first || !second || first.roundNumber === second.roundNumber) {
      for (const r of usable) excluded.push({ roundId: r.id, reason: 'not-paired' });
      continue;
    }
    points.push({ roundId: second.id, value: (second.score as number) - (first.score as number), weight: 1 });
  }
  return result('r36_split', avg(points.map((p) => p.value)), points.length, excluded, points);
}

/** A round's back nine to par: holes 10 to 18 when all are scored, else the entered nines. */
function backNineToPar(r: TourMetricRound): number | null {
  const back = (r.holeRows ?? []).filter((h) => h.n >= 10 && h.n <= 18);
  if (back.length === 9 && back.every((h) => h.score != null)) return sum(back.map((h) => (h.score as number) - h.par));
  const nines = r.nines;
  if (nines && nines.back != null && nines.backPar != null) return nines.back - nines.backPar;
  return null;
}

const isFinalRound = (r: TourMetricRound) => r.roundNumber != null && r.roundsInEvent != null && r.roundNumber === r.roundsInEvent;

/**
 * Closing nine: the final rounds' back nine to par less the back nine to par of every other 18-hole round in the window (the
 * season baseline leaves the final rounds out, so they are not compared with themselves). `n` is the final rounds; the value is
 * solid once both the final rounds and the baseline reach the score threshold.
 */
export function closingNine(rounds: readonly TourMetricRound[], opts: MetricOptions = {}): MetricResult {
  const excluded: MetricExclusion[] = [];
  const finals: MetricPoint[] = [];
  const baseline: number[] = [];
  for (const r of rounds) {
    const gate = firstOf(subjectGate(r, opts), baseGate(r), lengthGate(r));
    if (gate) {
      excluded.push(gate);
      continue;
    }
    const back = backNineToPar(r);
    if (back == null) excluded.push({ roundId: r.id, reason: 'no-back-nine' });
    else if (isFinalRound(r)) finals.push({ roundId: r.id, value: back, weight: 1 });
    else baseline.push(back);
  }
  const finalMean = avg(finals.map((p) => p.value));
  const baseMean = avg(baseline);
  const value = finalMean != null && baseMean != null ? finalMean - baseMean : null;
  const solidN = Math.min(finals.length, baseline.length);
  const points = baseMean == null ? finals : finals.map((p) => ({ ...p, value: p.value - baseMean }));
  return result('closing9', value, finals.length, excluded, points, undefined, solidN);
}

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Entry points                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------------ */

/** One metric over a window of rounds. The rounds are already scoped (player or team, season, context) by the caller. */
export function metric(key: TourMetricKey, rounds: readonly TourMetricRound[], opts: MetricOptions = {}): MetricResult {
  switch (key) {
    case 'score_avg':
      return perRoundMean(key, rounds, opts, scoreOf, false);
    case 'to_par_avg':
      return perRoundMean(key, rounds, opts, toParOf, false);
    case 'vs_field':
      return perRoundMean(key, rounds, opts, vsFieldOf, false);
    case 'putts':
      return perRoundMean(key, rounds, opts, puttsOf, true);
    case 'sg_total':
      return perRoundMean(key, rounds, opts, sgOf('total'), true);
    case 'sg_ott':
      return perRoundMean(key, rounds, opts, sgOf('ott'), true);
    case 'sg_app':
      return perRoundMean(key, rounds, opts, sgOf('app'), true);
    case 'sg_arg':
      return perRoundMean(key, rounds, opts, sgOf('arg'), true);
    case 'sg_putt':
      return perRoundMean(key, rounds, opts, sgOf('putt'), true);
    case 'par3':
      return holeFigure(key, rounds, opts, parScoring(3), 1);
    case 'par4':
      return holeFigure(key, rounds, opts, parScoring(4), 1);
    case 'par5':
      return holeFigure(key, rounds, opts, parScoring(5), 1);
    case 'birdie_rate':
      return holeFigure(key, rounds, opts, birdieRead, 100);
    case 'bogey_avoid':
      return holeFigure(key, rounds, opts, bogeyAvoidRead, 100);
    case 'bounce_back':
      return holeFigure(key, rounds, opts, bounceRead, 100);
    case 'gir':
      return holeFigure(key, rounds, opts, girRead, 100);
    case 'fir':
      return holeFigure(key, rounds, opts, firRead, 100);
    case 'count_rate':
      return countRate(rounds);
    case 'gap_drop':
      return gapToDrop(rounds, opts);
    case 'drop_diff':
      return dropDiff(rounds);
    case 'r36_split':
      return r36Split(rounds, opts);
    case 'closing9':
      return closingNine(rounds, opts);
  }
}

/** Every metric in the catalogue over one window. */
export function allMetrics(rounds: readonly TourMetricRound[], opts: MetricOptions = {}): Record<TourMetricKey, MetricResult> {
  return Object.fromEntries(METRIC_KEYS.map((k) => [k, metric(k, rounds, opts)])) as Record<TourMetricKey, MetricResult>;
}

/**
 * Matched team subjects (10.3): only rounds of players present on both sides. Pooled is the rounds as given; matched lists the
 * rest as "player not on both sides".
 */
export function matchRounds(
  a: readonly TourMetricRound[],
  b: readonly TourMetricRound[],
): { a: TourMetricRound[]; b: TourMetricRound[]; players: string[]; excluded: { a: MetricExclusion[]; b: MetricExclusion[] } } {
  const inB = new Set(b.map((r) => r.playerId));
  const players = [...new Set(a.map((r) => r.playerId))].filter((id) => inB.has(id)).sort();
  const both = new Set(players);
  const split = (rs: readonly TourMetricRound[]) => ({
    kept: rs.filter((r) => both.has(r.playerId)),
    out: rs.filter((r) => !both.has(r.playerId)).map((r): MetricExclusion => ({ roundId: r.id, reason: 'not-matched' })),
  });
  const sa = split(a);
  const sb = split(b);
  return { a: sa.kept, b: sb.kept, players, excluded: { a: sa.out, b: sb.out } };
}
