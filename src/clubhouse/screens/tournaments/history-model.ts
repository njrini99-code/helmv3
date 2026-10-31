/**
 * What History reads off its data (P016 History): which figure each event plots, how the points fall into seasons, where
 * they sit on the chart, and the sentence under it. Display arithmetic on the figures `trend` already carries (a season's
 * mean of its points); the points themselves arrive computed.
 */
import { andList, formatFixed, plural } from './format';
import type { ChTourEvent, ChTourHistoryData, ChTourHistorySearch, ChTourPlayer } from './types';

export interface TrendPoint {
  event: ChTourEvent;
  /** The plotted figure: strokes a round against the course rating, or against the field. Null where there is none. */
  value: number | null;
  scorecardsOnly: boolean;
  rounds: number;
  players: number;
}

/** The points to plot, in event order, for one lineup mode and one baseline. */
export function trendPoints(data: Pick<ChTourHistoryData, 'trend' | 'events'>, search: ChTourHistorySearch): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (const t of data.trend) {
    const event = data.events.find((e) => e.id === t.eventId);
    if (!event) continue;
    // The field has no returning-players figure, so against the field the lineup is the one fielded.
    const value = search.adjust === 'field' ? t.vsField : search.mode === 'matched' ? t.matched : t.actual;
    out.push({ event, value, scorecardsOnly: t.scorecardsOnly, rounds: t.rounds, players: t.players });
  }
  return out;
}

/** Runs of points in one season, as index ranges: seasons are separate lines, never one across the summer. */
export function seasonRuns(points: readonly TrendPoint[]): Array<{ seasonId: string; from: number; to: number }> {
  const runs: Array<{ seasonId: string; from: number; to: number }> = [];
  points.forEach((p, i) => {
    const last = runs[runs.length - 1];
    if (last && last.seasonId === p.event.seasonId) last.to = i;
    else runs.push({ seasonId: p.event.seasonId, from: i, to: i });
  });
  return runs;
}

/** The chart's scale: the plotted range with room above and below, and the mean of the plotted points. */
export function trendScale(points: readonly TrendPoint[], pad = 0.6): { lo: number; hi: number; mean: number | null } {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length === 0) return { lo: -1, hi: 1, mean: null };
  const lo = Math.min(...vals) - pad;
  const hi = Math.max(...vals) + pad;
  return { lo, hi: hi === lo ? lo + 1 : hi, mean: vals.reduce((a, b) => a + b, 0) / vals.length };
}

/** Where a value sits, 0 at the top (the better end) to 1 at the bottom. Lower is better, so lower is higher up. */
export const trendY = (v: number, lo: number, hi: number) => (v - lo) / (hi - lo);

/** Where point `i` of `n` sits across the chart, 0 to 1: the centre of its own column, so a label can sit under it. */
export const trendX = (i: number, n: number) => (i + 0.5) / n;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * The sentence under the trend: how this season's average compares with last season's, in strokes a round, and, for the
 * lineup as fielded, who left and who joined (so a gain is never read as the same players improving). Null where either
 * season has no plotted point.
 */
export function trendNote(data: Pick<ChTourHistoryData, 'trend' | 'events' | 'seasons' | 'players' | 'matchedPlayers'>, search: ChTourHistorySearch): string | null {
  if (search.adjust === 'field') return null;
  const [cur, prev] = data.seasons;
  if (!cur || !prev) return null;
  const actual = trendPoints(data, { ...search, mode: 'actual' });
  const of = (pts: TrendPoint[], id: string) => pts.filter((p) => p.event.seasonId === id && p.value != null);
  const nowA = mean(of(actual, cur.id).map((p) => p.value as number));
  const beforeA = mean(of(actual, prev.id).map((p) => p.value as number));
  if (nowA == null || beforeA == null) return null;
  const count = of(actual, cur.id).length;
  const way = (diff: number) => (diff < 0 ? 'closer to' : 'further from');
  const size = (diff: number) => formatFixed(Math.abs(diff), 1);
  if (search.mode === 'matched') {
    const matched = trendPoints(data, search);
    const nowM = mean(of(matched, cur.id).map((p) => p.value as number));
    const beforeM = mean(of(matched, prev.id).map((p) => p.value as number));
    if (nowM == null || beforeM == null) return null;
    const dM = nowM - beforeM;
    const smaller = dM < 0 && nowA - beforeA < dM;
    const who = `The ${data.matchedPlayers.length} returning players are`;
    if (size(dM) === '0.0') return `${who} about the same distance from the rating as last season.`;
    return `${who} ${size(dM)} strokes a round ${way(dM)} the rating than last season${smaller ? ', a smaller gain than the full lineup shows' : ''}.`;
  }
  const d = nowA - beforeA;
  const lineup = (id: string) => new Set(data.events.filter((e) => e.seasonId === id).flatMap((e) => e.entries.filter((x) => x.role === 'lineup').map((x) => x.playerId)));
  const before = lineup(prev.id);
  const after = lineup(cur.id);
  const name = (id: string) => data.players.find((p: ChTourPlayer) => p.id === id)?.first ?? '';
  const left = data.players.filter((p) => p.alumni && before.has(p.id) && !after.has(p.id)).map((p) => p.first);
  const joined = [...after].filter((id) => !before.has(id)).map(name).filter(Boolean);
  const moves = [left.length ? `${andList(left)} graduated` : '', joined.length ? `${andList(joined)} joined the lineup` : ''].filter(Boolean);
  const head =
    size(d) === '0.0'
      ? `This season’s ${plural(count, 'event')} average about the same distance from the rating as last season.`
      : `This season’s ${plural(count, 'event')} average ${size(d)} strokes a round ${way(d)} the rating than last season.`;
  return moves.length ? `${head} ${moves.join(' and ')}, so this is the team you fielded, not the same players over time.` : head;
}
