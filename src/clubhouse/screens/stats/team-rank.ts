import type { ChRankSample, ChTeamStats } from '../../data/stats-team';
import { formatSigned } from '../../lib/format';
import { earlyTag, needsText, POOLED_SD, rankWithTies, sampleState, standardError, type FloorKind, type SampleState, type SpreadKind } from '../../lib/stats-signal';
import { shortName } from '../../lib/names';

/** The figure the ranked dot plot ranks by: strokes gained in total or one leg, or the scoring average. */
export type TeamRankMetric = 'sg' | 'tee' | 'approach' | 'around' | 'putting' | 'score';

interface MetricDef {
  value: TeamRankMetric;
  /** The menu's words. */
  label: string;
  /** What the readout and the summary call it. */
  noun: string;
  /** The leg's place in the grid's `legs` (and `legTotals`); null for the total and the scoring average. */
  leg: number | null;
  floor: FloorKind;
  spread: SpreadKind;
  lowerIsBetter: boolean;
}

export const TEAM_RANK_METRICS: readonly MetricDef[] = [
  { value: 'sg', label: 'Strokes gained', noun: 'strokes gained', leg: null, floor: 'sgLong', spread: 'sg', lowerIsBetter: false },
  { value: 'tee', label: 'Off the tee', noun: 'strokes gained off the tee', leg: 0, floor: 'sgLong', spread: 'sg', lowerIsBetter: false },
  { value: 'approach', label: 'Approach', noun: 'strokes gained on approach', leg: 1, floor: 'sgLong', spread: 'sg', lowerIsBetter: false },
  { value: 'around', label: 'Around green', noun: 'strokes gained around the green', leg: 2, floor: 'sgShort', spread: 'sg', lowerIsBetter: false },
  { value: 'putting', label: 'Putting', noun: 'strokes gained putting', leg: 3, floor: 'sgShort', spread: 'sg', lowerIsBetter: false },
  { value: 'score', label: 'Scoring', noun: 'scoring average', leg: null, floor: 'score', spread: 'score', lowerIsBetter: true },
];

export function metricDef(metric: TeamRankMetric): MetricDef {
  return TEAM_RANK_METRICS.find((m) => m.value === metric) ?? TEAM_RANK_METRICS[0]!;
}

type GridRow = ChTeamStats['grid'][number];

/** One player's row in the plot. `rank` is null for a player under the figure's show floor (no dot, no rank). */
export interface TeamRankRow {
  id: string;
  name: string;
  /** The phone's name: first name and last initial ("Theo M."). */
  short: string;
  value: number | null;
  se: number | null;
  /** Whole rounds behind the figure. */
  n: number;
  state: SampleState;
  /** The early-read tag, or what a player under the floor needs. */
  tag?: string;
  rank: number | null;
  tied: boolean;
}

export { shortName };

function sampleOf(g: GridRow, def: MetricDef): ChRankSample | null {
  const s = g.spread;
  if (!s) return null;
  if (def.value === 'score') return s.score;
  if (def.leg == null) return s.sg;
  return s.legs[def.leg] ?? null;
}

function valueOf(g: GridRow, def: MetricDef): number | null {
  if (def.value === 'score') return g.avg;
  if (def.leg == null) return g.total;
  return g.legs[def.leg] ?? null;
}

/**
 * The players for one figure, best first (decision Q10): each one's mean, its standard error (their own round values when the
 * grid carries them, else the pooled spread over their rounds) and where it falls against the floors. Players with a dot are
 * ranked by the point value with `rankWithTies`, so a player closer than one standard error of the difference to the head of the run above shares its rank
 * ("T3") and a tie never reorders anyone. Players under the show floor follow, by name, with what they need.
 */
export function teamRankRows(grid: ChTeamStats['grid'], metric: TeamRankMetric): TeamRankRow[] {
  const def = metricDef(metric);
  const base = grid.map((g) => {
    const sample = sampleOf(g, def);
    const n = sample?.n ?? g.rounds;
    const raw = valueOf(g, def);
    const state: SampleState = raw == null ? 'none' : sampleState(def.floor, n);
    const se = state === 'none' ? null : sample ? sample.se : standardError(POOLED_SD[def.spread], n);
    return {
      id: g.id,
      name: g.name,
      short: shortName(g.name),
      value: state === 'none' ? null : raw,
      se,
      n,
      state,
      tag: state === 'early' ? earlyTag(n) : state === 'none' ? needsText(def.floor) : undefined,
    };
  });
  const byId = new Map(base.map((r) => [r.id, r]));
  const ranked = rankWithTies(
    base.filter((r) => r.value != null).map((r) => ({ id: r.id, value: r.value as number, se: r.se })),
    def.lowerIsBetter,
  ).map((r) => ({ ...byId.get(r.id)!, rank: r.rank, tied: r.tied }));
  const rest = base
    .filter((r) => r.value == null)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({ ...r, rank: null, tied: false }));
  return [...ranked, ...rest];
}

/** "1", or "T3" for a player tied with a neighbor; empty for a player with no rank. */
export function rankLabel(row: Pick<TeamRankRow, 'rank' | 'tied'>): string {
  if (row.rank == null) return '';
  return row.tied ? `T${row.rank}` : String(row.rank);
}

/** The team's figure for the metric: the window's own mean over the team's rounds, as the page's headline and leg cards read it. */
export function teamMeanFor(metric: TeamRankMetric, team: { sgMean: number | null; scoreMean: number | null }, legTotals: Array<number | null>): number | null {
  const def = metricDef(metric);
  if (def.value === 'score') return team.scoreMean;
  if (def.leg == null) return team.sgMean;
  return legTotals[def.leg] ?? null;
}

export function formatRankValue(metric: TeamRankMetric, v: number): string {
  return metric === 'score' ? v.toFixed(1) : formatSigned(v);
}

/** Tidy ticks inside [lo, hi]: the smallest of 0.1, 0.2, 0.5, 1, 2, 5, 10 that gives at most `want + 1` of them. */
export function rankTicks(lo: number, hi: number, want: number): number[] {
  const span = Math.max(hi - lo, 1e-6);
  const step = [0.1, 0.2, 0.5, 1, 2, 5, 10].find((s) => span / s <= want + 1) ?? 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(2)) || 0);
  return out;
}

export interface RankScale {
  lo: number;
  hi: number;
  ticks: number[];
  /** Where a value sits across the track, 0 to 100, better to the right (a lower scoring average further right). */
  at: (v: number) => number;
}

/**
 * The track's scale: every dot with its whisker, the team's mean and, for strokes gained, zero, padded a little and with tidy
 * ticks inside it. Scores run the other way, so better is to the right for every figure.
 */
export function rankScale(rows: TeamRankRow[], mean: number | null, metric: TeamRankMetric, want = 4): RankScale {
  const def = metricDef(metric);
  const xs: number[] = [];
  for (const r of rows) {
    if (r.value == null) continue;
    xs.push(r.value);
    if (r.se != null) xs.push(r.value - r.se, r.value + r.se);
  }
  if (mean != null) xs.push(mean);
  if (!def.lowerIsBetter) xs.push(0);
  let lo = xs.length ? Math.min(...xs) : def.lowerIsBetter ? 70 : -1;
  let hi = xs.length ? Math.max(...xs) : def.lowerIsBetter ? 76 : 1;
  const span = Math.max(hi - lo, def.lowerIsBetter ? 2 : 1);
  const mid = (lo + hi) / 2;
  lo = Math.min(lo, mid - span / 2) - span * 0.06;
  hi = Math.max(hi, mid + span / 2) + span * 0.06;
  const ticks = rankTicks(lo, hi, want);
  const at = (v: number) => {
    const t = (v - lo) / (hi - lo);
    return Math.max(0, Math.min(100, (def.lowerIsBetter ? 1 - t : t) * 100));
  };
  return { lo, hi, ticks, at };
}

const ROUNDS = (n: number) => `${Math.round(n)} ${Math.round(n) === 1 ? 'round' : 'rounds'}`;

/**
 * What a pinned or hovered player says in the line above the plot: "Theo Marchetti · +1.7 a round · T1 of 6 · 10 rounds ·
 * likely range +0.5 to +2.9 · team +0.2". A player under the floor says what they need.
 */
export function rankReadout(row: TeamRankRow, metric: TeamRankMetric, of: number, mean: number | null): string {
  if (row.value == null) return `${row.name} · ${row.tag ?? 'No figure yet'}`;
  const fmt = (v: number) => formatRankValue(metric, v);
  const parts = [row.name, `${fmt(row.value)} a round`];
  if (row.rank != null) parts.push(`${rankLabel(row)} of ${of}`);
  parts.push(row.state === 'early' && row.tag ? row.tag : ROUNDS(row.n));
  if (row.se != null) {
    // Numeric order for every figure: the scoring plot is drawn reversed, but the spoken range is not.
    parts.push(`likely range ${fmt(row.value - row.se)} to ${fmt(row.value + row.se)}`);
  }
  if (mean != null) parts.push(`team ${fmt(mean)}`);
  return parts.join(' · ');
}

/** The plot in a sentence for a screen reader: each ranked player's place and figure, then who has too few rounds. */
export function rankSummary(rows: TeamRankRow[], metric: TeamRankMetric, mean: number | null): string {
  const def = metricDef(metric);
  const ranked = rows.filter((r) => r.value != null);
  const none = rows.filter((r) => r.value == null);
  const list = ranked.map((r) => `${rankLabel(r)} ${r.name} ${formatRankValue(metric, r.value!)}${r.state === 'early' ? ', early read' : ''}`).join('; ');
  const parts = [`Players ranked by ${def.noun}${def.lowerIsBetter ? ', lower is better' : ''}: ${list || 'none yet'}.`];
  if (mean != null) parts.push(`Team ${formatRankValue(metric, mean)}.`);
  if (none.length) parts.push(`${none.map((r) => r.name).join(', ')}: ${none[0]!.tag?.toLowerCase() ?? 'no figure yet'}.`);
  return parts.join(' ');
}
