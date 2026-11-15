import { ALL_SCORING_COLUMNS, lookupMetricSource, type MetricSourceDef } from '@/lib/coachhelm/v3/causality/metric-sources';
import { isCountableRound } from '@/lib/golf/round-countable';
import { plural } from '../lib/plural';

/**
 * What the read page reads beside the read itself (7 Nov design): the read's own metric round by round, how many rounds are newer
 * than the read, and the score on each hole a counted path names. Pure and client-safe; the loader is `coachhelm-read-extras.ts`.
 *
 * Nothing here is a second formula. Where a metric's per-round value lives is the attribution registry's answer
 * (`lib/coachhelm/v3/causality/metric-sources.ts`, the one table that maps a metric to its per-round source), read from the same
 * `golf_rounds` and `golf_round_stats_cache` columns Stats and the goal windows read, over the same countable rounds
 * (`lib/golf/round-countable.ts`). A metric the registry marks as having no per-round series (a putt make rate by distance, a miss
 * bias, a proximity band) has none here either: the page then draws no trend, never an invented one.
 */

/** A completed round of the player's, with the columns a per-round value can live on. */
export interface ReadRoundRow {
  id: string;
  round_date: string | null;
  holes_played: number | null;
  total_score: number | null;
  front_nine: number | null;
  back_nine: number | null;
  total_putts: number | null;
  score_to_par: number | null;
  strokes_gained_total: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
  total_penalties: number | null;
}

/** The round's stats row (`golf_round_stats_cache`), by column. */
export type ReadCacheRow = { round_id: string } & Record<string, number | string | null>;

/** One hole of a round (`golf_holes`). */
export interface ReadHoleRow {
  round_id: string;
  hole_number: number;
  score: number | null;
  par: number | null;
}

export interface ChReadExtras {
  /** The player's completed rounds, any order. */
  rounds: ReadRoundRow[];
  cache: ReadCacheRow[];
  /** The holes of the rounds a counted path names. */
  holes: ReadHoleRow[];
  /** The season's first day ("2026-08-01"), on the team's calendar. */
  seasonSince: string;
}

export interface ReadPoint {
  id: string;
  date: string;
  value: number;
  /** A share's own counts, so a window is the sum over the sum, never a mean of percentages. */
  num?: number;
  den?: number;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The metric's value in one round, by the registry's source for it; null when the round does not carry it. */
export function perRound(def: MetricSourceDef, round: ReadRoundRow, cache: ReadCacheRow | undefined): Omit<ReadPoint, 'id' | 'date'> | null {
  if (def.kind === 'rounds') {
    const v = num(round[def.column]);
    return v == null ? null : { value: v };
  }
  if (!cache) return null;
  if (def.kind === 'round_stats_cache_avg') {
    const v = num(cache[def.column]);
    return v == null ? null : { value: v };
  }
  if (def.kind === 'round_stats_cache_ratio') {
    const n = num(cache[def.numerator]);
    const d = num(cache[def.denominator]);
    return n == null || d == null || d <= 0 ? null : { value: (n / d) * def.scale, num: n, den: d };
  }
  if (def.kind === 'round_stats_cache_computed') {
    const sum = (cols: readonly string[]) => cols.reduce((a, c) => a + (num(cache[c]) ?? 0), 0);
    const d = sum(ALL_SCORING_COLUMNS);
    const n = sum(def.numerator_columns);
    return d <= 0 ? null : { value: (n / d) * def.scale, num: n, den: d };
  }
  return null;
}

/** The read's metric in each countable round, oldest to newest; null when the registry has no per-round source for it. */
export function readPoints(metric: string, extras: Pick<ChReadExtras, 'rounds' | 'cache'>): { def: MetricSourceDef; points: ReadPoint[] } | null {
  const def = lookupMetricSource(metric);
  if (!def || def.kind === 'intentional-null' || def.kind === 'hole_level_avg') return null;
  const cacheBy = new Map(extras.cache.map((c) => [c.round_id, c]));
  const points: ReadPoint[] = [];
  for (const r of extras.rounds) {
    const date = r.round_date?.slice(0, 10);
    const cache = cacheBy.get(r.id);
    // The same rule every average uses: a round too short, half recorded or implausible is not counted.
    if (!date || !isCountableRound({ ...r, strokes_gained_total: num(cache?.strokes_gained_total) ?? r.strokes_gained_total })) continue;
    const p = perRound(def, r, cache);
    if (p) points.push({ id: r.id, date, ...p });
  }
  points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  return { def, points };
}

/** A window's own figure: the sum over the sum for a share (as the registry aggregates it), else the mean of the rounds. */
export function windowFigure(def: MetricSourceDef, points: readonly ReadPoint[]): number | null {
  if (points.length === 0) return null;
  if (def.kind === 'round_stats_cache_ratio') {
    const d = points.reduce((a, p) => a + (p.den ?? 0), 0);
    return d > 0 ? (points.reduce((a, p) => a + (p.num ?? 0), 0) / d) * def.scale : null;
  }
  return points.reduce((a, p) => a + p.value, 0) / points.length;
}

/** The most rounds the short window draws (the design's "Last 8"), and the fewest a line is drawn for. */
export const TREND_LAST = 8;
export const TREND_MIN = 3;

/** What a share's numerator counts, for the line under a round ("9 of 14 fairways"). */
const SHARE_NOUN: Record<string, string> = { greens_hit: 'greens', fairways_hit: 'fairways', sand_saves: 'sand saves', scrambles_converted: 'up and downs' };

/** What the read's metric was in one round, in words, for its row in the rounds list; null when there is nothing to say. */
export function roundNote(def: MetricSourceDef, p: ReadPoint | undefined): string | null {
  if (!p) return null;
  const penalties = (def.kind === 'round_stats_cache_avg' && def.column === 'penalty_strokes') || (def.kind === 'rounds' && def.column === 'total_penalties');
  if (penalties) return p.value > 0 ? plural(p.value, 'penalty', 'penalties') : null;
  if (def.kind === 'round_stats_cache_ratio' && p.num != null && p.den != null) return `${p.num} of ${p.den} ${SHARE_NOUN[def.numerator] ?? ''}`.trim();
  return null;
}

/** How many countable rounds were played after `day` (the read's own day); null when the day is not known. */
export function roundsAfter(day: string | null, extras: Pick<ChReadExtras, 'rounds' | 'cache'>): number | null {
  if (!day) return null;
  const cacheBy = new Map(extras.cache.map((c) => [c.round_id, c]));
  return extras.rounds.filter((r) => (r.round_date?.slice(0, 10) ?? '') > day && isCountableRound({ ...r, strokes_gained_total: num(cacheBy.get(r.id)?.strokes_gained_total) ?? r.strokes_gained_total })).length;
}

/** A hole's score against its par, when both are on file. */
export function holeToPar(holes: readonly ReadHoleRow[], roundId: string, hole: number): number | null {
  const h = holes.find((x) => x.round_id === roundId && x.hole_number === hole);
  return h && num(h.score) != null && num(h.par) != null ? (h.score as number) - (h.par as number) : null;
}
