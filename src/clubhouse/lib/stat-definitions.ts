import { MIN_PLAUSIBLE_STROKES_PER_18 } from '@/lib/golf/round-countable';
import { TERMS } from './glossary';

/*
 * What every stat means, said once (launch readiness 2026-11-15, F-07). Coaches compare Clubhouse against Clippd and GolfStat, so each
 * figure a Stats page names carries its definition one tap away, and one rule says which rounds count, nines and unfinished rounds
 * included. The words describe what the code does: the counting rule below is built from the same constants the loaders filter with
 * (the stroke floor; strokes gained's floor and Last 10's length are pinned to theirs by the test), and `__tests__/stat-definitions.test.ts` runs the rule's claims against the
 * functions that decide them (`isScoreCountable`, `roundWeight`, `lastTenRounds`), so the page cannot say one thing and count another.
 *
 * The formulas themselves live in `lib/golf/stat-formulas.ts` (the single source the database cache mirrors); this file is their
 * words. Plain module: server routes and client components both read it.
 */

export type ChStatKey =
  | 'scoringAvg'
  | 'toPar'
  | 'sg'
  | 'sgTee'
  | 'sgApproach'
  | 'sgAround'
  | 'sgPutting'
  | 'gir'
  | 'fir'
  | 'putts'
  | 'threePutts'
  | 'puttsGir'
  | 'scrambling'
  | 'sandSaves'
  | 'penalties'
  | 'birdies';

export interface ChStatDefinition {
  key: ChStatKey;
  /** The stat's full name, as a heading says it. */
  name: string;
  /** What it measures, in one sentence. */
  means: string;
  /** How Clubhouse counts it: the denominator, the per-18 basis, the rounds it reads. */
  counted: string;
  /** Which way is better, for the reader who sees a number with no colour. */
  better: 'higher' | 'lower';
}

/** The window Last 10 reads: the newest ten counted 18-hole rounds (`lastTenRounds`). The test pins it to `LAST_TEN`. */
export const LAST_N = 10;

/**
 * Strokes gained's floor in whole rounds. `data/season.ts` is server-only, so the value is written here and the test pins it to
 * `MIN_SG_ROUNDS`.
 */
export const MIN_SG_ROUNDS = 3;

const PER_18 = 'Per 18 holes, so a nine-hole round counts as half a round.';
const HOLES_ONLY = 'Read from rounds entered hole by hole; a round posted as a total only is left out.';
const SG_FLOOR = `Shown once there are ${MIN_SG_ROUNDS} whole rounds with holes in the window.`;

export const STAT_DEFINITIONS: Readonly<Record<ChStatKey, ChStatDefinition>> = {
  scoringAvg: {
    key: 'scoringAvg',
    name: TERMS.scoringAvg.long,
    means: 'The average score for a round.',
    counted: `Strokes over the counted rounds, divided by the rounds. ${PER_18} A round posted as a total only counts here.`,
    better: 'lower',
  },
  toPar: {
    key: 'toPar',
    name: 'To par',
    means: 'Strokes over or under the course’s par, averaged per round. E is even par.',
    counted: `Each round’s score minus that course’s par, then averaged. ${PER_18}`,
    better: 'lower',
  },
  sg: {
    key: 'sg',
    name: TERMS.strokesGained.long,
    means: 'Strokes better (+) or worse (−) per round than the benchmark the team measures against, from the same spots on the course.',
    counted: `Every shot is valued against the benchmark’s average from where it started and where it finished; the round’s total is the sum. Averaged per round. ${HOLES_ONLY} ${SG_FLOOR}`,
    better: 'higher',
  },
  sgTee: {
    key: 'sgTee',
    name: 'Off the tee',
    means: 'Strokes gained on tee shots on par 4s and par 5s.',
    counted: `The tee shot’s value against the benchmark, per round. ${HOLES_ONLY} ${SG_FLOOR}`,
    better: 'higher',
  },
  sgApproach: {
    key: 'sgApproach',
    name: 'Approach',
    means: 'Strokes gained on full shots toward the green: tee shots on par 3s and every shot that is not a tee shot on a par 4 or 5, a chip, a pitch or a putt.',
    counted: `Each approach’s value against the benchmark, per round. ${HOLES_ONLY} ${SG_FLOOR}`,
    better: 'higher',
  },
  sgAround: {
    key: 'sgAround',
    name: TERMS.sgArg.long,
    means: 'Strokes gained on the shots entered as chips and pitches around the green.',
    counted: `Each shot’s value against the benchmark, per round. ${HOLES_ONLY} ${SG_FLOOR}`,
    better: 'higher',
  },
  sgPutting: {
    key: 'sgPutting',
    name: 'Putting',
    means: 'Strokes gained on the green: each putt against the benchmark’s average from that distance.',
    counted: `Per round. ${HOLES_ONLY} ${SG_FLOOR}`,
    better: 'higher',
  },
  gir: {
    key: 'gir',
    name: TERMS.gir.long,
    means: 'A green hit in regulation: on the putting surface in two strokes fewer than par or better (one on a par 3, two on a par 4, three on a par 5).',
    counted: `Greens hit over holes where it can be told, pooled across every round in the window. ${HOLES_ONLY}`,
    better: 'higher',
  },
  fir: {
    key: 'fir',
    name: TERMS.fir.long,
    means: 'The tee shot on a par 4 or par 5 finishing in the fairway.',
    counted: `Fairways hit over par 4 and par 5 holes with a fairway result entered; par 3s are never counted. Pooled across the window. ${HOLES_ONLY}`,
    better: 'higher',
  },
  putts: {
    key: 'putts',
    name: 'Putts per round',
    means: 'Putts taken in a round, as entered on each hole.',
    counted: `Putts over holes with a putt count, scaled to 18 holes. A hole with no putts entered is left out, never read as zero. ${HOLES_ONLY}`,
    better: 'lower',
  },
  puttsGir: {
    key: 'puttsGir',
    name: 'Putts per green in regulation',
    means: 'Putts taken on the holes where the green was hit in regulation.',
    counted: `Putts on those holes over the number of them, counting only holes with a putt count. ${HOLES_ONLY}`,
    better: 'lower',
  },
  threePutts: {
    key: 'threePutts',
    name: 'Three-putts per round',
    means: 'Holes that took three putts or more.',
    counted: `Per 18 holes, over holes with a putt count. ${HOLES_ONLY}`,
    better: 'lower',
  },
  scrambling: {
    key: 'scrambling',
    name: 'Scrambling',
    means: 'Getting up and down: par or better after missing the green in regulation, or a sand save from a greenside bunker at any score.',
    counted: `Up and downs over chances, pooled across the window. A chance is a missed green or a greenside bunker, once per hole, so a sand save is never counted twice. The Tour line counts missed greens only, so read it as a guide. ${HOLES_ONLY}`,
    better: 'higher',
  },
  sandSaves: {
    key: 'sandSaves',
    name: 'Sand saves',
    means: 'Getting down in two strokes or fewer from a greenside bunker, the bunker shot included, whatever the score on the hole. This is the Tour’s definition.',
    counted: `Saves over greenside bunker visits, pooled across the window. ${HOLES_ONLY}`,
    better: 'higher',
  },
  penalties: {
    key: 'penalties',
    name: 'Penalties per round',
    means: 'Penalty strokes taken: out of bounds, water, unplayable lies and other penalties.',
    counted: `Penalty strokes over holes played, scaled to 18 holes. ${HOLES_ONLY}`,
    better: 'lower',
  },
  birdies: {
    key: 'birdies',
    name: 'Birdies per round',
    means: 'Holes finished one under par. Eagles are counted on their own, not as birdies.',
    counted: `Birdies over holes played, scaled to 18 holes. ${HOLES_ONLY}`,
    better: 'higher',
  },
};

/** The order the "How stats are counted" sheet lists them in: scoring, strokes gained, then the parts of a round from tee to hole. */
export const STAT_ORDER: readonly ChStatKey[] = [
  'scoringAvg',
  'toPar',
  'sg',
  'sgTee',
  'sgApproach',
  'sgAround',
  'sgPutting',
  'fir',
  'gir',
  'scrambling',
  'sandSaves',
  'putts',
  'puttsGir',
  'threePutts',
  'birdies',
  'penalties',
];

/*
 * The label a page prints, to the stat it names. Pages spell a stat more than one way ("Scoring avg", "GIR", "Putts / round"), so a
 * label is matched without case, spacing or punctuation. A label that names no stat ("Rounds", "Driver") has no definition, and its
 * page draws it as plain text.
 */
const ALIASES: ReadonlyArray<readonly [ChStatKey, readonly string[]]> = [
  ['scoringAvg', [TERMS.scoringAvg.long, TERMS.scoringAvg.short, TERMS.avg.short, 'Round-day avg', 'Average score']],
  ['toPar', ['To par', 'Average to par', 'Avg to par']],
  ['sg', ['Strokes gained', 'SG', 'SG / round', 'SG total', 'Team SG per round', 'SG per round', 'Strokes gained per round']],
  ['sgTee', ['Off the tee', 'SG off the tee']],
  ['sgApproach', ['Approach', 'SG approach', 'Approach play']],
  ['sgAround', [TERMS.sgArg.long, TERMS.sgArg.short, 'SG around the green']],
  ['sgPutting', ['SG putting']],
  ['gir', ['Greens in regulation', 'GIR', 'Greens', 'Greens hit']],
  ['fir', ['Fairways hit', 'FIR', 'Fairways', 'Fairway accuracy', 'Fairways par 4', 'Fairways par 5']],
  ['putts', ['Putts per round', 'Putts / round', 'Putts', 'Putts a round']],
  ['puttsGir', ['Putts per green in regulation', 'Putts / GIR', 'Putts per GIR']],
  ['threePutts', ['Three-putts per round', 'Three-putts / round', 'Three-putts', '3-putts', '3-putts / round']],
  ['scrambling', ['Scrambling', 'Up and down', 'Up and downs', 'Up-and-down']],
  ['sandSaves', ['Sand saves', 'Sand save', 'Sand save %']],
  ['penalties', ['Penalties per round', 'Penalties / round', 'Penalties', 'Penalty strokes']],
  ['birdies', ['Birdies per round', 'Birdies / round', 'Birdies']],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const BY_LABEL: ReadonlyMap<string, ChStatKey> = new Map(ALIASES.flatMap(([key, labels]) => labels.map((l) => [norm(l), key] as const)));

/**
 * The definition behind a printed label, or null when the label names no stat. "Putting" alone is a page section as well as strokes
 * gained's putting part, so a caller passes `sg: true` where the label sits in strokes gained.
 */
export function statDefinition(label: string, opts: { sg?: boolean } = {}): ChStatDefinition | null {
  const n = norm(label);
  if (opts.sg && n === 'putting') return STAT_DEFINITIONS.sgPutting;
  if (opts.sg && n === 'shortgame') return STAT_DEFINITIONS.sgAround;
  const key = BY_LABEL.get(n);
  return key ? STAT_DEFINITIONS[key] : null;
}

/*
 * Which rounds count, and how a nine or an unfinished round is read: the one rule, stated where a coach can find it. Each line is a
 * claim `stat-definitions.test.ts` checks against the code that applies it.
 */
export interface ChCountingLine {
  id: 'completed' | 'practice' | 'holes' | 'nines' | 'last' | 'partial' | 'total-only' | 'floor' | 'sg-floor';
  title: string;
  body: string;
}

const NINE_FLOOR = Math.ceil((9 * MIN_PLAUSIBLE_STROKES_PER_18) / 18);

export const COUNTING_RULE: readonly ChCountingLine[] = [
  {
    id: 'completed',
    title: 'Finished rounds only',
    body: 'A figure counts a round once it is posted. A round still being played, and a test round, never count.',
  },
  {
    id: 'practice',
    title: 'Practice is left out',
    body: 'Practice rounds stay in the rounds list but not in the figures, unless you choose Practice in the filter’s round types or pick rounds by hand.',
  },
  {
    id: 'holes',
    title: '18 holes by default',
    body: 'Figures read 18-hole rounds. The filter’s Holes control adds nine-hole rounds (18 and 9 holes) or shows them on their own (9 holes).',
  },
  {
    id: 'nines',
    title: 'A nine counts as half a round',
    body: 'With nine-hole rounds in, every per-round figure is per 18 holes: a 38 for nine holes counts as half a round at a 76 pace, never as a full round. Rates such as greens and fairways pool every hole played. Two nines make one round toward any minimum.',
  },
  {
    id: 'last',
    title: `Last ${LAST_N} means ${LAST_N} full rounds`,
    body: `Last ${LAST_N} is the newest ${LAST_N} counted 18-hole rounds, newest first. A nine-hole round never takes the place of an 18 in it.`,
  },
  {
    id: 'partial',
    title: 'Unfinished rounds don’t count',
    body: 'A round with holes left unscored, or of any length other than 9 or 18 holes, counts in no figure. It stays in the rounds list, and counts once its missing holes are scored.',
  },
  {
    id: 'total-only',
    title: 'A total without holes counts in scoring only',
    body: 'An 18-hole round posted as a total counts in the scoring average, to par and the trend, but in no hole figure (greens, fairways, putts, scrambling, strokes gained). A figure that reads fewer rounds says so, for example “Hole stats from 8 of 10 rounds”.',
  },
  {
    id: 'floor',
    title: 'Impossible scores are left out',
    body: `A score under ${MIN_PLAUSIBLE_STROKES_PER_18} for 18 holes (${NINE_FLOOR} for nine) is read as an entry mistake and counts in no figure until it is corrected.`,
  },
  {
    id: 'sg-floor',
    title: `Strokes gained needs ${MIN_SG_ROUNDS} rounds`,
    body: `A strokes gained figure appears once the window holds ${MIN_SG_ROUNDS} whole rounds entered hole by hole. Fewer than that shows a dash, not a thin number.`,
  },
];

/** One line for a page's foot or a figure's caption: the nines rule in a sentence. Matches `PER_18_NOTE` in data/stats-filter.ts. */
export const NINES_LINE = 'Per-round figures are per 18 holes: a 9-hole round counts as half a round.';
