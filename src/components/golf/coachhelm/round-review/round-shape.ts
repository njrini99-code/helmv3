/**
 * ============================================================================
 * round-shape — the pure logic behind the Round review stage (round-review.v3)
 * ----------------------------------------------------------------------------
 * Everything the `HoleField` instrument, the masthead verdict and the stage
 * readouts need, computed from fields that already exist on the round, the
 * stored `RoundReviewContent` and the player's own comparison averages. No
 * React, no Supabase — data in, data out, so every branch is fixture-testable.
 *
 * Two honesty rules run through this file:
 *   1. A value that was never entered is `null`, never 0. A scorecard-only
 *      round (`holeByHole.length === 0`) has no hole deltas, no cumulative
 *      line and no stretches — the callers render the degraded stage instead
 *      of a fabricated series.
 *   2. Every delta compares against a real measured average. When the
 *      comparison average is absent the delta is simply omitted.
 * ========================================================================== */

import { formatToPar } from '@/lib/golf/format-to-par';
import type {
  ComparisonAverages,
  HoleBreakdown,
  RoundReviewContent,
  RoundReviewTrendRow,
  StrokesToGainItem,
} from '@/app/golf/actions/round-review-system';
// Type-only, and one direction: this file maps the review's view model into
// the instrument's neutral column model. `HoleField` knows nothing about the
// review, which is what lets the round detail screen share it.
import type {
  HoleFieldColumn,
  HoleFieldDivider,
  HoleFieldLine,
  HoleFieldPoint,
} from './HoleField';

/* ─────────────────────────────────────────────────────────────────────────
 * Hole deltas and stretches
 * ──────────────────────────────────────────────────────────────────────── */

export interface HoleDelta {
  hole: number;
  /** Signed strokes against par on that hole alone. */
  delta: number;
}

/**
 * Per-hole score to par recovered from `momentumData`, which stores the
 * RUNNING cumulative score to par (see `round-review-content.ts`'s momentum
 * loop). The first hole's delta is its own cumulative value; every later
 * hole is the step from the previous cumulative reading.
 */
export function holeDeltasFromMomentum(
  momentum: RoundReviewContent['momentumData'],
): HoleDelta[] {
  const out: HoleDelta[] = [];
  let previous = 0;
  for (const point of momentum) {
    out.push({ hole: point.hole, delta: point.rollingScoreToPar - previous });
    previous = point.rollingScoreToPar;
  }
  return out;
}

export interface Stretch {
  from: number;
  to: number;
  /** Signed strokes against par across the stretch. Negative is under par. */
  strokes: number;
  /** How many holes the stretch spans. */
  holes: number;
}

/**
 * The longest run of holes that did not drop a shot (every hole's own delta
 * is <= 0). Runs shorter than two holes are not a "stretch" and return
 * `null` rather than a one-hole claim. Ties on length are broken by the run
 * that went furthest under par, then by the earlier start — deterministic,
 * so the same round always produces the same sentence.
 */
export function bestStretch(deltas: ReadonlyArray<HoleDelta>): Stretch | null {
  let best: Stretch | null = null;
  let runStart = -1;
  let runStrokes = 0;

  const close = (endIndex: number) => {
    if (runStart < 0) return;
    const from = deltas[runStart]!.hole;
    const to = deltas[endIndex]!.hole;
    const holes = endIndex - runStart + 1;
    if (holes >= 2) {
      const candidate: Stretch = { from, to, strokes: runStrokes, holes };
      if (
        best === null ||
        candidate.holes > best.holes ||
        (candidate.holes === best.holes && candidate.strokes < best.strokes)
      ) {
        best = candidate;
      }
    }
    runStart = -1;
    runStrokes = 0;
  };

  for (let i = 0; i < deltas.length; i += 1) {
    if (deltas[i]!.delta <= 0) {
      if (runStart < 0) runStart = i;
      runStrokes += deltas[i]!.delta;
    } else {
      close(i - 1);
    }
  }
  close(deltas.length - 1);
  return best;
}

/** The single worst three consecutive holes, by total strokes dropped. */
export function worstWindow(deltas: ReadonlyArray<HoleDelta>, size = 3): Stretch | null {
  if (deltas.length < size) return null;
  let best: Stretch | null = null;
  for (let i = 0; i + size <= deltas.length; i += 1) {
    let strokes = 0;
    for (let k = 0; k < size; k += 1) strokes += deltas[i + k]!.delta;
    if (best === null || strokes > best.strokes) {
      best = { from: deltas[i]!.hole, to: deltas[i + size - 1]!.hole, strokes, holes: size };
    }
  }
  return best;
}

/* ─────────────────────────────────────────────────────────────────────────
 * The cumulative line
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * `momentumData` plotted on its OWN scale (never the bars' scale — the two
 * share a box and nothing else, which is why the finishing value is labelled
 * at the right edge). `x` is taken from the hole's position in `holeOrder`,
 * the instrument's own column order, so the line always sits over the bar it
 * describes even if the two lists disagree in length; a momentum point for a
 * hole the instrument does not draw is dropped rather than plotted somewhere
 * arbitrary. A flat round (min === max) draws down the middle instead of
 * dividing by zero.
 */
export function cumulativeLine(
  momentum: RoundReviewContent['momentumData'],
  holeOrder?: ReadonlyArray<number>,
): HoleFieldLine | null {
  if (momentum.length === 0) return null;
  const order = holeOrder && holeOrder.length > 0 ? holeOrder : momentum.map((p) => p.hole);
  const index = new Map(order.map((holeNumber, i) => [holeNumber, i]));
  const plotted = momentum.filter((p) => index.has(p.hole));
  if (plotted.length === 0) return null;
  const values = plotted.map((p) => p.rollingScoreToPar);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const columnWidth = 100 / order.length;
  const points: HoleFieldPoint[] = plotted.map((point) => ({
    hole: point.hole,
    value: point.rollingScoreToPar,
    x: columnWidth * index.get(point.hole)! + columnWidth / 2,
    y: span === 0 ? 50 : ((max - point.rollingScoreToPar) / span) * 100,
  }));
  return { points, min, max, last: values[values.length - 1]! };
}

/* ─────────────────────────────────────────────────────────────────────────
 * The instrument's columns
 * ──────────────────────────────────────────────────────────────────────── */

/** First word of a logged miss direction, or `null` when it is not a side. */
export function missSide(raw: string | null): 'left' | 'right' | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('left')) return 'left';
  if (lower.includes('right')) return 'right';
  return null;
}

const SCORE_NAME: Record<number, string> = {
  [-3]: 'albatross',
  [-2]: 'eagle',
  [-1]: 'birdie',
  0: 'par',
  1: 'bogey',
  2: 'double bogey',
};

function scoreName(delta: number): string {
  return SCORE_NAME[delta] ?? (delta > 0 ? `${delta} over` : `${Math.abs(delta)} under`);
}

/** One column per hole, in hole order. The par row is bare numerals: the word
 *  "Par" is a row label and lives in the instrument's lane, because a column
 *  an eighteenth of the screen wide truncates "Par 4" to "PA…". */
export function holeColumns(holes: ReadonlyArray<HoleBreakdown>): HoleFieldColumn[] {
  return holes.map((h) => ({
    key: String(h.hole),
    value: h.scoreToPar,
    overline: String(h.par),
    label: String(h.hole),
    detail: `Hole ${h.hole}, par ${h.par}, scored ${h.score}, ${scoreName(h.scoreToPar)}`,
    deep: h.scoreToPar <= -2,
    fairway: { hit: h.fairwayHit, side: h.fairwayHit === false ? missSide(h.driveMiss) : null },
    gir: h.gir,
  }));
}

/** True when at least one hole logged an off-the-tee result. */
export function hasFairwayRow(holes: ReadonlyArray<HoleBreakdown>): boolean {
  return holes.some((h) => h.fairwayHit !== null);
}

/**
 * The degraded stage: the player's recent rounds as the same instrument,
 * with the reviewed round marked. Rows arrive newest-first from
 * `getRoundReviewTrend`, so they are flipped to read left to right in time.
 * Fewer than two rounds is not a trajectory and returns `[]` — the caller
 * then says so in one line rather than drawing a single lonely bar.
 */
export function seasonColumns(
  rows: ReadonlyArray<RoundReviewTrendRow>,
  currentRoundId: string,
): HoleFieldColumn[] {
  if (rows.length < 2) return [];
  return [...rows]
    .reverse()
    .map((r) => ({
      key: r.id,
      value: r.score_to_par,
      overline: shortRoundDate(r.round_date),
      label: formatToPar(r.score_to_par),
      detail: `${shortRoundDate(r.round_date)}, ${formatToPar(r.score_to_par)}${r.id === currentRoundId ? ', this round' : ''}`,
      marked: r.id === currentRoundId,
    }));
}

/** "Driver" / "Non-driver" — `golf_shots.club_type` only distinguishes those
 *  two, and the raw token must never reach the table. Any other stored value
 *  is de-underscored and sentence-cased rather than guessed at. */
export function humanizeClub(club: string | null): string | null {
  if (!club) return null;
  const token = club.toLowerCase().trim();
  if (token === 'driver') return 'Driver';
  if (token === 'non_driver' || token === 'non-driver') return 'Non-driver';
  const words = token.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Aug 31" from a `YYYY-MM-DD` day, with no `Date` round trip (which would
 *  shift the day backwards in US timezones). */
export function shortRoundDate(date: string): string {
  const parts = date.slice(0, 10).split('-');
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!month || !day) return '';
  return `${MONTH_SHORT[month - 1]} ${day}`;
}

/* ─────────────────────────────────────────────────────────────────────────
 * The masthead verdict
 * ──────────────────────────────────────────────────────────────────────── */

export interface VerdictPart {
  text: string;
  /** Rendered in mono so a number sits with the other numbers on the page. */
  mono?: boolean;
}

export interface VerdictInput {
  totalScore: number | null;
  scoreToPar: number | null;
  courseName: string;
  deltas: ReadonlyArray<HoleDelta>;
  strokesToGain: ReadonlyArray<StrokesToGainItem>;
}

/** The biggest opportunity on the round, or `null` when none was computed. */
export function topLeak(items: ReadonlyArray<StrokesToGainItem>): StrokesToGainItem | null {
  const ranked = [...items]
    .filter((i) => i.potentialStrokes > 0)
    .sort((a, b) => b.potentialStrokes - a.potentialStrokes);
  return ranked[0] ?? null;
}

/**
 * The masthead sentence. Every clause is dropped rather than guessed: no
 * score means no opening clause, no hole deltas means the scorecard-only
 * sentence and nothing after it, no computed opportunity means no cost
 * clause.
 */
export function buildVerdict(input: VerdictInput): VerdictPart[] {
  const { totalScore, scoreToPar, courseName, deltas, strokesToGain } = input;
  const parts: VerdictPart[] = [];

  if (totalScore != null) {
    parts.push({ text: String(totalScore), mono: true });
    if (scoreToPar != null) {
      parts.push({ text: ' (' });
      parts.push({ text: formatToPar(scoreToPar), mono: true });
      parts.push({ text: ')' });
    }
    parts.push({ text: courseName ? ` at ${courseName}.` : '.' });
  } else if (courseName) {
    parts.push({ text: `${courseName}.` });
  }

  if (deltas.length === 0) {
    parts.push({ text: ' Scorecard only, so there is no hole-by-hole read yet.' });
    return parts;
  }

  const best = bestStretch(deltas);
  if (best) {
    const span = `holes ${best.from} to ${best.to}`;
    if (best.strokes < 0) {
      parts.push({ text: ` Holes ${best.from} to ${best.to} were the round: ` });
      parts.push({ text: `${Math.abs(best.strokes)} under`, mono: true });
      parts.push({ text: '.' });
    } else {
      parts.push({ text: ` The round held through ${span}, ` });
      parts.push({ text: String(best.holes), mono: true });
      parts.push({ text: ' holes without a dropped shot.' });
    }
  }

  const worst = worstWindow(deltas);
  if (worst && worst.strokes >= 2 && !(best && worst.from >= best.from && worst.to <= best.to)) {
    parts.push({ text: ` Holes ${worst.from} to ${worst.to} cost ` });
    parts.push({ text: `${worst.strokes}`, mono: true });
    parts.push({ text: worst.strokes === 1 ? ' shot.' : ' shots.' });
  }

  const leak = topLeak(strokesToGain);
  if (leak) {
    parts.push({ text: ` ${leak.category} cost ` });
    parts.push({ text: leak.potentialStrokes.toFixed(1), mono: true });
    parts.push({ text: ' strokes.' });
  }

  return parts;
}

/* ─────────────────────────────────────────────────────────────────────────
 * The masthead facts line
 * ──────────────────────────────────────────────────────────────────────── */

export interface FactsInput {
  totalPutts: number | null;
  fairwaysHit: number | null;
  fairwaysPlayed: number | null;
  gir: number | null;
  girPossible: number | null;
  penalties: number | null;
}

/** Putts, fairways, greens, penalties — each omitted when its source is null. */
export function buildFacts(input: FactsInput): string[] {
  const facts: string[] = [];
  if (input.totalPutts != null) facts.push(`${input.totalPutts} putts`);
  if (input.fairwaysHit != null && input.fairwaysPlayed != null && input.fairwaysPlayed > 0) {
    facts.push(`${input.fairwaysHit}/${input.fairwaysPlayed} fairways`);
  }
  if (input.gir != null && input.girPossible != null && input.girPossible > 0) {
    facts.push(`${input.gir}/${input.girPossible} greens`);
  }
  if (input.penalties != null && input.penalties > 0) {
    facts.push(`${input.penalties} ${input.penalties === 1 ? 'penalty' : 'penalties'}`);
  }
  return facts;
}

/* ─────────────────────────────────────────────────────────────────────────
 * The stage readouts
 * ──────────────────────────────────────────────────────────────────────── */

export interface ReadoutDelta {
  text: string;
  tone: 'good' | 'bad' | 'flat';
}

export interface Readout {
  key: string;
  label: string;
  value: string | null;
  caption: string | null;
  delta: ReadoutDelta | null;
}

/**
 * A signed comparison against the player's own recent average. `better`
 * decides which side of zero is good; a difference under a tenth reads as
 * level rather than claiming movement that is not there.
 */
export function compareToAverage(
  value: number | null,
  average: number | null | undefined,
  better: 'lower' | 'higher',
  unit: string,
): ReadoutDelta | null {
  if (value == null || average == null || !Number.isFinite(average)) return null;
  const diff = value - average;
  const magnitude = Math.abs(diff);
  if (magnitude < 0.1) return { text: 'level with recent rounds', tone: 'flat' };
  const good = better === 'lower' ? diff < 0 : diff > 0;
  return {
    text: `${magnitude.toFixed(1)}${unit} ${good ? 'better' : 'worse'} than recent`,
    tone: good ? 'good' : 'bad',
  };
}

export interface ReadoutInput {
  totalScore: number | null;
  scoreToPar: number | null;
  totalPutts: number | null;
  gir: number | null;
  girPossible: number | null;
  fairwaysHit: number | null;
  fairwaysPlayed: number | null;
  averages: ComparisonAverages | null;
  onePutts: number | null;
  threePutts: number | null;
}

function pct(made: number, of: number): number | null {
  return of > 0 ? (made / of) * 100 : null;
}

/** Score, putts, greens and fairways, each with a delta when a real
 *  comparison average exists and nothing at all when it does not. */
export function buildReadouts(input: ReadoutInput): Readout[] {
  const avg = input.averages;
  const girPct = input.gir != null && input.girPossible != null ? pct(input.gir, input.girPossible) : null;
  const fairwayPct =
    input.fairwaysHit != null && input.fairwaysPlayed != null ? pct(input.fairwaysHit, input.fairwaysPlayed) : null;

  const puttCaption = (() => {
    const bits: string[] = [];
    if (input.onePutts != null && input.onePutts > 0) bits.push(`${input.onePutts} one-putts`);
    if (input.threePutts != null && input.threePutts > 0) bits.push(`${input.threePutts} three-putts`);
    return bits.length > 0 ? bits.join(', ') : null;
  })();

  return [
    {
      key: 'score',
      label: 'Score',
      value: input.totalScore != null ? String(input.totalScore) : null,
      caption: input.scoreToPar != null ? formatToPar(input.scoreToPar) : null,
      delta:
        compareToAverage(input.scoreToPar, avg?.avgScoreToPar, 'lower', '') ??
        compareToAverage(input.totalScore, avg?.avgScore, 'lower', ''),
    },
    {
      key: 'putts',
      label: 'Putts',
      value: input.totalPutts != null ? String(input.totalPutts) : null,
      caption: puttCaption,
      delta: compareToAverage(input.totalPutts, avg?.avgPutts, 'lower', ''),
    },
    {
      key: 'gir',
      label: 'Greens in regulation',
      value:
        input.gir != null && input.girPossible != null && input.girPossible > 0
          ? `${input.gir}/${input.girPossible}`
          : null,
      caption: girPct != null ? `${Math.round(girPct)}%` : null,
      delta: compareToAverage(girPct, avg?.avgGirPct, 'higher', ' pts'),
    },
    {
      key: 'fairways',
      label: 'Fairways',
      value:
        input.fairwaysHit != null && input.fairwaysPlayed != null && input.fairwaysPlayed > 0
          ? `${input.fairwaysHit}/${input.fairwaysPlayed}`
          : null,
      caption: fairwayPct != null ? `${Math.round(fairwayPct)}%` : null,
      delta: compareToAverage(fairwayPct, avg?.avgFairwayPct, 'higher', ' pts'),
    },
  ];
}

/* ─────────────────────────────────────────────────────────────────────────
 * The ledger's "Where it went" rows
 * ──────────────────────────────────────────────────────────────────────── */

export interface LeakRow {
  category: string;
  strokes: number;
  description: string;
  /** 0-1 against the largest opportunity on the round. */
  share: number;
}

/** `strokesToGain` ranked biggest first, scaled to the leader. */
export function buildLeakRows(items: ReadonlyArray<StrokesToGainItem>): LeakRow[] {
  const ranked = [...items]
    .filter((i) => i.potentialStrokes > 0)
    .sort((a, b) => b.potentialStrokes - a.potentialStrokes);
  const max = ranked[0]?.potentialStrokes ?? 0;
  if (max <= 0) return [];
  return ranked.map((i) => ({
    category: i.category,
    strokes: i.potentialStrokes,
    description: i.description,
    share: i.potentialStrokes / max,
  }));
}

/* ─────────────────────────────────────────────────────────────────────────
 * The front and back split marker
 * ──────────────────────────────────────────────────────────────────────── */

/** The hairline between the nines, present only when both halves were played. */
export function nineDivider(
  holes: ReadonlyArray<HoleBreakdown>,
  split: RoundReviewContent['frontBackSplit'],
): HoleFieldDivider | null {
  const lastFront = holes.reduce((found, h, i) => (h.hole <= 9 ? i : found), -1);
  if (lastFront < 0 || lastFront === holes.length - 1) return null;
  if (split.front.score <= 0 || split.back.score <= 0) return null;
  return {
    afterIndex: lastFront,
    frontLabel: `OUT ${split.front.score}`,
    backLabel: `IN ${split.back.score}`,
  };
}
