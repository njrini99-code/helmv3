/**
 * CoachHelm reads, stage 2: the counted reads of the catalogue ranked 3 to 12 (COACHHELM_2_TO_10.md section 3), each
 * with its floor, and the test that decides which become signals.
 *
 *   doubles            doubles or worse a round, and what each was made of (a penalty, three putts, two shots around the green)  S2
 *   mistakes           the mistakes count a round: doubles, par 5 bogeys, three putts, bogeys after an approach from inside 150 in the fairway  S3
 *   tee_penalties      penalty strokes from the tee a round, by kind and club                                     T3
 *   tee_miss_side      the share of missed fairways that went right (of those with a side)                        T1
 *   approach_length    how long the first approach on a par 4 is (what the tee shot leaves)                       T5 / A7
 *   first_putt_length  how long the first putt is (what the approach leaves)                                       P8
 *   chip_leave         what a shot around the green leaves, and how often the next putt goes in (chip or putt)    G1 / G2
 *   long_three_putts   three putts from 30 feet and longer                                                         P2
 *   par5_seconds       par 5 second shots from 200 and out: went for it or laid up, and the score. The choice is
 *                      inferred from where the ball finished, so this one is described only, never a signal.     S4
 *
 * The test is rule (b) of the notability, one level down: the player against the teammates’ median (leave one out), a
 * robust z on Student’s t, the player’s own 95% range clear of the median, Benjamini-Hochberg across the player’s
 * catalogue tests at the analyst’s false-discovery rate. Only a read in the worse direction can be a signal; at most
 * three, one per family, so no two say the same thing. Counted facts only. Pure.
 */
import { shotSgForRound } from '@/lib/coachhelm/v3/generators/insight-angles/shot-sg';
import { classifyParFiveLongApproach } from '@/lib/coachhelm/v3/metrics/layup-intent';
import { wilsonInterval } from '@/lib/coachhelm/v3/stats/intervals';
import { studentTSf } from '@/lib/coachhelm/v3/support/distributions';
import { benjaminiHochberg } from '@/lib/coachhelm/v3/support/multiplicity';
import { isPuttMade, puttMakeStartFeet } from '@/lib/golf/putt-make';
import { sgBaselineScale } from '@/lib/golf/sg-benchmarks';
import { isPenalty, leaveFeet, onGreen, rawShot, yardsOf } from '../breakdown';
import type { TeamRows } from '../fact-sheet';
import { ALPHA, FALSE_DISCOVERY_RATE, MAD_EFFICIENCY, MEDIAN_VARIANCE_FACTOR, MIN_TEAMMATES } from '../notability';
import type { HoleRow, ShotRow } from '../sources';
import { MAD_TO_SD, meanSummary, median, medianAbsoluteDeviation, tQuantile } from '../stats';
import type { FactSheet } from '../types';
import { Figures, oneDecimal, whole } from './format';
import type { CoachOnly } from './types';

export const MAX_SIGNALS = 3;

export type CatalogueId = 'doubles' | 'mistakes' | 'tee_penalties' | 'tee_miss_side' | 'approach_length' | 'first_putt_length' | 'chip_leave' | 'long_three_putts' | 'par5_seconds';

/** Reads in one family say the same kind of thing: at most one signal per family. */
export const FAMILY: Record<CatalogueId, string> = {
  doubles: 'scoring',
  mistakes: 'scoring',
  tee_penalties: 'tee',
  tee_miss_side: 'tee',
  approach_length: 'upstream_tee',
  first_putt_length: 'upstream_approach',
  chip_leave: 'short_game',
  long_three_putts: 'putting',
  par5_seconds: 'decisions',
};

/** One counted read: a value per round (a mean) or a share, with its sample, its floor and its words. */
export interface CatalogueRead {
  id: CatalogueId;
  family: string;
  label: string;
  /** Null under the floor (see withheld). */
  value: number | null;
  unit: 'per_round' | 'percent' | 'yards' | 'feet';
  direction: 'higher_is_worse' | 'lower_is_worse';
  /** For a share: count of of. For a mean: the observations averaged. */
  count: number;
  of: number;
  rounds: number;
  range95: { low: number; high: number } | null;
  withheld?: string;
  /** Described only (the choice is inferred): never tested, never a signal. */
  described_only?: boolean;
  text: string;
  /** Extra counted detail (kinds, clubs, the make-up), as data. */
  detail?: Record<string, number>;
  team: CoachOnly<{ median: number | null; teammates: number }> | null;
  figures: Record<string, string>;
}

export interface SignalRead {
  id: CatalogueId;
  family: string;
  rank: number;
  text: string;
  team_text: CoachOnly<string>;
  z: number;
  p_value: number;
  q_value: number;
}

interface HoleShots {
  hole_number: number;
  par: number | null;
  score: number | null;
  shots: Array<{ shot: ShotRow; category: 'off_tee' | 'approach' | 'around_green' | 'putting' }>;
}

const low = (s: string | null) => (s ?? '').toLowerCase();

function holesOf(shots: readonly ShotRow[], holes: readonly HoleRow[], scale: number): HoleShots[] {
  const par = new Map(holes.flatMap((h) => (typeof h.par === 'number' ? [[h.id, h.par] as const] : [])));
  const cat = new Map<string, HoleShots['shots'][number]['category']>();
  for (const v of shotSgForRound(shots.map(rawShot), par, scale)) cat.set(v.shotId, v.category);
  const out = new Map<number, HoleShots>();
  for (const h of holes) out.set(h.hole_number, { hole_number: h.hole_number, par: h.par, score: h.score, shots: [] });
  for (const s of [...shots].sort((a, b) => (a.hole_number ?? 0) - (b.hole_number ?? 0) || (a.shot_number ?? 0) - (b.shot_number ?? 0))) {
    const n = s.hole_number ?? holes.find((h) => h.id === s.hole_id)?.hole_number;
    if (n == null) continue;
    const c = cat.get(s.id) ?? (s.shot_type === 'putting' ? 'putting' : null);
    if (!c) continue;
    const entry = out.get(n) ?? { hole_number: n, par: null, score: null, shots: [] };
    entry.shots.push({ shot: s, category: c });
    out.set(n, entry);
  }
  return [...out.values()].sort((a, b) => a.hole_number - b.hole_number);
}

const isDouble = (h: HoleShots) => h.par != null && h.score != null && h.score - h.par >= 2;

interface Counts {
  rounds: number;
  doublesByRound: number[];
  doubleMakeup: { penalty: number; three_putt: number; two_short: number };
  mistakesByRound: number[];
  teePenaltiesByRound: number[];
  teePenaltyKinds: Record<string, number>;
  teePenaltyClubs: Record<string, number>;
  teeMisses: { left: number; right: number; none: number };
  approachYards: number[];
  firstPuttFeet: number[];
  chipLeaves: number[];
  nextPutt: { made: number; of: number };
  longFirstPutts: { three: number; of: number };
  par5: { wentFor: number[]; laidUp: number[] };
}

/** One player’s season of measured rounds, counted hole by hole. */
export function countPlayer(roundIds: readonly string[], rows: Pick<TeamRows, 'shots' | 'holes'>, scale: number): Counts {
  const c: Counts = {
    rounds: 0,
    doublesByRound: [],
    doubleMakeup: { penalty: 0, three_putt: 0, two_short: 0 },
    mistakesByRound: [],
    teePenaltiesByRound: [],
    teePenaltyKinds: {},
    teePenaltyClubs: {},
    teeMisses: { left: 0, right: 0, none: 0 },
    approachYards: [],
    firstPuttFeet: [],
    chipLeaves: [],
    nextPutt: { made: 0, of: 0 },
    longFirstPutts: { three: 0, of: 0 },
    par5: { wentFor: [], laidUp: [] },
  };
  for (const id of roundIds) {
    const holes = holesOf(rows.shots.filter((s) => s.round_id === id), rows.holes.filter((h) => h.round_id === id), scale);
    if (!holes.some((h) => h.shots.length)) continue;
    c.rounds += 1;
    let doubles = 0;
    let mistakes = 0;
    let teePen = 0;
    for (const h of holes) {
      const putts = h.shots.filter((x) => x.category === 'putting' && !isPenalty(x.shot));
      const short = h.shots.filter((x) => x.category === 'around_green' && !isPenalty(x.shot));
      const penalties = h.shots.filter((x) => isPenalty(x.shot));
      const toPar = h.par != null && h.score != null ? h.score - h.par : null;
      if (isDouble(h)) {
        doubles += 1;
        mistakes += 1;
        if (penalties.length) c.doubleMakeup.penalty += 1;
        if (putts.length >= 3) c.doubleMakeup.three_putt += 1;
        if (short.length >= 2) c.doubleMakeup.two_short += 1;
      } else {
        if (h.par === 5 && toPar === 1) mistakes += 1;
        else if (toPar === 1 && h.shots.some((x) => x.category === 'approach' && low(x.shot.lie_before) === 'fairway' && (yardsOf(x.shot) ?? 999) <= 150)) mistakes += 1;
        if (putts.length >= 3) mistakes += 1;
      }
      const tee = h.shots.find((x) => x.category === 'off_tee' && !isPenalty(x.shot));
      for (const p of penalties.filter((x) => x.category === 'off_tee')) {
        teePen += 1;
        const where = low(p.shot.lie_after) + ' ' + low(p.shot.result);
        const kind = /water|hazard/.test(where) ? 'water' : /ob|out/.test(where) ? 'out of bounds' : 'other';
        c.teePenaltyKinds[kind] = (c.teePenaltyKinds[kind] ?? 0) + 1;
        const club = low(tee?.shot.club_type ?? null) || 'club not recorded';
        c.teePenaltyClubs[club] = (c.teePenaltyClubs[club] ?? 0) + 1;
      }
      if (tee && !(low(tee.shot.result) === 'fairway' || low(tee.shot.lie_after) === 'fairway')) {
        const side = low(tee.shot.miss_direction);
        if (side.includes('left')) c.teeMisses.left += 1;
        else if (side.includes('right')) c.teeMisses.right += 1;
        else c.teeMisses.none += 1;
      }
      if (h.par === 4) {
        const first = h.shots.find((x) => x.category === 'approach' && !isPenalty(x.shot));
        const y = first ? yardsOf(first.shot) : null;
        if (y != null) c.approachYards.push(y);
      }
      const feet = putts[0] ? puttMakeStartFeet(putts[0].shot) : null;
      if (feet != null) {
        c.firstPuttFeet.push(feet);
        if (feet >= 30) {
          c.longFirstPutts.of += 1;
          if (putts.length >= 3) c.longFirstPutts.three += 1;
        }
      }
      h.shots.forEach((x, i) => {
        if (x.category !== 'around_green' || isPenalty(x.shot)) return;
        const leave = leaveFeet(x.shot);
        if (leave != null && leave > 0) c.chipLeaves.push(leave);
        const next = h.shots[i + 1];
        if (onGreen(x.shot) && next && next.category === 'putting') {
          c.nextPutt.of += 1;
          if (isPuttMade(next.shot)) c.nextPutt.made += 1;
        }
      });
      if (h.par === 5 && h.score != null) {
        const second = h.shots.filter((x) => !isPenalty(x.shot))[1];
        const y = second ? yardsOf(second.shot) : null;
        if (second && y != null && y >= 200) {
          const kind = classifyParFiveLongApproach({ par: 5, onGreen: onGreen(second.shot), leaveFeet: leaveFeet(second.shot) });
          (kind === 'layup' ? c.par5.laidUp : c.par5.wentFor).push(h.score);
        }
      }
    }
    c.doublesByRound.push(doubles);
    c.mistakesByRound.push(mistakes);
    c.teePenaltiesByRound.push(teePen);
  }
  return c;
}

export const CATALOGUE_FLOORS = { rounds: 8, tee_penalties: 5, side_misses: 20, approaches: 40, first_putt_rounds: 5, short_shots: 30, long_putts: 20, par5_each: 8 } as const;
const FL = CATALOGUE_FLOORS;

type Base = Omit<CatalogueRead, 'team' | 'figures' | 'family' | 'text'> & { words: (f: Figures) => string; /** The value a teammate is compared at when a count floor (not the rounds floor) withholds it. */ team_value?: number | null };

function meanRead(id: CatalogueId, label: string, unit: CatalogueRead['unit'], values: readonly number[], floor: number, floorWord: string, rounds: number, words: Base['words']): Base {
  const s = meanSummary(values);
  const t = s && s.df != null && s.df > 0 && s.se != null ? tQuantile(ALPHA / 2, s.df) * s.se : null;
  const range = s && t != null ? { low: s.mean - t, high: s.mean + t } : null;
  const base = { id, label, unit, direction: 'higher_is_worse' as const, count: values.length, of: values.length, rounds, range95: range, words };
  if (!s || values.length < floor) return { ...base, value: null, withheld: `needs ${floor} ${floorWord}; ${values.length} so far` };
  return { ...base, value: s.mean };
}

function shareRead(id: CatalogueId, label: string, count: number, of: number, floor: number, floorWord: string, rounds: number, words: Base['words']): Base {
  const ci = wilsonInterval(count, of);
  const base = { id, label, unit: 'percent' as const, direction: 'higher_is_worse' as const, count, of, rounds, range95: ci ? { low: ci.low * 100, high: ci.high * 100 } : null, words };
  if (of < floor) return { ...base, value: null, withheld: `needs ${floor} ${floorWord}; ${of} so far` };
  return { ...base, value: (count / of) * 100 };
}

function topOf(rec: Record<string, number>): [string, number] | null {
  return Object.entries(rec).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
}

const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const two = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

function readsOf(c: Counts): Base[] {
  const doublesTotal = c.doublesByRound.reduce((a, b) => a + b, 0);
  const tee = c.teePenaltiesByRound.reduce((a, b) => a + b, 0);
  const sideOf = c.teeMisses.left + c.teeMisses.right;
  const kind = topOf(c.teePenaltyKinds);
  const club = topOf(c.teePenaltyClubs);
  const teeRead = meanRead('tee_penalties', 'Penalty strokes from the tee a round', 'per_round', c.teePenaltiesByRound, FL.rounds, 'rounds with every shot logged', c.rounds, (f) =>
    `${f.put('tee_penalties_total', whole(tee))} penalties from the tee in ${f.put('tee_penalties_rounds', whole(c.rounds))} rounds${kind ? `, ${f.put('tee_penalties_kind_n', whole(kind[1]))} ${kind[0]}` : ''}${club ? `, ${f.put('tee_penalties_club_n', whole(club[1]))} with the ${club[0].replace(/_/g, ' ')}` : ''}.`);
  const firstPutt = meanRead('first_putt_length', 'How long the first putt is', 'feet', c.firstPuttFeet, 1, 'first putts', c.rounds, (f) =>
    `First putts start ${f.put('first_putt_feet', whole(avg(c.firstPuttFeet)))} feet away on average, over ${f.put('first_putt_n', whole(c.firstPuttFeet.length))} holes.`);
  const par5Each = Math.min(c.par5.wentFor.length, c.par5.laidUp.length);
  return [
    {
      ...meanRead('doubles', 'Doubles or worse a round', 'per_round', c.doublesByRound, FL.rounds, 'rounds with every shot logged', c.rounds, (f) =>
        `${f.put('doubles_per_round', oneDecimal(avg(c.doublesByRound)))} doubles or worse a round over ${f.put('doubles_rounds', whole(c.rounds))} rounds; of ${f.put('doubles_total', whole(doublesTotal))}, ${f.put('doubles_penalty', whole(c.doubleMakeup.penalty))} had a penalty, ${f.put('doubles_three_putt', whole(c.doubleMakeup.three_putt))} three putts and ${f.put('doubles_two_short', whole(c.doubleMakeup.two_short))} two or more shots around the green.`),
      detail: { ...c.doubleMakeup, total: doublesTotal },
    },
    meanRead('mistakes', 'Mistakes a round', 'per_round', c.mistakesByRound, FL.rounds, 'rounds with every shot logged', c.rounds, (f) =>
      `${f.put('mistakes_per_round', oneDecimal(avg(c.mistakesByRound)))} mistakes a round (doubles, par ${f.put('par_five', '5')} bogeys, three putts, bogeys after an approach from inside ${f.put('mistakes_inside', '150')} in the fairway) over ${f.put('mistakes_rounds', whole(c.rounds))} rounds.`),
    {
      ...(tee < FL.tee_penalties ? { ...teeRead, value: null, team_value: teeRead.value, withheld: `needs ${FL.tee_penalties} penalties from the tee; ${tee} so far` } : teeRead),
      detail: { total: tee, ...Object.fromEntries(Object.entries(c.teePenaltyKinds).map(([k, v]) => [`kind:${k}`, v])), ...Object.fromEntries(Object.entries(c.teePenaltyClubs).map(([k, v]) => [`club:${k}`, v])) },
    },
    shareRead('tee_miss_side', 'Missed fairways that went right', c.teeMisses.right, sideOf, FL.side_misses, 'missed fairways with a side recorded', c.rounds, (f) =>
      `${f.put('tee_right', whole(c.teeMisses.right))} of ${f.put('tee_side_of', whole(sideOf))} missed fairways with a side recorded went right, ${f.put('tee_left', whole(c.teeMisses.left))} left.`),
    meanRead('approach_length', 'How long the first approach is on a par 4', 'yards', c.approachYards, FL.approaches, 'par 4 approaches', c.rounds, (f) =>
      `The tee shot leaves ${f.put('approach_yards', whole(avg(c.approachYards)))} yards on average into par ${f.put('par_four', '4')}s, over ${f.put('approach_n', whole(c.approachYards.length))} holes.`),
    c.rounds < FL.first_putt_rounds ? { ...firstPutt, value: null, withheld: `needs ${FL.first_putt_rounds} rounds; ${c.rounds} so far` } : firstPutt,
    {
      ...meanRead('chip_leave', 'What a shot around the green leaves', 'feet', c.chipLeaves, FL.short_shots, 'shots around the green with the finish recorded', c.rounds, (f) =>
        `Shots around the green leave ${f.put('chip_feet', whole(avg(c.chipLeaves)))} feet on average, over ${f.put('chip_n', whole(c.chipLeaves.length))} shots; the putt after went in ${f.put('next_putt_made', whole(c.nextPutt.made))} of ${f.put('next_putt_of', whole(c.nextPutt.of))} times.`),
      detail: { next_putt_made: c.nextPutt.made, next_putt_of: c.nextPutt.of },
    },
    shareRead('long_three_putts', 'Three putts from 30 feet and longer', c.longFirstPutts.three, c.longFirstPutts.of, FL.long_putts, 'first putts from 30 feet and longer', c.rounds, (f) =>
      `From ${f.put('long_putt_feet', '30')} feet and longer, ${f.put('long_three', whole(c.longFirstPutts.three))} of ${f.put('long_of', whole(c.longFirstPutts.of))} holes took three putts or more.`),
    {
      id: 'par5_seconds',
      label: 'Par 5 second shots from 200 and out',
      unit: 'per_round',
      direction: 'higher_is_worse',
      count: c.par5.wentFor.length + c.par5.laidUp.length,
      of: c.par5.wentFor.length + c.par5.laidUp.length,
      rounds: c.rounds,
      range95: null,
      described_only: true,
      value: par5Each >= FL.par5_each ? avg(c.par5.wentFor) - avg(c.par5.laidUp) : null,
      ...(par5Each >= FL.par5_each ? {} : { withheld: `needs ${FL.par5_each} of each choice; went for it ${c.par5.wentFor.length}, laid up ${c.par5.laidUp.length}` }),
      words: (f) =>
        `Par ${f.put('par_five', '5')} seconds from ${f.put('par5_from', '200')} and out: went for it ${f.put('par5_went', whole(c.par5.wentFor.length))} times (${f.put('par5_went_avg', two(avg(c.par5.wentFor)))} average), laid up ${f.put('par5_laid', whole(c.par5.laidUp.length))} times (${f.put('par5_laid_avg', two(avg(c.par5.laidUp)))}). Different lies; the choice is read from where the ball finished.`,
    },
  ];
}

export interface CatalogueResult {
  player_id: string;
  reads: CatalogueRead[];
  signals: SignalRead[];
}

/** Every player’s catalogue reads over their season of measured rounds, the teammates’ medians, and the signals. */
export function catalogueReads(sheets: readonly FactSheet[], rows: Pick<TeamRows, 'shots' | 'holes'>): CatalogueResult[] {
  const built = new Map(
    sheets.map((s) => [s.player_id, readsOf(countPlayer(s.strokes_gained_by_round_season.filter((r) => r.measured).map((r) => r.round_id), rows, sgBaselineScale(s.strokes_gained_baseline)))]),
  );
  return sheets.map((sheet): CatalogueResult => {
    const mine = built.get(sheet.player_id)!;
    const tests: Array<{ i: number; z: number; p: number; median: number; m: number }> = [];
    const reads = mine.map((r, i): CatalogueRead => {
      const f = new Figures();
      const { words, team_value: _tv, ...rest } = r;
      const text = r.value == null ? `${f.put('label', r.label)}: ${f.put('withheld', r.withheld ?? 'not enough yet')}.` : words(f);
      const mates = sheets.filter((s) => s.player_id !== sheet.player_id).flatMap((s) => {
        const theirs = built.get(s.player_id)![i]!;
        const v = theirs.value ?? theirs.team_value ?? null;
        return v == null ? [] : [v];
      });
      const med = median(mates);
      if (r.value != null && !r.described_only && med != null && mates.length >= MIN_TEAMMATES) {
        const mad = medianAbsoluteDeviation(mates);
        if (mad != null && mad > 0) {
          const m = mates.length;
          const z = (r.value - med) / (MAD_TO_SD * mad * Math.sqrt(1 + MEDIAN_VARIANCE_FACTOR / m));
          tests.push({ i, z, p: Math.min(1, 2 * studentTSf(Math.abs(z), MAD_EFFICIENCY * (m - 1))), median: med, m });
        }
      }
      return { ...rest, family: FAMILY[r.id], text, team: mates.length ? { audience: 'coach_only', value: { median: med, teammates: mates.length } } : null, figures: f.all };
    });
    const bh = benjaminiHochberg(tests.map((t) => t.p), FALSE_DISCOVERY_RATE);
    const passing = tests
      .map((t, k) => ({ ...t, q: bh.qAdj[k] ?? 1, ok: bh.rejected[k] === true }))
      .filter((t) => {
        const r = reads[t.i]!;
        const worse = r.direction === 'higher_is_worse' ? t.z > 0 : t.z < 0;
        const clear = r.range95 != null && (t.median < r.range95.low || t.median > r.range95.high);
        return t.ok && worse && clear;
      })
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || reads[a.i]!.id.localeCompare(reads[b.i]!.id));
    const signals: SignalRead[] = [];
    const families = new Set<string>();
    for (const t of passing) {
      const r = reads[t.i]!;
      if (families.has(r.family) || signals.length >= MAX_SIGNALS) continue;
      families.add(r.family);
      const fmt = r.unit === 'per_round' ? oneDecimal(t.median) : whole(t.median);
      const unit = r.unit === 'percent' ? '%' : r.unit === 'yards' ? ' yards' : r.unit === 'feet' ? ' feet' : ' a round';
      signals.push({ id: r.id, family: r.family, rank: signals.length + 1, text: r.text, team_text: { audience: 'coach_only', value: `The teammates’ middle is ${fmt}${unit}, across ${t.m} teammates.` }, z: Math.round(t.z * 100) / 100, p_value: t.p, q_value: Math.round(t.q * 1e4) / 1e4 });
    }
    return { player_id: sheet.player_id, reads, signals };
  });
}
