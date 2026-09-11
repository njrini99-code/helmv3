/**
 * ============================================================================
 * player-home-logic — the player home v3 pure derivations
 * ----------------------------------------------------------------------------
 * Every judgement this page makes is decided here and read by the components,
 * never re-derived beside the thing it describes. That rule exists because the
 * three defects this rebuild carries forward were all the same shape: a
 * caption asserting something the number or the line underneath it did not
 * support. A sentence and the mark it sits beside have to come from one call.
 *
 * Nothing here reads a clock, fetches, or formats for display.
 * ========================================================================== */

import { computeSeriesTrend, type SeriesTrend } from '@/components/fairway/charts/seriesTrend';
import type { StrokesGainedSnapshot, ActionItem } from '@/app/golf/actions/dashboard-data';

/** One clause of the masthead verdict; `href` makes it a link. */
export interface VerdictPart {
  text: string;
  href?: string;
}

/* ── Strokes gained ─────────────────────────────────────────────────────── */

export interface SGZone {
  /** The app's own abbreviation, as the tornado's label gutter needs it. */
  label: string;
  value: number;
}

/** Spelled out for sentences; the chart keeps the abbreviations. */
export const SG_ZONE_PHRASE: Record<string, string> = {
  Tee: 'off the tee',
  App: 'on approach',
  ATG: 'around the green',
  Putt: 'on the greens',
};

export function sgZonePhrase(label: string): string {
  return SG_ZONE_PHRASE[label] ?? label.toLowerCase();
}

/** The zones carrying a finite value, in course order. */
export function sgZones(sg: StrokesGainedSnapshot | null | undefined): SGZone[] {
  if (!sg) return [];
  const raw: Array<{ label: string; value: number | null }> = [
    { label: 'Tee', value: sg.sg_off_tee },
    { label: 'App', value: sg.sg_approach },
    { label: 'ATG', value: sg.sg_around_green },
    { label: 'Putt', value: sg.sg_putting },
  ];
  return raw.filter((r): r is SGZone => r.value != null && Number.isFinite(r.value));
}

/**
 * The shape of a player's strokes-gained picture, settled once.
 *
 * `allPositive` and `allNegative` are BOTH named, rather than one being
 * inferred from the other, because the failure this replaces came from
 * checking only one end: the v2 sentence asked whether the worst zone was
 * positive and then, in the else branch, called the best zone a gain without
 * ever asking whether it was. A player leaking strokes in all four zones was
 * told they were gaining in one.
 */
export interface SGRead {
  zones: SGZone[];
  best: SGZone | null;
  worst: SGZone | null;
  allPositive: boolean;
  allNegative: boolean;
  /** Fewer than three zones cannot describe a player's shape. */
  legible: boolean;
}

export function readStrokesGained(sg: StrokesGainedSnapshot | null | undefined): SGRead {
  const zones = sgZones(sg);
  if (zones.length === 0) {
    return { zones, best: null, worst: null, allPositive: false, allNegative: false, legible: false };
  }
  const best = zones.reduce((a, b) => (b.value > a.value ? b : a));
  const worst = zones.reduce((a, b) => (b.value < a.value ? b : a));
  return {
    zones,
    best,
    worst,
    allPositive: worst.value >= 0,
    allNegative: best.value < 0,
    legible: zones.length >= 3,
  };
}

/**
 * One sentence naming where the strokes go, or null when the four zones cannot
 * support a claim. Every branch is checked against BOTH ends of the range.
 */
export function sgTakeaway(read: SGRead): string | null {
  if (!read.legible || !read.best || !read.worst) return null;
  const best = sgZonePhrase(read.best.label);
  const worst = sgZonePhrase(read.worst.label);
  if (read.allPositive) return `Gaining in every zone; the thinnest edge is ${worst}.`;
  // Nothing is positive: there is no "gaining most" to name, only a least-bad.
  if (read.allNegative) return `Leaking in every zone; least ${best}, most ${worst}.`;
  return `Gaining most ${best}, leaking most ${worst}.`;
}

/* ── The scoring trend ──────────────────────────────────────────────────── */

/** Lower is better for a golf score; the whole page depends on that direction. */
export function scoringTrend(series: readonly number[] | null | undefined): SeriesTrend | null {
  return computeSeriesTrend(series, { goodDirection: 'down' });
}

/**
 * Whether the stage may draw a dashed average rule, which decides whether any
 * caption is allowed to mention one.
 *
 * The v2 takeaway said "the dashed line is your average" and was gated on
 * whether a last round existed. The line is gated on the average existing.
 * With a round logged and no scoring average on record the page named a line
 * that was not on the screen. One predicate now answers both.
 */
export function hasBenchmark(scoringAverage: number | null | undefined): boolean {
  return scoringAverage != null && Number.isFinite(scoringAverage);
}

/* ── The verdict ────────────────────────────────────────────────────────── */

export interface PlayerVerdictInput {
  roundsPlayed: number;
  scoringAverage: number | null;
  scoringSeries: readonly number[];
  sg: StrokesGainedSnapshot | null | undefined;
  actionItems: readonly ActionItem[];
}

export function overdueCount(items: readonly ActionItem[]): number {
  return items.filter((i) => i.overdue === true).length;
}

/**
 * The masthead sentence, as clauses. Each renders only when its input exists.
 * The trend clause is the one exception: it states that the trend is not yet
 * callable rather than disappearing, because silently dropping it hides how
 * thin the record is.
 */
export function buildPlayerVerdict(input: PlayerVerdictInput): VerdictPart[] {
  const parts: VerdictPart[] = [];
  const { roundsPlayed, scoringAverage, scoringSeries, sg, actionItems } = input;

  if (roundsPlayed <= 0) {
    parts.push({ text: 'No rounds logged yet.' });
  } else {
    parts.push({ text: `${roundsPlayed} round${roundsPlayed === 1 ? '' : 's'} logged.` });

    const trend = scoringTrend(scoringSeries);
    if (!trend) {
      parts.push({ text: ' Not enough rounds yet to call a trend.' });
    } else {
      const magnitude = Math.abs(trend.value).toFixed(1);
      const head = hasBenchmark(scoringAverage) ? `Scoring ${scoringAverage!.toFixed(1)}, ` : '';
      if (trend.direction === 'improving') {
        parts.push({ text: ` ${head}down ${magnitude} over your last ${trend.points}.` });
      } else if (trend.direction === 'declining') {
        parts.push({ text: ` ${head}up ${magnitude} over your last ${trend.points}.` });
      } else {
        parts.push({
          text: hasBenchmark(scoringAverage)
            ? ` Holding around ${scoringAverage!.toFixed(1)}.`
            : ` Holding steady over your last ${trend.points}.`,
        });
      }
    }
  }

  // Only ever names a zone that is genuinely costing strokes. A worst zone
  // with a positive value is the thinnest edge, not a leak, and saying it
  // "costs" anything would contradict the bar beside it.
  const read = readStrokesGained(sg);
  if (read.legible && read.worst && read.worst.value < 0) {
    parts.push({ text: ' ' });
    parts.push({ text: sgZonePhrase(read.worst.label), href: '#strokes' });
    parts.push({ text: ' is costing you most.' });
  }

  const overdue = overdueCount(actionItems);
  if (overdue > 0) {
    parts.push({ text: ' ' });
    parts.push({ text: `${overdue} overdue`, href: '#plate' });
    parts.push({ text: '.' });
  }

  return parts;
}

export function verdictText(parts: readonly VerdictPart[]): string {
  return parts.map((p) => p.text).join('');
}

/* ── The stage series ───────────────────────────────────────────────────── */

/**
 * A round on the stage. `date` is present only once the server carries it
 * (`dashboard-data.ts:1195` formats it away today), and the axis mode below
 * depends on it rather than on parsing a display label.
 */
export interface StageRound {
  key: string;
  label: string;
  score: number;
  /** Signed strokes to par, when the source carries it. */
  toPar: number | null;
  date: string | null;
}

export type StageAxis = 'date' | 'ordinal';

/**
 * Which axis the stage may honestly draw.
 *
 * `"Sep 10"` carries no year, so two rounds twelve months apart collapse onto
 * one label. Reconstructing a date from it would be a fabricated series, so
 * the axis stays ordinal until every round carries a real date.
 */
export function stageAxis(rounds: readonly StageRound[]): StageAxis {
  return rounds.length > 0 && rounds.every((r) => r.date != null) ? 'date' : 'ordinal';
}

/** Rounds below this are not 18-hole totals and would draw a fake collapse. */
export const EIGHTEEN_HOLE_FLOOR = 55;

export function stageRounds(
  trend: ReadonlyArray<{ label: string; value: number; date?: string | null }> | null | undefined,
  par: number | null,
): StageRound[] {
  if (!trend) return [];
  return trend
    .filter((pt) => Number.isFinite(pt.value) && pt.value >= EIGHTEEN_HOLE_FLOOR)
    .map((pt, i) => ({
      key: `${pt.label}-${i}`,
      label: pt.label,
      score: pt.value,
      toPar: par != null && Number.isFinite(par) ? pt.value - par : null,
      date: pt.date ?? null,
    }));
}

export interface StageState {
  rounds: StageRound[];
  axis: StageAxis;
  /** Below this the page draws marks but no trend, and says so. */
  canTrend: boolean;
  thinCaption: string | null;
}

export const MIN_TREND_ROUNDS = 3;

export function stageState(rounds: readonly StageRound[]): StageState {
  const list = [...rounds];
  const canTrend = list.length >= MIN_TREND_ROUNDS;
  const needed = MIN_TREND_ROUNDS - list.length;
  return {
    rounds: list,
    axis: stageAxis(list),
    canTrend,
    thinCaption:
      list.length === 0
        ? 'No rounds logged yet. Your first one starts the line.'
        : canTrend
          ? null
          : `${needed} more round${needed === 1 ? '' : 's'} and your trend draws.`,
  };
}

/* ── Readouts ───────────────────────────────────────────────────────────── */

export interface ReadoutRead {
  label: string;
  value: number | null;
  suffix: string;
  trend: SeriesTrend | null;
}

/**
 * One readout, with its delta derived from the SAME call that will colour its
 * sparkline. A metric with no series gets `trend: null` and prints no delta.
 *
 * `sparklines.handicap.sparkline` is hardcoded `[]` at the source, so handicap
 * always lands here with a value and no delta. It must never borrow another
 * metric's direction to look consistent with its neighbours.
 */
export function readReadout(
  label: string,
  value: number | null | undefined,
  series: readonly number[] | null | undefined,
  goodDirection: 'up' | 'down',
  suffix = '',
): ReadoutRead {
  return {
    label,
    value: value != null && Number.isFinite(value) ? value : null,
    suffix,
    trend: computeSeriesTrend(series, { goodDirection }),
  };
}
