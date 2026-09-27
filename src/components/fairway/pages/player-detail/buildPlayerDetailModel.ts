/**
 * Player detail view model: pure, no Supabase, no React.
 *
 * The one place the coach player page decides which rounds count and what
 * every number on the screen says. Rules:
 *
 *   - Countable rounds only (src/lib/golf/round-countable.ts). The per-round
 *     SG: Total from golf_round_stats_cache is merged in BEFORE the filter, so
 *     the strip, the masthead and every ledger window agree on one list.
 *   - The strip and the scoring windows are 18-hole rounds. 9-hole rounds are
 *     counted and reported, never doubled.
 *   - A season is a calendar year (matches src/lib/golf/stats-date-range.ts).
 *   - A failed read is `unavailable`, never `empty`.
 */

import { formatToPar as formatToParShared } from '@/lib/golf/format-to-par';
import { roundExclusionReason } from '@/lib/golf/round-countable';
import {
  aggregateCountableRounds,
  type CountableRoundRow,
  type RoundStatsCacheRow,
} from '@/lib/golf/countable-round-stats';
import { deriveRoundTotal, deriveScoreToPar } from '@/lib/golf/round-total';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { normalizeForRadar } from '@/lib/coachhelm/v3/genome/normalize';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';
import type {
  LedgerStat,
  PlanItem,
  PlayerDetailModel,
  RoundPoint,
  ScopeKey,
  ScopeView,
  ScoutingPreview,
  SectionState,
  StrandPreview,
  WaterfallPreview,
} from './types';

/* ------------------------------------------------------------------------ */
/* Inputs                                                                     */
/* ------------------------------------------------------------------------ */

export type Settled<T> = { ok: true; value: T } | { ok: false };

export interface RawRound extends CountableRoundRow {
  course_name: string | null;
  score_to_par: number | null;
  round_type: string | null;
}

export interface RawInsight {
  id: string;
  title: string;
  priority: string | null;
  created_at: string | null;
}

export interface RawFocusArea {
  id: string;
  title: string;
  status: string | null;
  baseline_value: number | null;
  current_value: number | null;
  target_value: number | null;
}

export interface RawGoal {
  id: string;
  title: string;
  state: string;
  baseline_value: number | null;
  current_value: number | null;
  target_value: number | null;
  ends_at: string | null;
}

export interface PlayerDetailInputs {
  firstName: string;
  /** UTC calendar year of "now", computed by the caller. */
  seasonYear: number;
  /** Completed rounds, newest first. */
  rounds: Settled<RawRound[]>;
  roundStats: Settled<RoundStatsCacheRow[]>;
  genome: Settled<{ vector: GenomeVector; rounds_basis: number } | null>;
  insights: Settled<RawInsight[]>;
  focusAreas: Settled<RawFocusArea[]>;
  goals: Settled<RawGoal[]>;
}

/* ------------------------------------------------------------------------ */
/* Formatting (pure, zone-free)                                               */
/* ------------------------------------------------------------------------ */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-08-02" → "Aug 2". Split, never parsed, so no zone can move the day. */
export function formatDayLabel(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  const month = MONTHS[Number(m) - 1];
  return month && d ? `${month} ${Number(d)}` : iso;
}

const MINUS = '−';

export function formatSigned(n: number, digits = 1): string {
  const r = Number(n.toFixed(digits));
  if (r === 0) return (0).toFixed(digits);
  return r > 0 ? `+${r.toFixed(digits)}` : `${MINUS}${Math.abs(r).toFixed(digits)}`;
}

/** Score to par: "E", "+2", "−3" (the shared formatter, whole strokes). */
export function formatRoundToPar(n: number): string {
  return formatToParShared(Math.round(n));
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function formatPlanValue(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* ------------------------------------------------------------------------ */
/* Rounds                                                                     */
/* ------------------------------------------------------------------------ */

const THIN_ROUNDS = 3;

function toPoint(row: RawRound, stats: RoundStatsCacheRow | undefined): RoundPoint | null {
  const total = deriveRoundTotal(row).total;
  if (total == null) return null;
  const pair = (hit: number | null | undefined, of: number | null | undefined) =>
    of != null && of > 0 ? { hit: hit ?? 0, total: of } : null;
  return {
    id: row.id,
    date: row.round_date.slice(0, 10),
    dateLabel: formatDayLabel(row.round_date),
    course: row.course_name?.trim() || 'Unnamed course',
    holes: row.holes_played ?? 18,
    score: total,
    toPar: deriveScoreToPar(row),
    roundType: row.round_type,
    putts: stats?.total_putts ?? row.total_putts ?? null,
    fairways: pair(stats?.fairways_hit, stats?.fairways_total),
    greens: pair(stats?.greens_hit, stats?.greens_total),
    scrambles:
      stats?.scramble_attempts != null && stats.scramble_attempts > 0
        ? { made: stats.scrambles_converted ?? 0, attempts: stats.scramble_attempts }
        : null,
    sg: stats
      ? {
          total: stats.strokes_gained_total,
          tee: stats.strokes_gained_tee,
          approach: stats.strokes_gained_approach,
          aroundGreen: stats.strokes_gained_around_green,
          putting: stats.strokes_gained_putting,
        }
      : null,
  };
}

function buildLedger(
  rows: RawRound[],
  statsById: ReadonlyMap<string, RoundStatsCacheRow>,
  points: RoundPoint[],
  statsAvailable: boolean,
): LedgerStat[] {
  const agg = aggregateCountableRounds(rows, statsById);
  const n = agg.scoringAverageRounds;
  const toPars = points.map((p) => p.toPar).filter((v): v is number => v != null);
  const avgToPar = toPars.length > 0 ? toPars.reduce((a, b) => a + b, 0) / toPars.length : null;

  let fwHit = 0, fwTotal = 0, gHit = 0, gTotal = 0, scMade = 0, scAtt = 0, puttRounds = 0, fwRounds = 0, gRounds = 0;
  for (const p of points) {
    if (p.fairways) { fwHit += p.fairways.hit; fwTotal += p.fairways.total; fwRounds++; }
    if (p.greens) { gHit += p.greens.hit; gTotal += p.greens.total; gRounds++; }
    if (p.scrambles) { scMade += p.scrambles.made; scAtt += p.scrambles.attempts; }
    if (p.putts != null && p.putts > 0) puttRounds++;
  }

  const unavailable = statsAvailable ? null : "Couldn't load";
  const pct = (v: number | null) => (v == null ? null : `${Math.round(v)}%`);

  const sgRounds = agg.sg.rounds;
  return [
    {
      key: 'scoring',
      label: 'Scoring average',
      value: agg.scoringAverage == null ? null : agg.scoringAverage.toFixed(1),
      aside: avgToPar == null ? null : `${formatSigned(avgToPar)} to par`,
      tone: 'neutral',
      sample: n === 0 ? 'No 18-hole rounds' : plural(n, 'round'),
      thin: n > 0 && n < THIN_ROUNDS,
    },
    {
      key: 'sg',
      label: 'Strokes gained',
      value: agg.sg.total == null ? null : formatSigned(agg.sg.total),
      aside: agg.sg.total == null ? null : 'per round',
      tone: agg.sg.total == null || Math.abs(agg.sg.total) < 0.05 ? 'neutral' : agg.sg.total > 0 ? 'good' : 'bad',
      sample: unavailable ?? (sgRounds === 0 ? 'Not tracked in these rounds' : plural(sgRounds, 'round')),
      thin: sgRounds > 0 && sgRounds < THIN_ROUNDS,
    },
    {
      key: 'fir',
      label: 'Fairways',
      value: pct(agg.fairwayPct),
      aside: null,
      tone: 'neutral',
      sample: unavailable ?? (fwTotal === 0 ? 'Not tracked' : `${fwHit} of ${fwTotal} fairways`),
      thin: fwRounds > 0 && fwRounds < THIN_ROUNDS,
    },
    {
      key: 'gir',
      label: 'Greens in regulation',
      value: pct(agg.girPct),
      aside: null,
      tone: 'neutral',
      sample: unavailable ?? (gTotal === 0 ? 'Not tracked' : `${gHit} of ${gTotal} greens`),
      thin: gRounds > 0 && gRounds < THIN_ROUNDS,
    },
    {
      key: 'scrambling',
      label: 'Scrambling',
      value: pct(agg.scramblingPct),
      aside: null,
      tone: 'neutral',
      sample: unavailable ?? (scAtt === 0 ? 'No chances recorded' : `${scMade} of ${scAtt} chances`),
      thin: scAtt > 0 && scAtt < 10,
    },
    {
      key: 'putts',
      label: 'Putts per round',
      value: agg.puttsPer18 == null ? null : agg.puttsPer18.toFixed(1),
      aside: null,
      tone: 'neutral',
      sample: puttRounds === 0 ? 'Not tracked' : `per 18 · ${plural(puttRounds, 'round')}`,
      thin: puttRounds > 0 && puttRounds < THIN_ROUNDS,
    },
  ];
}

function buildVerdict(first: string, eighteens: RoundPoint[], countedAny: number): string | null {
  const n = eighteens.length;
  if (n === 0) {
    return countedAny > 0 ? `${first} has only 9-hole rounds on file so far.` : null;
  }
  const avg = (xs: RoundPoint[]) => xs.reduce((a, p) => a + p.score, 0) / xs.length;
  if (n >= 10) {
    const last5 = avg(eighteens.slice(0, 5));
    const prior5 = avg(eighteens.slice(5, 10));
    const d = last5 - prior5;
    if (Math.abs(d) < 0.5) {
      return `${first} is holding steady at ${last5.toFixed(1)} over the last 5 rounds, level with the 5 before.`;
    }
    return `${first} is averaging ${last5.toFixed(1)} over the last 5 rounds, ${Math.abs(d).toFixed(1)} strokes ${d < 0 ? 'better' : 'worse'} than the 5 before.`;
  }
  const best = bestOf(eighteens)!;
  if (n === 1) return `${first} has one counted round: ${best.score} at ${best.course}.`;
  return `${first} is averaging ${avg(eighteens).toFixed(1)} across ${n} rounds; best is ${best.score} at ${best.course}.`;
}

/** Lowest score; the most recent wins a tie. Input newest first. */
export function bestOf(points: RoundPoint[]): RoundPoint | null {
  let best: RoundPoint | null = null;
  for (const p of points) if (!best || p.score < best.score) best = p;
  return best;
}

/** Trailing mean over `window` rounds, oldest→newest order in and out. */
export function rollingMean(values: number[], window: number): Array<number | null> {
  return values.map((_, i) => {
    if (i + 1 < window) return null;
    const slice = values.slice(i + 1 - window, i + 1);
    return slice.reduce((a, b) => a + b, 0) / window;
  });
}

/* ------------------------------------------------------------------------ */
/* Previews                                                                   */
/* ------------------------------------------------------------------------ */

function buildWaterfall(
  rows: RawRound[],
  statsById: ReadonlyMap<string, RoundStatsCacheRow>,
  statsOk: boolean,
): WaterfallPreview {
  const steps: WaterfallPreview['steps'] = [
    { key: 'tee', label: 'Off the tee', value: null },
    { key: 'approach', label: 'Approach', value: null },
    { key: 'aroundGreen', label: 'Around the green', value: null },
    { key: 'putting', label: 'Putting', value: null },
  ];
  if (!statsOk) return { state: 'unavailable', steps, total: null, rounds: 0 };
  const sg = aggregateCountableRounds(rows, statsById).sg;
  if (sg.rounds === 0) return { state: 'empty', steps, total: null, rounds: 0 };
  steps[0]!.value = sg.offTee;
  steps[1]!.value = sg.approach;
  steps[2]!.value = sg.aroundGreen;
  steps[3]!.value = sg.putting;
  return { state: 'ready', steps, total: sg.total, rounds: sg.rounds };
}

function buildStrand(genome: PlayerDetailInputs['genome']): StrandPreview {
  const dims = GENOME_DIMENSIONS.map((d) => ({ id: d.id, label: d.label, norm: null as number | null }));
  if (!genome.ok) return { state: 'unavailable', dims, live: 0, roundsBasis: 0 };
  if (!genome.value) return { state: 'empty', dims, live: 0, roundsBasis: 0 };
  const { vector, rounds_basis } = genome.value;
  for (const d of dims) {
    const r = vector[d.id];
    const norm = r ? normalizeForRadar(d.id, r) : null;
    d.norm = norm != null && Number.isFinite(norm) ? Math.max(0, Math.min(1, norm)) : null;
  }
  const live = dims.filter((d) => d.norm != null).length;
  return { state: live > 0 ? 'ready' : 'empty', dims, live, roundsBasis: rounds_basis };
}

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function buildScouting(insights: PlayerDetailInputs['insights']): ScoutingPreview {
  if (!insights.ok) return { state: 'unavailable', headline: null, openReads: 0 };
  const rows = insights.value.filter((i) => i.title?.trim());
  if (rows.length === 0) return { state: 'empty', headline: null, openReads: 0 };
  const top = [...rows].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority ?? ''] ?? 9;
    const pb = PRIORITY_RANK[b.priority ?? ''] ?? 9;
    if (pa !== pb) return pa - pb;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  })[0]!;
  return { state: 'ready', headline: top.title.trim(), openReads: rows.length };
}

function progressOf(baseline: number | null, current: number | null, target: number | null): number | null {
  if (baseline == null || current == null || target == null || target === baseline) return null;
  const p = (current - baseline) / (target - baseline);
  return Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : null;
}

function planDetail(current: number | null, target: number | null, suffix: string | null): string | null {
  const parts: string[] = [];
  if (current != null) parts.push(`Now ${formatPlanValue(current)}`);
  if (target != null) parts.push(`target ${formatPlanValue(target)}`);
  if (suffix) parts.push(suffix);
  if (parts.length === 0) return null;
  const s = parts.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildPlan(inputs: PlayerDetailInputs): { state: SectionState; items: PlanItem[] } {
  if (!inputs.focusAreas.ok && !inputs.goals.ok) return { state: 'unavailable', items: [] };
  const items: PlanItem[] = [];
  if (inputs.focusAreas.ok) {
    for (const f of inputs.focusAreas.value) {
      if (f.status !== 'active') continue;
      items.push({
        id: f.id,
        kind: 'focus',
        title: f.title,
        progress: progressOf(f.baseline_value, f.current_value, f.target_value),
        detail: planDetail(f.current_value, f.target_value, null),
      });
    }
  }
  if (inputs.goals.ok) {
    for (const g of inputs.goals.value) {
      if (g.state !== 'active') continue;
      items.push({
        id: g.id,
        kind: 'goal',
        title: g.title,
        progress: progressOf(g.baseline_value, g.current_value, g.target_value),
        detail: planDetail(g.current_value, g.target_value, g.ends_at ? `ends ${formatDayLabel(g.ends_at)}` : null),
      });
    }
  }
  const partial = !inputs.focusAreas.ok || !inputs.goals.ok;
  if (items.length === 0) return { state: partial ? 'unavailable' : 'empty', items };
  return { state: 'ready', items };
}

/* ------------------------------------------------------------------------ */
/* Entry point                                                                */
/* ------------------------------------------------------------------------ */

const SCOPE_LABELS: Record<ScopeKey, string> = { last5: 'Last 5', last10: 'Last 10', season: 'Season' };

export function buildPlayerDetailModel(inputs: PlayerDetailInputs): PlayerDetailModel {
  const statsOk = inputs.roundStats.ok;
  const statsById = new Map<string, RoundStatsCacheRow>(
    inputs.roundStats.ok ? inputs.roundStats.value.map((s) => [s.round_id, s]) : [],
  );

  const common = {
    strand: buildStrand(inputs.genome),
    scouting: buildScouting(inputs.insights),
    ...(() => {
      const p = buildPlan(inputs);
      return { planState: p.state, plan: p.items };
    })(),
  };

  if (!inputs.rounds.ok) {
    return {
      roundsState: 'unavailable',
      completedRounds: 0,
      excludedRounds: 0,
      statusLine: null,
      statusNote: null,
      verdict: null,
      scopes: [],
      defaultScope: 'last10',
      allRounds: [],
      bestRoundId: null,
      waterfall: buildWaterfall([], statsById, false),
      ...common,
    };
  }

  const all = inputs.rounds.value;
  // Merge the per-round SG before the countable filter, so an SG-implausible
  // round is excluded here exactly as it is in aggregateCountableRounds.
  const merged: RawRound[] = all.map((r) => ({
    ...r,
    strokes_gained_total: r.strokes_gained_total ?? statsById.get(r.id)?.strokes_gained_total ?? null,
  }));
  const counted: RawRound[] = [];
  const excludedDates: string[] = [];
  for (const r of merged) {
    const reason = roundExclusionReason(r);
    if (reason === null) counted.push(r);
    else if (reason !== 'not_completed') excludedDates.push(r.round_date.slice(0, 10));
  }

  const pointById = new Map<string, RoundPoint>();
  const allPoints: RoundPoint[] = [];
  for (const r of counted) {
    const p = toPoint(r, statsById.get(r.id));
    if (p) {
      pointById.set(r.id, p);
      allPoints.push(p);
    }
  }
  const countedRows = counted.filter((r) => pointById.has(r.id));
  const rows18 = countedRows.filter((r) => (r.holes_played ?? 18) === 18);
  const points18 = rows18.map((r) => pointById.get(r.id)!);

  const latest = allPoints[0] ?? null;
  let statusLine: string | null = null;
  let statusNote: string | null = null;
  if (latest) {
    const par = latest.toPar == null ? '' : ` (${formatRoundToPar(latest.toPar)})`;
    statusLine = `Last round ${latest.dateLabel} · ${latest.score}${par}${latest.holes === 9 ? ' · 9 holes' : ''}`;
    const newerExcluded = excludedDates.filter((d) => d > latest.date).length;
    if (newerExcluded > 0) statusNote = `${plural(newerExcluded, 'later round')} not counted`;
  } else if (excludedDates.length > 0) {
    statusNote = `${plural(excludedDates.length, 'round')} on file, none countable yet`;
  }

  const nineRows = countedRows.filter((r) => (r.holes_played ?? 18) === 9);
  const scopeFor = (key: ScopeKey): ScopeView => {
    let slice: RawRound[];
    let windowLabel: string;
    if (key === 'season') {
      const y = String(inputs.seasonYear);
      slice = rows18.filter((r) => r.round_date.startsWith(y));
      windowLabel = `${inputs.seasonYear} season`;
    } else {
      const n = key === 'last5' ? 5 : 10;
      slice = rows18.slice(0, n);
      windowLabel = `Last ${plural(slice.length, 'round')}`;
    }
    const oldest = slice[slice.length - 1]?.round_date.slice(0, 10);
    const nine =
      key === 'season'
        ? nineRows.filter((r) => r.round_date.startsWith(String(inputs.seasonYear))).length
        : oldest
          ? nineRows.filter((r) => r.round_date.slice(0, 10) >= oldest).length
          : 0;
    const points = slice.map((r) => pointById.get(r.id)!);
    return {
      key,
      label: SCOPE_LABELS[key],
      windowLabel,
      rounds: points,
      nineHoleRounds: nine,
      ledger: buildLedger(slice, statsById, points, statsOk),
    };
  };

  const scopes = (['last5', 'last10', 'season'] as const).map(scopeFor);
  const defaultScope: ScopeKey = points18.length > 5 ? 'last10' : 'last5';

  return {
    roundsState: all.length === 0 ? 'empty' : 'ready',
    completedRounds: all.length,
    excludedRounds: excludedDates.length,
    statusLine,
    statusNote,
    verdict: buildVerdict(inputs.firstName, points18, allPoints.length),
    scopes,
    defaultScope,
    allRounds: allPoints,
    bestRoundId: bestOf(points18)?.id ?? null,
    waterfall: buildWaterfall(countedRows, statsById, statsOk),
    ...common,
  };
}
