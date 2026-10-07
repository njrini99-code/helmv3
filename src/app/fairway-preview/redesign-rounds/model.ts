// REDESIGN-SCRATCH (docs/redesign/rounds): everything the three directions show is computed here.
//
// One rule for the whole preview: no number on screen is typed in. Every figure comes from
// FIXTURE_ROUNDS (the labeled fixture) through the pure functions below. The single exception
// is UNFINISHED_FAKE at the bottom, which the brief allows as illustrative copy because the
// fixture holds no in-progress rounds.
//
// Basis, stated once so the captions can repeat it:
//   - "Counted" rounds only feed the strip, the usual band, the marks and the ledger.
//   - To-par is on an 18-hole basis (a 9-hole round is doubled), the same convention the live
//     Rounds library uses. The fixture's 9-hole round is drawn hollow so this stays visible.
//   - "Your usual" is the median of that series and its band is the interquartile range,
//     with linear-interpolation quartiles (the "type 7" method in R and NumPy).

import { cleanCourseName } from '@/lib/golf/course-name';
import { formatDateOnlyShort, formatDateOnlyWeekdayShort } from '@/lib/golf/date-only';
import type { RoundStripPoint } from '@/components/fairway/modules/RoundStrip';
import {
  FIXTURE_ROUNDS,
  type FixtureHole,
  type FixtureRound,
  type FixtureRoundType,
} from './fixture';

/* ── Marks ───────────────────────────────────────────────────────────────── */

/**
 * eagle = double circle · birdie = circle · par = no mark · bogey = square ·
 * double = double square.
 *
 * On a hole the kind is the hole's score against par. On a round (G) it is the round's to-par
 * against the player's usual band, see `markVsUsual`.
 */
export type MarkKind = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double';

/**
 * MIRROR of `bucketForHole` in src/components/fairway/pages/rounds/FairwayRoundDetail.tsx.
 * That function (and the Scorecard that calls it) is private to the round-detail module and is
 * not exported, so it is copied here rather than imported. Keep the two in step.
 */
export function bucketForHole(score: number, par: number): MarkKind {
  const d = score - par;
  if (d <= -2) return 'eagle';
  if (d === -1) return 'birdie';
  if (d === 0) return 'par';
  if (d === 1) return 'bogey';
  return 'double';
}

/* ── Rounds ──────────────────────────────────────────────────────────────── */

export interface Round extends FixtureRound {
  /** Strokes to par on an 18-hole basis: a 9-hole round is doubled. */
  toPar18: number;
  /** The course without its trailing "Golf Club" style suffix. */
  short: string;
  typeLabel: string;
}

const TYPE_LABEL: Record<FixtureRoundType, string> = {
  practice: 'Practice',
  qualifier: 'Qualifier',
  tournament: 'Tournament',
};

/** Same trimming the round-detail masthead uses (`shortCourse` there is private). */
export function shortCourse(name: string): string {
  const trimmed = cleanCourseName(name)
    .replace(/\s+(Golf\s+(Course|Club)|Country\s+Club|GC|CC)$/i, '')
    .trim();
  return trimmed || name;
}

/** Newest first, exactly as the fixture is ordered. */
export const ROUNDS: readonly Round[] = FIXTURE_ROUNDS.map((r) => ({
  ...r,
  toPar18: r.holes > 0 ? (r.toPar * 18) / r.holes : r.toPar,
  short: shortCourse(r.course),
  typeLabel: TYPE_LABEL[r.type],
}));

export const COUNTED: readonly Round[] = ROUNDS.filter((r) => r.counted);
export const NOT_COUNTED: readonly Round[] = ROUNDS.filter((r) => !r.counted);

/**
 * Counted rounds, oldest to newest. This REVERSES the newest-first list instead of re-sorting
 * by date: three rounds share one date in the fixture, and a stable date sort would put the
 * wrong one last, so the "latest" bar would not be the latest round.
 */
export const CHRONOLOGICAL: readonly Round[] = [...COUNTED].reverse();

/** The newest counted round. The list is newest first, so it is the first counted one. */
export const LATEST_COUNTED: Round | null = COUNTED[0] ?? null;

/* ── Your usual ──────────────────────────────────────────────────────────── */

/** Below this many counted rounds there is no "usual": no band, no marks (Direction G). */
export const MIN_ROUNDS_FOR_USUAL = 5;

export interface Usual {
  n: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
}

/** Linear-interpolation quantile ("type 7") of an ascending list. */
export function quantile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return Number.NaN;
  const pos = (sortedAsc.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sortedAsc[lo] ?? 0;
  const b = sortedAsc[hi] ?? a;
  return a + (b - a) * (pos - lo);
}

export function usualOf(rounds: readonly Round[]): Usual | null {
  if (rounds.length < MIN_ROUNDS_FOR_USUAL) return null;
  const sorted = rounds.map((r) => r.toPar18).sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  return { n: sorted.length, median: quantile(sorted, 0.5), q1, q3, iqr: q3 - q1 };
}

export const USUAL: Usual | null = usualOf(COUNTED);

/**
 * A round's mark, against the player's own usual band rather than against par:
 *   circle  = better than the band (below Q1)        double circle = far better (beyond the fence)
 *   square  = worse than the band (above Q3)         double square = far worse (beyond the fence)
 *   none    = inside the band, an ordinary round for this player
 * The fence is 1.5 times the band's width past the quartile (Tukey's rule), never less than 1.5
 * strokes. A round that is under par but inside the band gets no mark: it is normal for them.
 */
export function markVsUsual(toPar18: number, usual: Usual | null): MarkKind {
  if (!usual) return 'par';
  const fence = 1.5 * Math.max(usual.iqr, 1);
  if (toPar18 < usual.q1 - fence) return 'eagle';
  if (toPar18 < usual.q1) return 'birdie';
  if (toPar18 > usual.q3 + fence) return 'double';
  if (toPar18 > usual.q3) return 'bogey';
  return 'par';
}

/** Strokes better (negative) or worse (positive) than the median. */
export function deltaVsUsual(round: Round, usual: Usual | null): number | null {
  return usual ? round.toPar18 - usual.median : null;
}

/* ── Holes ───────────────────────────────────────────────────────────────── */

export interface Stretch {
  from: number;
  to: number;
  /** Strokes over par across the stretch. Zero or less means there was no rough patch. */
  over: number;
}

/** The worst run of `span` consecutive holes, by strokes over par. Earliest wins a tie. */
export function worstStretch(holes: readonly FixtureHole[] | null, span = 3): Stretch | null {
  if (!holes || holes.length < span) return null;
  let worst: Stretch | null = null;
  for (let i = 0; i + span <= holes.length; i += 1) {
    let over = 0;
    for (let j = i; j < i + span; j += 1) {
      const h = holes[j];
      if (h) over += h.score - h.par;
    }
    const first = holes[i];
    const last = holes[i + span - 1];
    if (first && last && (worst === null || over > worst.over)) {
      worst = { from: first.hole, to: last.hole, over };
    }
  }
  return worst;
}

/* ── Eclectic scorecard ──────────────────────────────────────────────────── */

export interface EclecticHole {
  hole: number;
  par: number;
  /** Lowest score made on this hole across the rounds at the course. */
  best: number;
  /** How many of those rounds made that score. */
  made: number;
  /** The latest round's score on this hole, when a latest round was asked for. */
  latest: number | null;
  /** The latest round scored worse than `best` here. */
  gap: boolean;
}

export interface Nine {
  par: number;
  best: number;
  latest: number | null;
}

export interface Eclectic {
  course: string;
  short: string;
  /** Rounds with hole scores that feed the card. */
  nRounds: number;
  holes: EclecticHole[];
  out: Nine;
  /** null on a 9-hole course. */
  inn: Nine | null;
  par: number;
  best: number;
  /** best minus par. */
  toPar: number;
  latest: { round: Round; total: number; gap: number; gapHoles: number[] } | null;
}

function nineOf(holes: readonly EclecticHole[]): Nine {
  const latestAll = holes.every((h) => h.latest !== null);
  return {
    par: holes.reduce((s, h) => s + h.par, 0),
    best: holes.reduce((s, h) => s + h.best, 0),
    latest: latestAll ? holes.reduce((s, h) => s + (h.latest ?? 0), 0) : null,
  };
}

/**
 * Your best score on every hole across the counted rounds at a course. `latestRound` (optional)
 * adds the comparison row: that round's own score on each hole and the holes where it fell short.
 */
export function eclecticFor(
  course: string,
  rounds: readonly Round[],
  latestRound: Round | null = null,
): Eclectic | null {
  const withHoles = rounds.filter((r) => r.counted && r.holeScores && r.holeScores.length > 0);
  if (withHoles.length === 0) return null;

  const holeCount = Math.max(...withHoles.map((r) => r.holeScores?.length ?? 0));
  const latestHoles = latestRound?.holeScores ?? null;
  const holes: EclecticHole[] = [];

  for (let n = 1; n <= holeCount; n += 1) {
    const entries = withHoles
      .map((r) => r.holeScores?.find((h) => h.hole === n))
      .filter((h): h is FixtureHole => h !== undefined);
    const first = entries[0];
    if (!first) continue;
    const best = Math.min(...entries.map((h) => h.score));
    const latestScore = latestHoles?.find((h) => h.hole === n)?.score ?? null;
    holes.push({
      hole: n,
      par: first.par,
      best,
      made: entries.filter((h) => h.score === best).length,
      latest: latestScore,
      gap: latestScore !== null && latestScore > best,
    });
  }

  const front = holes.filter((h) => h.hole <= 9);
  const back = holes.filter((h) => h.hole > 9);
  const par = holes.reduce((s, h) => s + h.par, 0);
  const best = holes.reduce((s, h) => s + h.best, 0);
  const haveLatest = latestRound !== null && holes.every((h) => h.latest !== null);
  const latestTotal = holes.reduce((s, h) => s + (h.latest ?? 0), 0);

  return {
    course,
    short: shortCourse(course),
    nRounds: withHoles.length,
    holes,
    out: nineOf(front),
    inn: back.length > 0 ? nineOf(back) : null,
    par,
    best,
    toPar: best - par,
    latest:
      haveLatest && latestRound
        ? {
            round: latestRound,
            total: latestTotal,
            gap: latestTotal - best,
            gapHoles: holes.filter((h) => h.gap).map((h) => h.hole),
          }
        : null,
  };
}

/* ── Worst hole at a course ──────────────────────────────────────────────── */

export interface WorstHole {
  hole: number;
  par: number;
  /** Average strokes over par across the rounds. */
  avgOver: number;
  /** The score in each round, newest first. */
  scores: number[];
}

export interface WorstHoles {
  /** Rounds with hole scores that were averaged. */
  n: number;
  /** Every hole tied for the highest average over par (at most 3 shown). Empty when none is over par. */
  holes: WorstHole[];
  /** Tied holes beyond the ones listed. */
  more: number;
}

/** Highest average over par. Needs two rounds; ties are all returned, never broken silently. */
export function worstHolesFor(rounds: readonly Round[]): WorstHoles {
  const withHoles = rounds.filter((r) => r.counted && r.holeScores && r.holeScores.length > 0);
  const n = withHoles.length;
  if (n < 2) return { n, holes: [], more: 0 };

  const holeCount = Math.max(...withHoles.map((r) => r.holeScores?.length ?? 0));
  const all: WorstHole[] = [];
  for (let hole = 1; hole <= holeCount; hole += 1) {
    const entries = withHoles
      .map((r) => r.holeScores?.find((h) => h.hole === hole))
      .filter((h): h is FixtureHole => h !== undefined);
    const first = entries[0];
    if (!first || entries.length < 2) continue;
    all.push({
      hole,
      par: first.par,
      avgOver: entries.reduce((s, h) => s + (h.score - h.par), 0) / entries.length,
      scores: entries.map((h) => h.score),
    });
  }

  const max = Math.max(...all.map((h) => h.avgOver));
  if (!(max > 0)) return { n, holes: [], more: 0 };
  const tied = all.filter((h) => h.avgOver >= max - 0.005);
  return { n, holes: tied.slice(0, 3), more: Math.max(0, tied.length - 3) };
}

/* ── Course book (Direction I) ───────────────────────────────────────────── */

export interface CourseBook {
  key: string;
  name: string;
  short: string;
  /** Every round here, newest first, counted or not. */
  rounds: Round[];
  counted: Round[];
  par: number;
  holes: number;
  eclectic: Eclectic | null;
  best: Round | null;
  worst: Round | null;
  worstHoles: WorstHoles;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildCourseBooks(): CourseBook[] {
  const byCourse = new Map<string, Round[]>();
  for (const r of ROUNDS) {
    const list = byCourse.get(r.course);
    if (list) list.push(r);
    else byCourse.set(r.course, [r]);
  }

  const books: CourseBook[] = [];
  for (const [name, rounds] of byCourse) {
    const counted = rounds.filter((r) => r.counted);
    const first = rounds[0];
    if (!first) continue;
    let best: Round | null = null;
    let worst: Round | null = null;
    for (const r of counted) {
      if (best === null || r.toPar18 < best.toPar18) best = r;
      if (worst === null || r.toPar18 > worst.toPar18) worst = r;
    }
    books.push({
      key: slug(name),
      name,
      short: shortCourse(name),
      rounds,
      counted,
      par: first.par,
      holes: first.holes,
      eclectic: eclecticFor(name, counted),
      best,
      worst,
      worstHoles: worstHolesFor(counted),
    });
  }

  // Courses with a counted round first, newest counted round first; the rest after.
  const rank = (b: CourseBook): number => {
    const newest = b.counted[0];
    return newest ? ROUNDS.indexOf(newest) : Number.POSITIVE_INFINITY;
  };
  return books.sort((a, b) => rank(a) - rank(b));
}

export const COURSE_BOOKS: readonly CourseBook[] = buildCourseBooks();

/* ── Strokes gained ──────────────────────────────────────────────────────── */

export type SgKey = 'tee' | 'approach' | 'aroundGreen' | 'putting';

export interface SgCategory {
  key: SgKey;
  /** Ledger column head. */
  short: string;
  label: string;
  /** Reads after "lost strokes": "putting", "off the tee". */
  gerund: string;
}

export const SG_CATEGORIES: readonly SgCategory[] = [
  { key: 'tee', short: 'Tee', label: 'Off the tee', gerund: 'off the tee' },
  { key: 'approach', short: 'App', label: 'Approach', gerund: 'on approach' },
  { key: 'aroundGreen', short: 'Short', label: 'Around the green', gerund: 'around the green' },
  { key: 'putting', short: 'Putt', label: 'Putting', gerund: 'putting' },
];

export type SgValues = Record<SgKey, number> & { total: number };

export interface SeasonSg {
  /** Counted rounds that carry strokes gained. */
  n: number;
  mean: SgValues;
  /** Rounds that lost strokes in each category. */
  lost: Record<SgKey, number>;
  /** The category with the most negative average, or null when none is negative. */
  leak: { category: SgCategory; mean: number; lost: number } | null;
}

export function seasonSg(rounds: readonly Round[]): SeasonSg | null {
  const withSg = rounds.filter((r) => r.counted && r.sg !== null);
  const n = withSg.length;
  if (n === 0) return null;

  const meanOf = (pick: (r: Round) => number): number =>
    withSg.reduce((s, r) => s + pick(r), 0) / n;
  const value = (r: Round, key: SgKey | 'total'): number => r.sg?.[key] ?? 0;

  const mean: SgValues = {
    tee: meanOf((r) => value(r, 'tee')),
    approach: meanOf((r) => value(r, 'approach')),
    aroundGreen: meanOf((r) => value(r, 'aroundGreen')),
    putting: meanOf((r) => value(r, 'putting')),
    total: meanOf((r) => value(r, 'total')),
  };
  const lost: Record<SgKey, number> = {
    tee: withSg.filter((r) => value(r, 'tee') < 0).length,
    approach: withSg.filter((r) => value(r, 'approach') < 0).length,
    aroundGreen: withSg.filter((r) => value(r, 'aroundGreen') < 0).length,
    putting: withSg.filter((r) => value(r, 'putting') < 0).length,
  };

  let worst: SgCategory | null = null;
  for (const c of SG_CATEGORIES) {
    if (worst === null || mean[c.key] < mean[worst.key]) worst = c;
  }
  const leak = worst && mean[worst.key] < 0 ? { category: worst, mean: mean[worst.key], lost: lost[worst.key] } : null;

  return { n, mean, lost, leak };
}

export const SEASON_SG: SeasonSg | null = seasonSg(ROUNDS);

/** The largest single category value in the fixture: the shared scale for every SG mini bar. */
export const SG_ABS_MAX: number = Math.max(
  0.5,
  ...ROUNDS.flatMap((r) => (r.sg ? SG_CATEGORIES.map((c) => Math.abs(r.sg?.[c.key] ?? 0)) : [])),
);

/** Display rounding for the ledger, matching `formatSigned(value, 1)`. */
export function round1(value: number): number {
  return Number(value.toFixed(1));
}

/* ── Row models shared by G and H ────────────────────────────────────────── */

export interface RowModel {
  id: string;
  weekday: string;
  dateShort: string;
  course: string;
  short: string;
  type: FixtureRoundType;
  typeLabel: string;
  holes: number;
  score: number;
  toPar: number;
  toPar18: number;
  counted: boolean;
  /** Strokes against the median. Null when the round is not counted or there is no usual. */
  delta: number | null;
  kind: MarkKind;
  stretch: Stretch | null;
  sg: SgValues | null;
  /** The four SG cells, shown to 0.1, do not add to the shown total. */
  drifts: boolean;
}

function buildRow(r: Round): RowModel {
  const sg: SgValues | null = r.sg
    ? {
        tee: r.sg.tee,
        approach: r.sg.approach,
        aroundGreen: r.sg.aroundGreen,
        putting: r.sg.putting,
        total: r.sg.total,
      }
    : null;
  const shownParts = sg
    ? round1(sg.tee) + round1(sg.approach) + round1(sg.aroundGreen) + round1(sg.putting)
    : 0;
  return {
    id: r.id,
    weekday: formatDateOnlyWeekdayShort(r.date),
    dateShort: formatDateOnlyShort(r.date),
    course: r.course,
    short: r.short,
    type: r.type,
    typeLabel: r.typeLabel,
    holes: r.holes,
    score: r.score,
    toPar: r.toPar,
    toPar18: r.toPar18,
    counted: r.counted,
    delta: r.counted ? deltaVsUsual(r, USUAL) : null,
    kind: r.counted ? markVsUsual(r.toPar18, USUAL) : 'par',
    stretch: r.counted ? worstStretch(r.holeScores) : null,
    sg,
    drifts: sg ? Math.abs(round1(shownParts) - round1(sg.total)) >= 0.05 : false,
  };
}

export const ROW_MODELS: readonly RowModel[] = ROUNDS.map(buildRow);

export type TypeFilterKey = 'all' | FixtureRoundType;

export interface TypeFilterOption {
  key: TypeFilterKey;
  label: string;
  count: number;
}

export const TYPE_FILTERS: readonly TypeFilterOption[] = [
  { key: 'all', label: 'All', count: ROUNDS.length },
  { key: 'practice', label: TYPE_LABEL.practice, count: ROUNDS.filter((r) => r.type === 'practice').length },
  { key: 'qualifier', label: TYPE_LABEL.qualifier, count: ROUNDS.filter((r) => r.type === 'qualifier').length },
  { key: 'tournament', label: TYPE_LABEL.tournament, count: ROUNDS.filter((r) => r.type === 'tournament').length },
];

/* ── The season strip ────────────────────────────────────────────────────── */

/** Oldest to newest, counted rounds, on an 18-hole basis. A 9-hole round is hollow. */
export const STRIP_POINTS: readonly RoundStripPoint[] = CHRONOLOGICAL.map((r) => ({
  id: r.id,
  date: r.date,
  toPar: r.toPar18,
  score: r.score,
  courseName: r.short,
  fill: r.holes === 18 ? 'solid' : 'hollow',
}));

/* ── Copy helpers ────────────────────────────────────────────────────────── */

/** [5] gives "5", [5, 14] gives "5 and 14", [5, 10, 14] gives "5, 10 and 14". */
export function listNumbers(nums: readonly number[]): string {
  if (nums.length <= 1) return nums.join('');
  return `${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`;
}

/** "4.5 better than your usual" / "2.0 worse than your usual" / "right on your usual". */
export function versusUsualText(delta: number): string {
  const size = Math.abs(delta);
  if (round1(size) === 0) return 'right on your usual';
  return `${size.toFixed(1)} ${delta < 0 ? 'better' : 'worse'} than your usual`;
}

/**
 * FAKE COPY, from the brief ("11 unfinished · newest 10d ago"). The fixture has no in-progress
 * rounds, so these two figures are illustrative text, not data.
 */
export const UNFINISHED_FAKE = { count: 11, newestDaysAgo: 10 } as const;
