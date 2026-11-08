import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { TEAM_MARKER_MIN_N } from '@/components/golf/coachhelm/v3/StandingBar/types';
import { METRIC_IDS as STANDING_METRIC_IDS } from '@/lib/coachhelm/v3/metrics/registry';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { isStandingTourComparable } from '@/lib/coachhelm/v3/standing/tour-basis';
import { logServerError } from '@/lib/server-error-logger';
import { ALL_METRIC_SPECS } from './metrics-catalog';
import { requireRosterPlayer, type CoachChatContext } from './context';
import { nowIso, unavailableEnvelope, type BenchmarkRef, type Comparison, type Measurement, type MeasurementSeries, type ToolEnvelope } from './provenance';

type Sb = SupabaseClient<Database>;

/**
 * Benchmarks, metric definitions and where a player stands: `get_benchmarks` and `get_metric_definitions` (coach and player), plus
 * `applyComparisons`, which puts the three references on the measurements other reads return.
 *
 * A figure is always read against three things, in this order (owner, 2026-11-08): the player's LEVEL (the published Division I, II or III
 * average, or the college players of the same gender on Helm), the TEAM average, and the TOUR (PGA or LPGA by the team's gender). Each comes
 * with where the player sits among them when a standing exists. A missing one is listed with the reason, never dropped, and a team-level
 * figure carries the level and the Tour only (the team average is the figure itself). A player sees the team average and their own place in
 * the team, never a teammate.
 *
 * The values are `golf_pga_standards` (Tour, Korn Ferry, college and high-school averages, Tour percentiles, each with its source)
 * and `golf_player_standing` (the player's value, the team average and the level cohort). Both are read through the caller's own
 * session: `golf_pga_standards` and `golf_metrics` are readable by any signed-in user, `golf_player_standing` by the player and by
 * their team's coaches. Every figure sits in `detail` (or `measurements`), because the audit accepts nothing outside an envelope.
 */

export const BENCHMARK_LEVELS = ['pga', 'korn_ferry', 'd1', 'd2', 'd3', 'hs'] as const;
export type BenchmarkLevel = (typeof BENCHMARK_LEVELS)[number];
export type Tour = 'pga' | 'lpga';

/** Ask's own metric ids (`metrics-catalog.ts`) that the standards table names differently. */
const CHAT_TO_STANDING: Record<string, string> = {
  sg_tee: 'sg_ott',
  sand_save_pct: 'scrambling_pct_sand',
  penalties_per_round: 'penalty_rate_per_round',
};
/** Ask's ids that equal a standards id are mapped by identity; these are the ones with no standards row at all. */
export const STANDING_ID_BY_CHAT_ID = (id: string): string | null => {
  const base = id.replace(/_(?:mean|avg|average)$/, '');
  const mapped = CHAT_TO_STANDING[base] ?? base;
  return (STANDING_METRIC_IDS as readonly string[]).includes(mapped) ? mapped : null;
};

/** What the model may ask for: every standards metric, plus the two Ask names that differ (`sg_tee`, `sand_save_pct`, `penalties_per_round`). */
export const BENCHMARK_METRIC_IDS = [...STANDING_METRIC_IDS, 'sg_tee', 'sand_save_pct', 'penalties_per_round'] as unknown as [string, ...string[]];

const LEVEL_LABEL: Record<Exclude<BenchmarkLevel, 'pga'>, string> = {
  korn_ferry: 'Korn Ferry Tour',
  d1: 'Division I average',
  d2: 'Division II average',
  d3: 'Division III average',
  hs: 'High school average',
};
const tourLabel = (tour: Tour): string => (tour === 'lpga' ? 'LPGA Tour' : 'PGA Tour');

export function tourForGender(gender: string | null | undefined): Tour {
  return gender === 'womens' || gender === 'women' || gender === 'female' ? 'lpga' : 'pga';
}

interface StandardRow {
  metric_id: string;
  season: string;
  display_label: string;
  pga_tour_value: number | null;
  korn_ferry_value: number | null;
  div1_avg_value: number | null;
  div2_avg_value: number | null;
  div3_avg_value: number | null;
  hs_avg_value: number | null;
  pga_p25: number | null;
  pga_p50: number | null;
  pga_p75: number | null;
  source: string | null;
}
const STANDARD_COLUMNS = 'metric_id, season, display_label, pga_tour_value, korn_ferry_value, div1_avg_value, div2_avg_value, div3_avg_value, hs_avg_value, pga_p25, pga_p50, pga_p75, source';

/** The college level a team plays at, from the division on its newest season row. */
export type TeamLevel = 'd1' | 'd2' | 'd3';
/** "d1", "D1", "Division I", "div 2", "III": the level, or null for a division with no published average (NAIA, junior college, unset). */
export function levelFromDivision(division: string | null | undefined): TeamLevel | null {
  const t = (division ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(division|div|d)/, '');
  return t === '1' || t === 'i' ? 'd1' : t === '2' || t === 'ii' ? 'd2' : t === '3' || t === 'iii' ? 'd3' : null;
}
const LEVEL_COLUMN: Record<TeamLevel, 'div1_avg_value' | 'div2_avg_value' | 'div3_avg_value'> = { d1: 'div1_avg_value', d2: 'div2_avg_value', d3: 'div3_avg_value' };

/** A `golf_player_standing` row, as the comparisons need it. */
export interface StandingLite {
  player_id: string;
  metric_id: string;
  player_value: number;
  level_avg: number | null;
  level_n: number;
  level_pct: number | null;
  team_avg: number | null;
  team_n: number;
  team_pct: number | null;
  basis: string | null;
}
const STANDING_COLUMNS = 'player_id, metric_id, player_value, level_avg, level_n, level_pct, team_avg, team_n, team_pct, basis';

export interface BenchmarkSource {
  /** These players' standing on these metrics (standards ids), keyed `player_id|metric_id`; empty when none or unreadable. Row-level security decides whose rows come back. */
  standing(playerIds: readonly string[], metricIds: readonly string[]): Promise<Map<string, StandingLite>>;
  /** The team's level, or null when no division is on record or it could not be read. Nothing is compared with a level the team is not known to play at. */
  level(): Promise<TeamLevel | null>;
  /** The team's tour, or null when its gender could not be read (no benchmark is claimed then: a women's team is never graded on the men's). */
  tour(): Promise<Tour | null>;
  /** The newest season's row per metric for that tour; null when the read failed. */
  standards(): Promise<Map<string, StandardRow> | null>;
}

/** One team's tour and standards, each read at most once per turn. `teamId` comes from the session's context, never from the model. */
export function benchmarkSource(sb: Sb, teamId: string): BenchmarkSource {
  let tourRead: Promise<Tour | null> | undefined;
  let standardsRead: Promise<Map<string, StandardRow> | null> | undefined;
  let levelRead: Promise<TeamLevel | null> | undefined;
  const level = () =>
    (levelRead ??= (async () => {
      const { data, error } = await sb.from('golf_team_seasons').select('division').eq('team_id', teamId).order('season', { ascending: false }).limit(1).maybeSingle();
      return error || !data ? null : levelFromDivision(data.division);
    })());
  const tour = () =>
    (tourRead ??= (async () => {
      const { data, error } = await sb.from('golf_teams').select('gender').eq('id', teamId).maybeSingle();
      if (error || !data) return null;
      return tourForGender(data.gender);
    })());
  const standards = () =>
    (standardsRead ??= (async () => {
      const t = await tour();
      if (!t) return null;
      const { data, error } = await sb.from('golf_pga_standards').select(STANDARD_COLUMNS).eq('tour', t).order('season', { ascending: false });
      if (error) return null;
      const map = new Map<string, StandardRow>();
      // Newest season first: the first row per metric wins.
      for (const row of (data ?? []) as unknown as StandardRow[]) if (!map.has(row.metric_id)) map.set(row.metric_id, row);
      return map;
    })());
  const standing = async (playerIds: readonly string[], metricIds: readonly string[]) => {
    const out = new Map<string, StandingLite>();
    for (const chunk of chunkIds([...new Set(playerIds)])) {
      const { data, error } = await sb.from('golf_player_standing').select(STANDING_COLUMNS).in('player_id', chunk).in('metric_id', [...new Set(metricIds)]);
      if (error) return new Map<string, StandingLite>();
      for (const r of (data ?? []) as unknown as StandingLite[]) out.set(`${r.player_id}|${r.metric_id}`, r);
    }
    return out;
  };
  return { level, tour, standards, standing };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The three references for one figure, level first, team second, Tour third. `standing` is the player's row when one exists; without it the
 * level is the published division average (or missing), the team average is missing, and the Tour is withheld where it is not measured
 * the way the player's figure is. `teamFigure`: the figure is the team's own, so it carries the level and the Tour only.
 */
export function comparisonsFor(a: { metricId: string; std: StandardRow | undefined; tour: Tour; teamLevel: TeamLevel | null; standing: StandingLite | null; teamFigure: boolean }): Comparison[] {
  const { std, tour, teamLevel, standing } = a;
  const out: Comparison[] = [];

  // 1. The level. The published average for the team's division, else the college players of the same gender on Helm; the place is among the latter.
  const published = teamLevel && std ? std[LEVEL_COLUMN[teamLevel]] : null;
  const cohortLabel = tour === 'lpga' ? 'Women’s college players on Helm' : 'College players on Helm';
  const cohort = standing && standing.level_avg != null && standing.level_n > 0 ? standing : null;
  const place = cohort && cohort.level_pct != null ? { place_percent: Math.round(cohort.level_pct), place_of: cohort.level_n } : { place_percent: null, place_of: null };
  if (typeof published === 'number') out.push({ kind: 'level', label: LEVEL_LABEL[teamLevel as TeamLevel], value: published, ...place, note: place.place_percent === null ? null : `Place is among ${cohortLabel.toLowerCase()}.` });
  else if (cohort) out.push({ kind: 'level', label: cohortLabel, value: round2(cohort.level_avg as number), ...place, note: null });
  else out.push({ kind: 'level', label: 'Level average', value: null, place_percent: null, place_of: null, note: teamLevel ? 'No average is published for this metric at the team’s level, and no players at the level have this stat yet.' : 'The team’s division is not on record and no players at the level have this stat yet, so there is no level average.' });

  // 2. The team average and the place in the team, from five teammates.
  if (!a.teamFigure) {
    if (standing && standing.team_avg != null && standing.team_n >= TEAM_MARKER_MIN_N) out.push({ kind: 'team', label: 'Team average', value: round2(standing.team_avg), place_percent: standing.team_pct == null ? null : Math.round(standing.team_pct), place_of: standing.team_n, note: null });
    else out.push({ kind: 'team', label: 'Team average', value: null, place_percent: null, place_of: null, note: standing ? `Fewer than ${TEAM_MARKER_MIN_N} teammates have this stat, so there is no team average.` : 'There is no team average for this metric yet.' });
  }

  // 3. The Tour, where it is measured the way the player's figure is.
  const tourValue = std?.pga_tour_value;
  if (typeof tourValue !== 'number') out.push({ kind: 'tour', label: tourLabel(tour), value: null, place_percent: null, place_of: null, note: `The ${tourLabel(tour)} publishes no value for this metric.` });
  else if (!isStandingTourComparable(a.metricId, (standing?.basis ?? null) as 'on_green' | 'all_shot' | null)) out.push({ kind: 'tour', label: tourLabel(tour), value: null, place_percent: null, place_of: null, note: `The ${tourLabel(tour)} value is not measured the way this figure is, so it is not compared.` });
  else out.push({ kind: 'tour', label: tourLabel(tour), value: tourValue, place_percent: null, place_of: null, note: null });
  return out;
}

/** What a chip grades against: the level where there is a value, else the Tour. */
function gradeAgainst(comparisons: readonly Comparison[], season: string): BenchmarkRef | null {
  const c = comparisons.find((x) => x.kind === 'level' && x.value !== null) ?? comparisons.find((x) => x.kind === 'tour' && x.value !== null);
  return c && c.value !== null ? { source: c.label.endsWith('Helm') ? c.label : `${c.label} ${season}`, version: season, value: c.value, omitted_for_cohort: false } : null;
}

/**
 * Put the three references on the measurements a read returned, and `benchmark` (the level, else the Tour) for a chip or a trend line to grade
 * against. Series carry `benchmark` only. A metric the standards do not cover is left alone; a failed read of the team's level, tour or
 * standards leaves the envelope as it was.
 */
export async function applyComparisons(envelope: ToolEnvelope, source: BenchmarkSource): Promise<ToolEnvelope> {
  try {
    if (envelope.coverage === 'unavailable' || (envelope.measurements.length === 0 && envelope.series.length === 0)) return envelope;
    const mapped = (x: Measurement | MeasurementSeries) => x.entity.kind !== 'round' && STANDING_ID_BY_CHAT_ID(x.metric_id);
    const candidates = [...envelope.measurements, ...envelope.series].filter(mapped);
    if (candidates.length === 0) return envelope;
    const [teamLevel, standards] = await Promise.all([source.level(), source.standards()]);
    const tour = standards ? await source.tour() : null;
    if (!tour || !standards) return envelope;
    const ids = [...new Set(candidates.flatMap((x) => (x.entity.kind === 'player' ? [STANDING_ID_BY_CHAT_ID(x.metric_id) as string] : [])))];
    const players = [...new Set(candidates.filter((x) => x.entity.kind === 'player').map((x) => x.entity.id))];
    const standing = players.length && ids.length ? await source.standing(players, ids) : new Map<string, StandingLite>();
    const comparisonsOf = (x: Measurement | MeasurementSeries) => {
      const id = STANDING_ID_BY_CHAT_ID(x.metric_id) as string;
      const std = standards.get(id);
      const row = x.entity.kind === 'player' ? (standing.get(`${x.entity.id}|${id}`) ?? null) : null;
      return { std, list: comparisonsFor({ metricId: id, std, tour, teamLevel, standing: row, teamFigure: x.entity.kind !== 'player' }) };
    };
    const measurements = envelope.measurements.map((m) => {
      if (!mapped(m)) return m;
      const { std, list } = comparisonsOf(m);
      return { ...m, comparisons: list, benchmark: m.benchmark ?? gradeAgainst(list, std?.season ?? '') };
    });
    const series = envelope.series.map((x) => {
      if (!mapped(x) || x.benchmark) return x;
      const { std, list } = comparisonsOf(x);
      return { ...x, benchmark: gradeAgainst(list, std?.season ?? '') };
    });
    return { ...envelope, measurements, series };
  } catch {
    return envelope;
  }
}

/**
 * The metric a benchmark's numbers are about, in the words the audit reads (`metric_scope`): a Tour GIR of 66 then supports "66% of greens" and
 * not "66" in a putting sentence. The audit tells metrics apart by name, so the two standards ids whose names it would read as another family
 * (the sand-save rate is a `scrambling_pct_` id; off the tee is `sg_ott`) carry Ask's own name for the same metric.
 */
const SCOPE_KEY: Record<string, string> = { scrambling_pct_sand: 'sand_save_pct', sg_ott: 'sg_tee' };
const scopeKey = (standingId: string): string => SCOPE_KEY[standingId] ?? standingId;

const levelValues = (s: StandardRow): Record<BenchmarkLevel, number | null> => ({ pga: s.pga_tour_value, korn_ferry: s.korn_ferry_value, d1: s.div1_avg_value, d2: s.div2_avg_value, d3: s.div3_avg_value, hs: s.hs_avg_value });

interface MetricMeta {
  label: string;
  unit: string;
  direction: 'higher_better' | 'lower_better';
}
/** Label, unit and direction of a standards metric, from `golf_metrics` (the table the standards are keyed to). */
async function readMetricMeta(sb: Sb, ids: string[]): Promise<Map<string, MetricMeta> | null> {
  const { data, error } = await sb.from('golf_metrics').select('metric_id, display_label, unit, direction').in('metric_id', ids);
  if (error) return null;
  return new Map((data ?? []).map((r) => [r.metric_id, { label: r.display_label, unit: r.unit, direction: r.direction as MetricMeta['direction'] }]));
}

interface StandingRow {
  metric_id: string;
  player_value: number;
  level_avg: number | null;
  level_n: number;
  level_pct: number | null;
  team_avg: number | null;
  team_n: number;
  team_pct: number | null;
  basis: string | null;
  computed_at: string;
}


export interface BenchmarkInput {
  metric_ids: string[];
  levels?: BenchmarkLevel[];
  /** Coach only: a roster player whose standing is read as well. A player's own read ignores it. */
  player_id?: string;
}

/**
 * `get_benchmarks`. `who` is the session's: a coach (any roster player may be named) or a player (only themself, and only the team average beside them).
 */
export async function getBenchmarks(sb: Sb, ctx: CoachChatContext, source: BenchmarkSource, input: BenchmarkInput, who: { role: 'coach' } | { role: 'player'; playerId: string }): Promise<ToolEnvelope> {
  const wanted = [...new Set(input.metric_ids.map((m) => STANDING_ID_BY_CHAT_ID(m)).filter((m): m is string => !!m))];
  if (wanted.length === 0) return { summary: 'None of those metrics has a benchmark.', measurements: [], series: [], detail: { benchmarks: [] }, coverage: 'empty', coverage_note: 'Benchmarks exist for strokes gained, putting by distance, approach proximity, scrambling, penalties, scoring by par, GIR and the pressure gaps.', as_of: nowIso() };
  const playerId = who.role === 'player' ? who.playerId : input.player_id ? requireRosterPlayer(ctx, input.player_id).id : null;

  const [tour, standards, meta, teamLevel] = await Promise.all([source.tour(), source.standards(), readMetricMeta(sb, wanted), source.level()]);
  // The team's own level and then the Tour by default; with no division on record, every college level is shown rather than a guess.
  const levels: BenchmarkLevel[] = input.levels?.length ? [...new Set(input.levels)] : teamLevel ? [teamLevel, 'pga'] : ['d1', 'd2', 'd3', 'pga'];
  if (!tour) return unavailableEnvelope('Could not tell which Tour applies to this team.', 'The team read failed, so no benchmark is claimed.');
  if (!standards) return unavailableEnvelope('Could not read the benchmarks.', 'The benchmarks query failed.');

  const benchmarks = wanted.flatMap((id) => {
    const std = standards.get(id);
    const m = meta?.get(id);
    if (!std) return [];
    const values = levelValues(std);
    const byLevel: Record<string, { label: string; value: number }> = {};
    for (const lv of levels) {
      const v = values[lv];
      if (typeof v === 'number') byLevel[lv] = { label: lv === 'pga' ? tourLabel(tour) : LEVEL_LABEL[lv], value: v };
    }
    return [
      {
        kind: 'benchmark' as const,
        metric_id: id,
        metric_scope: scopeKey(id),
        metric_label: m?.label ?? std.display_label,
        unit: m?.unit ?? null,
        direction: m?.direction ?? null,
        season: std.season,
        source_label: `${std.season} reference table`,
        source: std.source ?? `${tourLabel(tour)} ${std.season}`,
        levels: byLevel,
        ...(levels.includes('pga') && typeof std.pga_p25 === 'number' && typeof std.pga_p50 === 'number' && typeof std.pga_p75 === 'number' ? { tour_percentiles: { p25: std.pga_p25, p50: std.pga_p50, p75: std.pga_p75 } } : {}),
      },
    ];
  });
  const withoutValue = wanted.filter((id) => !benchmarks.some((b) => b.metric_id === id && Object.keys(b.levels).length > 0));

  let standing: Record<string, unknown> | null = null;
  let standingFailed = false;
  if (playerId) {
    const { data, error } = await sb
      .from('golf_player_standing')
      .select('metric_id, player_value, level_avg, level_n, level_pct, team_avg, team_n, team_pct, basis, computed_at')
      .eq('player_id', playerId)
      .in('metric_id', wanted);
    if (error) {
      standingFailed = true;
      void logServerError(`getBenchmarks standing failed: ${error.message}`, { action: 'coachhelm.ask.benchmarks', feature: 'coachhelm_chat', userId: ctx.coach_id || ctx.user_id, handled: true });
    } else {
      const name = who.role === 'player' ? 'You' : (ctx.roster.find((p) => p.id === playerId)?.name ?? 'The player');
      const rows = ((data ?? []) as unknown as StandingRow[]).map((r) => {
        const std = standards.get(r.metric_id);
        const comparisons = comparisonsFor({ metricId: r.metric_id, std, tour, teamLevel, standing: { ...r, player_id: playerId } as StandingLite, teamFigure: false });
        const gap = (kind: Comparison['kind']) => {
          const v = comparisons.find((c) => c.kind === kind)?.value;
          return typeof v === 'number' ? round2(r.player_value - v) : null;
        };
        return {
          metric_id: r.metric_id,
          metric_scope: scopeKey(r.metric_id),
          metric_label: meta?.get(r.metric_id)?.label ?? std?.display_label ?? r.metric_id,
          ...(meta?.get(r.metric_id) ? { direction: meta.get(r.metric_id)!.direction } : {}),
          player_value: round2(r.player_value),
          // Level, then team, then Tour; one with no value is still here, with the reason.
          comparisons: comparisons.map((c) => ({ ...c, kind: c.kind })),
          // How far the player is from each, signed (their value minus the reference), so the answer never subtracts the rounded figures itself.
          gaps: { vs_level: gap('level'), vs_team: gap('team'), vs_tour: gap('tour') },
          computed_at: r.computed_at,
        };
      });
      standing = { player_id: playerId, player: name, window: 'all recorded rounds, refreshed nightly', rows };
    }
  }

  const standingRows = (standing?.rows as unknown[] | undefined)?.length ?? 0;
  const noteParts: string[] = [];
  if (withoutValue.length) noteParts.push(`No published value at the requested level for ${withoutValue.length} of ${wanted.length} metrics.`);
  if (!teamLevel && !input.levels?.length) noteParts.push('The team’s division is not on record, so the Division I, II and III averages are all shown.');
  if (standingFailed) noteParts.push('The player’s standing could not be read.');
  if (playerId && !standingFailed && standingRows === 0) noteParts.push('No standing rows yet for this player on these metrics.');
  const coverage: ToolEnvelope['coverage'] = benchmarks.length === 0 ? 'empty' : withoutValue.length || standingFailed ? 'partial' : 'complete';
  return {
    summary: `${levels.map((l) => (l === 'pga' ? tourLabel(tour) : LEVEL_LABEL[l])).join(', ')} for ${benchmarks.length} metric${benchmarks.length === 1 ? '' : 's'}${playerId ? `, with ${standingRows === 0 ? 'no standing rows' : `${standingRows} standing row${standingRows === 1 ? '' : 's'}`}` : ''}.`,
    measurements: [],
    series: [],
    detail: {
      // Not 'benchmark': that tag marks a benchmark's own entries (reference figures); the standing beside them is the player's.
      kind: 'benchmark_read',
      team_level: teamLevel ? LEVEL_LABEL[teamLevel] : null,
      note: 'Benchmarks are published or estimated averages, never this team’s results. Name the level and the source when you use one.',
      benchmarks,
      ...(standing ? { standing } : {}),
    },
    coverage,
    coverage_note: noteParts.length ? noteParts.join(' ') : null,
    as_of: nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Metric definitions
// ---------------------------------------------------------------------------

/** A definition without the numbers it once quoted: the Tour values the table's text names are `get_benchmarks`' to give, and an internal "Part V" reference means nothing to a coach. */
function cleanDescription(text: string | null): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/\s*\([^)]*\b(?:Tour|college)\b[^)]*\)/gi, '')
    .replace(/\s*\(Part [^)]*\)/gi, '')
    .replace(/\s*;\s*(?=\))/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || null;
}

export const DEFINITION_CATEGORIES = ['sg', 'putting', 'approach', 'short_game', 'course_mgmt', 'scoring', 'pressure'] as const;

export interface DefinitionInput {
  metric_ids?: string[];
  category?: (typeof DEFINITION_CATEGORIES)[number];
}

export async function getMetricDefinitions(sb: Sb, input: DefinitionInput): Promise<ToolEnvelope> {
  let q = sb.from('golf_metrics').select('metric_id, display_label, category, unit, direction, description, active').eq('active', true);
  if (input.category) q = q.eq('category', input.category);
  const { data, error } = await q.order('category').order('metric_id').limit(60);
  if (error) return unavailableEnvelope('Could not read the metric definitions.', 'The definitions query failed.');
  const ids = input.metric_ids?.length ? new Set(input.metric_ids.map((m) => STANDING_ID_BY_CHAT_ID(m) ?? m)) : null;
  const rows = (data ?? []).filter((r) => !ids || ids.has(r.metric_id));
  // The metrics Ask reads from the stats cache that the standards table does not carry (scoring average, putts per round, ...).
  const catalog = ALL_METRIC_SPECS.filter((s) => !input.category && (!ids || ids.has(s.id)) && !STANDING_ID_BY_CHAT_ID(s.id)).map((s) => ({ metric_id: s.id, label: s.label, unit: s.unit, direction: s.direction, description: s.blurb, category: 'stats' }));
  const withText = ids !== null || rows.length <= 12;
  const defs = [
    ...rows.map((r) => ({ kind: 'definition' as const, metric_id: r.metric_id, label: r.display_label, category: r.category, unit: r.unit, direction: r.direction, ...(withText ? { description: cleanDescription(r.description) } : {}) })),
    ...catalog.map((c) => ({ kind: 'definition' as const, ...c })),
  ];
  if (defs.length === 0) return { summary: 'No metric matches that.', measurements: [], series: [], detail: { definitions: [] }, coverage: 'empty', coverage_note: null, as_of: nowIso() };
  return {
    summary: `${defs.length} metric definition${defs.length === 1 ? '' : 's'}.`,
    measurements: [],
    series: [],
    detail: { kind: 'definition', definitions: defs, ...(withText ? {} : { note: 'Ask for specific metrics to get their descriptions.' }) },
    coverage: 'complete',
    coverage_note: null,
    as_of: nowIso(),
  };
}
