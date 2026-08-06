/**
 * ============================================================================
 * CoachHelm · chat · read tools
 * ----------------------------------------------------------------------------
 * Every read the agent can perform. All of them:
 *
 *   · close over a server-resolved {@link CoachChatContext} — no tool accepts a
 *     `team_id`, so a model-supplied one cannot exist;
 *   · validate any `player_id` against the active roster BEFORE reading;
 *   · aggregate in SQL or trusted server code — raw shot rows never leave here;
 *   · return a {@link ToolEnvelope} whose `measurements` carry unit, window,
 *     sample size, as-of and coverage, so the answer can be audited and the
 *     charts have something real to draw.
 *
 * There is no generic query tool and no SQL passthrough. The agent picks from a
 * closed catalog of metrics; it does not get to name columns.
 * ========================================================================== */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import {
  type CoachChatContext,
  requireRosterPlayer,
  resolveRosterPlayerByName,
} from './context';
import {
  getMetricSpec,
  statsCacheColumns,
  PUTT_DISTANCE_BUCKETS,
  ALL_METRIC_SPECS,
} from './metrics-catalog';
import {
  type Measurement,
  type MeasurementSeries,
  type ToolEnvelope,
  coverageFor,
  nowIso,
  unavailableEnvelope,
} from './provenance';
import { CLASS_EVENT_TYPE } from '@/lib/calendar/class-events';

type Sb = SupabaseClient<Database>;
type StatsRow = Record<string, unknown>;

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const int = (v: unknown): number => {
  const n = num(v);
  return n === null ? 0 : Math.max(0, Math.round(n));
};
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

// ===========================================================================
// Team overview — the one that used to lie about the roster size
// ===========================================================================

/**
 * Authoritative team snapshot.
 *
 * The previous implementation embedded `golf_players` into the membership
 * query and then `.filter()`ed out rows whose join came back null. A roster of
 * seven with one unreadable profile reported six, with no signal to the model
 * or the coach — the model then wrote "all six of your players" in perfect
 * confidence.
 *
 * This version reports BOTH counts. `active_roster_count` is the truth from
 * `golf_team_members`; `profiles_resolved` is how many of those we could read.
 * When they differ the envelope is `partial` and names the gap, so the answer
 * degrades to "6 of your 7 players — I could not read one profile" rather than
 * quietly changing the size of the team.
 */
export async function getTeamOverview(sb: Sb, ctx: CoachChatContext): Promise<ToolEnvelope> {
  const rosterCount = ctx.roster.length;
  const resolved = ctx.roster.filter((p) => p.first_name || p.last_name).length;
  const unresolvedIds = ctx.roster.filter((p) => !p.first_name && !p.last_name).map((p) => p.id);

  if (rosterCount === 0) {
    return {
      summary: `${ctx.team_name} has no active players yet.`,
      measurements: [],
      series: [],
      detail: { team_name: ctx.team_name, players: [], active_roster_count: 0 },
      coverage: 'empty',
      coverage_note: 'No active roster members.',
      as_of: nowIso(),
    };
  }

  const ids = ctx.roster.map((p) => p.id);
  const { data: rounds, error } = await sb
    .from('golf_rounds')
    .select('player_id, score_to_par, total_score, round_date')
    .in('player_id', ids)
    .eq('status', 'completed')
    .order('round_date', { ascending: false });

  if (error) {
    return unavailableEnvelope(
      `Could not read recent rounds for ${ctx.team_name}.`,
      'The rounds query failed. This is not the same as the team having no rounds.',
    );
  }

  const lastByPlayer = new Map<string, { to_par: number | null; date: string }>();
  const countByPlayer = new Map<string, number>();
  for (const r of rounds ?? []) {
    countByPlayer.set(r.player_id, (countByPlayer.get(r.player_id) ?? 0) + 1);
    if (!lastByPlayer.has(r.player_id)) {
      lastByPlayer.set(r.player_id, { to_par: r.score_to_par, date: r.round_date });
    }
  }

  const withRounds = ctx.roster.filter((p) => (countByPlayer.get(p.id) ?? 0) > 0).length;
  const noRounds = ctx.roster.filter((p) => (countByPlayer.get(p.id) ?? 0) === 0);
  const latestDate = (rounds ?? [])[0]?.round_date ?? null;

  const notes: string[] = [];
  if (unresolvedIds.length > 0) {
    notes.push(
      `${unresolvedIds.length} roster member${unresolvedIds.length === 1 ? '' : 's'} on the team have no readable profile`,
    );
  }
  if (noRounds.length > 0) {
    notes.push(
      `${noRounds.length} player${noRounds.length === 1 ? ' has' : 's have'} no recorded rounds (${noRounds
        .map((p) => p.name)
        .join(', ')})`,
    );
  }

  const coverage =
    unresolvedIds.length > 0 || noRounds.length > 0
      ? coverageFor(Math.min(resolved, withRounds), rosterCount)
      : 'complete';

  return {
    summary: `${ctx.team_name} has ${rosterCount} active player${rosterCount === 1 ? '' : 's'}.`,
    measurements: [
      {
        metric_id: 'active_roster_count',
        metric_label: 'Active roster',
        unit: 'count',
        value: rosterCount,
        entity: { kind: 'team', id: ctx.team_id, label: ctx.team_name },
        window_start: null,
        window_end: null,
        sample_size: rosterCount,
        sample_unit: 'players',
        as_of: nowIso(),
        coverage: 'complete',
        coverage_note: null,
        source: 'roster',
        method: 'count_active_team_members',
        denominator: null,
        benchmark: null,
        direction: null,
      },
    ],
    series: [],
    detail: {
      team_name: ctx.team_name,
      timezone: ctx.timezone,
      /** Truth from `golf_team_members`. Never derived from a join's success. */
      active_roster_count: rosterCount,
      profiles_resolved: resolved,
      players_with_rounds: withRounds,
      /** Internal diagnostics only — never rendered to the coach. */
      unresolved_player_ids: unresolvedIds,
      latest_round_date: latestDate,
      players: ctx.roster.map((p) => ({
        player_id: p.id,
        name: p.name,
        rounds_recorded: countByPlayer.get(p.id) ?? 0,
        last_round_to_par: lastByPlayer.get(p.id)?.to_par ?? null,
        last_round_date: lastByPlayer.get(p.id)?.date ?? null,
      })),
    },
    coverage,
    coverage_note: notes.length > 0 ? notes.join('; ') : null,
    as_of: nowIso(),
  };
}

// ===========================================================================
// Player metrics from the cache — with the cache's own timestamp attached
// ===========================================================================

async function loadStatsRow(sb: Sb, playerId: string): Promise<StatsRow | null> {
  const { data } = await sb
    .from('golf_player_stats_cache')
    .select(statsCacheColumns().join(', '))
    .eq('player_id', playerId)
    .maybeSingle();
  return (data as unknown as StatsRow | null) ?? null;
}

/**
 * Turn one cached column into a Measurement.
 *
 * `as_of` is the cache row's own `updated_at`, never "now". A cached statistic
 * presented as current is the quiet version of making one up — the coach reads
 * a number, assumes it reflects last night's round, and it does not.
 */
function measurementFromCache(
  row: StatsRow,
  metricId: string,
  entity: Measurement['entity'],
): Measurement | null {
  const spec = getMetricSpec(metricId);
  if (!spec) return null;

  const value = num(row[spec.column]);
  const attempts = spec.attemptsColumn ? int(row[spec.attemptsColumn]) : null;
  const rounds = int(row.rounds_in_calculation) || int(row.rounds_played);
  const sampleSize = spec.attemptsColumn ? (attempts ?? 0) : rounds;

  const stale = row.is_stale === true;
  const coverage: Measurement['coverage'] =
    value === null || sampleSize === 0 ? 'empty' : stale ? 'partial' : 'complete';

  return {
    metric_id: spec.id,
    metric_label: spec.label,
    unit: spec.unit,
    value,
    entity,
    window_start: str(row.calculation_period_start) ?? str(row.first_round_date),
    window_end: str(row.calculation_period_end) ?? str(row.last_round_date),
    sample_size: sampleSize,
    sample_unit: spec.sampleUnit,
    // The cache's timestamp, not the request's.
    as_of: str(row.updated_at) ?? nowIso(),
    coverage,
    coverage_note:
      value === null
        ? `No ${spec.blurb} recorded yet.`
        : sampleSize === 0
          ? 'No attempts recorded in this window.'
          : stale
            ? 'These figures are awaiting a refresh, so the most recent round may not be included.'
            : null,
    source: 'stats cache',
    method: spec.method,
    denominator: attempts,
    benchmark: null,
    direction: spec.direction,
  };
}

/** One metric for one player, fully sourced. */
export async function getPlayerMetric(
  sb: Sb,
  ctx: CoachChatContext,
  input: { player_id: string; metric_ids: string[] },
): Promise<ToolEnvelope> {
  const player = requireRosterPlayer(ctx, input.player_id);
  const entity = { kind: 'player' as const, id: player.id, label: player.name };

  const row = await loadStatsRow(sb, player.id);
  if (!row) {
    return {
      summary: `${player.name} has no computed statistics yet.`,
      measurements: [],
      series: [],
      coverage: 'empty',
      coverage_note: `${player.name} has no rounds recorded, so nothing has been computed.`,
      as_of: nowIso(),
    };
  }

  const measurements = input.metric_ids
    .map((id) => measurementFromCache(row, id, entity))
    .filter((m): m is Measurement => m !== null);

  const usable = measurements.filter((m) => m.value !== null).length;

  return {
    summary: `${measurements.length} metric${measurements.length === 1 ? '' : 's'} for ${player.name}.`,
    measurements,
    series: [],
    coverage: coverageFor(usable, measurements.length),
    coverage_note:
      usable < measurements.length
        ? `${measurements.length - usable} of the requested metrics have no recorded data for ${player.name}.`
        : null,
    as_of: str(row.updated_at) ?? nowIso(),
  };
}

/**
 * Rank the whole roster on one metric.
 *
 * Note what this deliberately does NOT return: a "worst player" flag. It
 * returns an ordered list of measured values with sample sizes, and the
 * direction of the metric, so the answer can only ever be phrased as
 * "lowest scrambling over these rounds" — a metric and a window — rather than
 * a verdict on a nineteen-year-old.
 */
export async function getTeamMetricRanking(
  sb: Sb,
  ctx: CoachChatContext,
  input: { metric_id: string },
): Promise<ToolEnvelope> {
  const spec = getMetricSpec(input.metric_id);
  if (!spec) return unavailableEnvelope('Unknown metric.', `No metric named ${input.metric_id}.`);
  if (ctx.roster.length === 0) {
    return {
      summary: `${ctx.team_name} has no active players.`,
      measurements: [],
      series: [],
      coverage: 'empty',
      coverage_note: 'No active roster members.',
      as_of: nowIso(),
    };
  }

  const { data, error } = await sb
    .from('golf_player_stats_cache')
    .select(statsCacheColumns().join(', '))
    .in(
      'player_id',
      ctx.roster.map((p) => p.id),
    );
  if (error) {
    return unavailableEnvelope(
      `Could not read team statistics.`,
      'The statistics query failed; this is not the same as the team having no data.',
    );
  }

  const byPlayer = new Map(((data as unknown as StatsRow[] | null) ?? []).map((r) => [String(r.player_id), r]));
  const measurements: Measurement[] = [];
  const missing: string[] = [];

  for (const p of ctx.roster) {
    const row = byPlayer.get(p.id);
    if (!row) {
      missing.push(p.name);
      continue;
    }
    const m = measurementFromCache(row, spec.id, { kind: 'player', id: p.id, label: p.name });
    if (!m) continue;
    if (m.value === null) missing.push(p.name);
    measurements.push(m);
  }

  const withValue = measurements.filter((m) => m.value !== null);
  withValue.sort((a, b) =>
    spec.direction === 'higher_better'
      ? (b.value ?? 0) - (a.value ?? 0)
      : (a.value ?? 0) - (b.value ?? 0),
  );

  return {
    summary: `${spec.label} across ${ctx.team_name}.`,
    measurements: [...withValue, ...measurements.filter((m) => m.value === null)],
    series: [],
    detail: { metric_id: spec.id, metric_label: spec.label, direction: spec.direction },
    coverage: coverageFor(withValue.length, ctx.roster.length),
    coverage_note:
      missing.length > 0
        ? `No ${spec.label.toLowerCase()} recorded for ${missing.join(', ')}.`
        : null,
    as_of: nowIso(),
  };
}

// ===========================================================================
// Trend — a real per-round series, aggregated server-side
// ===========================================================================

/** Round-level columns a trend can be built from, and how to read them. */
const ROUND_TREND: Record<
  string,
  { column: string; label: string; unit: Measurement['unit']; direction: 'higher_better' | 'lower_better' }
> = {
  score_to_par: { column: 'score_to_par', label: 'Score to par', unit: 'score', direction: 'lower_better' },
  total_score: { column: 'total_score', label: 'Total score', unit: 'score', direction: 'lower_better' },
  putts: { column: 'total_putts', label: 'Putts', unit: 'count', direction: 'lower_better' },
  sg_total: { column: 'strokes_gained_total', label: 'Strokes gained total', unit: 'strokes', direction: 'higher_better' },
  sg_putting: { column: 'strokes_gained_putting', label: 'Strokes gained putting', unit: 'strokes', direction: 'higher_better' },
  sg_approach: { column: 'strokes_gained_approach', label: 'Strokes gained approach', unit: 'strokes', direction: 'higher_better' },
  sg_tee: { column: 'strokes_gained_tee', label: 'Strokes gained off the tee', unit: 'strokes', direction: 'higher_better' },
  sg_around_green: { column: 'strokes_gained_around_green', label: 'Strokes gained around the green', unit: 'strokes', direction: 'higher_better' },
};

export const ROUND_TREND_METRIC_IDS = Object.keys(ROUND_TREND) as [string, ...string[]];

/**
 * Per-round movement for one player.
 *
 * `last_n` bounds the read — the model cannot ask for "everything" and get a
 * few thousand rows into its context. The returned window is the window that
 * was actually read, so "his last five rounds" is a checkable claim rather than
 * a figure of speech.
 */
export async function getPlayerTrend(
  sb: Sb,
  ctx: CoachChatContext,
  input: { player_id: string; metric_id: string; last_n: number },
): Promise<ToolEnvelope> {
  const player = requireRosterPlayer(ctx, input.player_id);
  const spec = ROUND_TREND[input.metric_id];
  if (!spec) {
    return unavailableEnvelope('Unknown trend metric.', `No round-level metric named ${input.metric_id}.`);
  }

  const limit = Math.min(Math.max(input.last_n, 2), 40);
  const { data, error } = await sb
    .from('golf_rounds')
    .select(`id, round_date, course_name, round_type, ${spec.column}`)
    .eq('player_id', player.id)
    .eq('status', 'completed')
    .order('round_date', { ascending: false })
    .limit(limit);

  if (error) {
    return unavailableEnvelope(
      `Could not read ${player.name}'s rounds.`,
      'The rounds query failed; this is not the same as having no rounds.',
    );
  }

  const rows = ((data as unknown as Record<string, unknown>[] | null) ?? []).slice().reverse();
  const points = rows
    .map((r) => ({
      at: String(r.round_date),
      value: num(r[spec.column]),
      bucket: null,
      sample_size: 1,
    }))
    .filter((p): p is { at: string; value: number; bucket: null; sample_size: number } => p.value !== null);

  const entity = { kind: 'player' as const, id: player.id, label: player.name };
  const windowStart = points[0]?.at ?? null;
  const windowEnd = points[points.length - 1]?.at ?? null;

  if (points.length === 0) {
    return {
      summary: `${player.name} has no rounds with ${spec.label.toLowerCase()} recorded.`,
      measurements: [],
      series: [],
      coverage: rows.length === 0 ? 'empty' : 'partial',
      coverage_note:
        rows.length === 0
          ? `${player.name} has no completed rounds on record.`
          : `${rows.length} round${rows.length === 1 ? '' : 's'} found, but none carry ${spec.label.toLowerCase()}.`,
      as_of: nowIso(),
    };
  }

  const series: MeasurementSeries = {
    metric_id: input.metric_id,
    metric_label: spec.label,
    unit: spec.unit,
    entity,
    points,
    window_start: windowStart,
    window_end: windowEnd,
    as_of: nowIso(),
    coverage: coverageFor(points.length, rows.length),
    coverage_note:
      points.length < rows.length
        ? `${rows.length - points.length} of the ${rows.length} rounds read have no ${spec.label.toLowerCase()} recorded.`
        : null,
    source: 'rounds',
    method: `round_level_${input.metric_id}`,
    benchmark: null,
    direction: spec.direction,
  };

  const values = points.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  return {
    summary: `${spec.label} across ${player.name}'s last ${points.length} recorded round${points.length === 1 ? '' : 's'}.`,
    measurements: [
      {
        metric_id: `${input.metric_id}_mean`,
        metric_label: `${spec.label} (average)`,
        unit: spec.unit,
        value: Math.round(mean * 100) / 100,
        entity,
        window_start: windowStart,
        window_end: windowEnd,
        sample_size: points.length,
        sample_unit: 'rounds',
        as_of: nowIso(),
        coverage: series.coverage,
        coverage_note: series.coverage_note,
        source: 'rounds',
        method: `mean_round_level_${input.metric_id}`,
        denominator: points.length,
        benchmark: null,
        direction: spec.direction,
      },
    ],
    series: [series],
    detail: {
      rounds: rows.map((r) => ({
        round_id: String(r.id),
        date: String(r.round_date),
        course: str(r.course_name),
        round_type: str(r.round_type),
        value: num(r[spec.column]),
      })),
    },
    coverage: series.coverage,
    coverage_note: series.coverage_note,
    as_of: nowIso(),
  };
}

// ===========================================================================
// Putting distance profile — the question that most needs its denominators
// ===========================================================================

export async function getPuttingDistanceProfile(
  sb: Sb,
  ctx: CoachChatContext,
  input: { player_id: string },
): Promise<ToolEnvelope> {
  const player = requireRosterPlayer(ctx, input.player_id);
  const row = await loadStatsRow(sb, player.id);
  if (!row) {
    return {
      summary: `${player.name} has no putting data yet.`,
      measurements: [],
      series: [],
      coverage: 'empty',
      coverage_note: `${player.name} has no rounds recorded.`,
      as_of: nowIso(),
    };
  }

  const entity = { kind: 'player' as const, id: player.id, label: player.name };
  const points: MeasurementSeries['points'] = [];
  const thin: string[] = [];

  for (const b of PUTT_DISTANCE_BUCKETS) {
    const pct = num(row[b.pctColumn]);
    if (pct === null) continue;
    const attempts = b.attemptsColumn ? int(row[b.attemptsColumn]) : 0;
    // A bucket with no attempt column cannot support a claim, so it is not
    // charted — an unfalsifiable percentage is worse than a gap in the chart.
    if (b.attemptsColumn && attempts === 0) continue;
    if (b.attemptsColumn && attempts < 10) thin.push(`${b.bucket} (${attempts} attempts)`);
    points.push({ at: b.bucket, value: pct, bucket: b.bucket, sample_size: attempts });
  }

  if (points.length === 0) {
    return {
      summary: `${player.name} has no putting distance data recorded.`,
      measurements: [],
      series: [],
      coverage: 'empty',
      coverage_note: 'No putt attempts have been recorded by distance.',
      as_of: str(row.updated_at) ?? nowIso(),
    };
  }

  const asOf = str(row.updated_at) ?? nowIso();
  const series: MeasurementSeries = {
    metric_id: 'putt_make_pct_by_distance',
    metric_label: 'Make rate by distance',
    unit: 'percent',
    entity,
    points,
    window_start: str(row.calculation_period_start) ?? str(row.first_round_date),
    window_end: str(row.calculation_period_end) ?? str(row.last_round_date),
    as_of: asOf,
    coverage: coverageFor(points.length, PUTT_DISTANCE_BUCKETS.length),
    coverage_note:
      thin.length > 0 ? `Small samples in ${thin.join(', ')} — read those buckets with care.` : null,
    source: 'stats cache',
    method: 'putts_made_over_attempts_by_distance_bucket',
    benchmark: null,
    direction: 'higher_better',
  };

  return {
    summary: `${player.name}'s make rate by putt distance.`,
    measurements: points.map((p) => ({
      metric_id: `putt_make_pct_${p.bucket}`,
      metric_label: `Make rate ${p.bucket}`,
      unit: 'percent' as const,
      value: p.value,
      entity,
      window_start: series.window_start,
      window_end: series.window_end,
      sample_size: p.sample_size,
      sample_unit: 'attempts' as const,
      as_of: asOf,
      coverage: p.sample_size >= 10 ? ('complete' as const) : ('partial' as const),
      coverage_note: p.sample_size < 10 ? `Only ${p.sample_size} attempts recorded.` : null,
      source: 'stats cache',
      method: 'putts_made_over_attempts_by_distance_bucket',
      denominator: p.sample_size,
      benchmark: null,
      direction: 'higher_better' as const,
    })),
    series: [series],
    coverage: series.coverage,
    coverage_note: series.coverage_note,
    as_of: asOf,
  };
}

// ===========================================================================
// Comparison — same window definition on both sides, or it is not a comparison
// ===========================================================================

/**
 * Compare two or more players on the same metrics.
 *
 * The invariant that matters: every player is measured over the SAME window
 * definition, and any difference in what was actually available is reported per
 * player. Comparing one player's 20-round average against another's 3-round
 * average and calling it a gap is the most common way this kind of feature
 * produces a confidently wrong coaching decision.
 */
export async function comparePlayers(
  sb: Sb,
  ctx: CoachChatContext,
  input: { player_ids: string[]; metric_ids: string[] },
): Promise<ToolEnvelope> {
  const players = input.player_ids.map((id) => requireRosterPlayer(ctx, id));
  if (players.length < 2) {
    return unavailableEnvelope('A comparison needs at least two players.', 'Fewer than two players supplied.');
  }

  const { data, error } = await sb
    .from('golf_player_stats_cache')
    .select(statsCacheColumns().join(', '))
    .in(
      'player_id',
      players.map((p) => p.id),
    );
  if (error) {
    return unavailableEnvelope('Could not read statistics for those players.', 'The statistics query failed.');
  }

  const byPlayer = new Map(((data as unknown as StatsRow[] | null) ?? []).map((r) => [String(r.player_id), r]));
  const measurements: Measurement[] = [];
  const coverageNotes: string[] = [];

  for (const p of players) {
    const row = byPlayer.get(p.id);
    if (!row) {
      coverageNotes.push(`${p.name} has no computed statistics`);
      continue;
    }
    const rounds = int(row.rounds_in_calculation) || int(row.rounds_played);
    if (rounds === 0) coverageNotes.push(`${p.name} has no rounds in the computed window`);
    for (const metricId of input.metric_ids) {
      const m = measurementFromCache(row, metricId, { kind: 'player', id: p.id, label: p.name });
      if (m) measurements.push(m);
    }
  }

  // Surface an unequal basis explicitly — the model must not read past it.
  const sampleByPlayer = new Map<string, number>();
  for (const m of measurements) sampleByPlayer.set(m.entity.label, m.sample_size);
  const samples = [...sampleByPlayer.values()];
  if (samples.length > 1 && Math.max(...samples) > 0) {
    const spread = Math.max(...samples) / Math.max(1, Math.min(...samples));
    if (spread >= 2) {
      coverageNotes.push(
        `The players have very different amounts of recorded data (${[...sampleByPlayer]
          .map(([n, s]) => `${n}: ${s}`)
          .join(', ')}), so treat the gap with care`,
      );
    }
  }

  const withValue = measurements.filter((m) => m.value !== null).length;

  return {
    summary: `Comparison of ${players.map((p) => p.name).join(' and ')}.`,
    measurements,
    series: [],
    detail: {
      players: players.map((p) => ({ player_id: p.id, name: p.name })),
      metric_ids: input.metric_ids,
    },
    coverage: coverageNotes.length > 0 ? coverageFor(withValue, measurements.length) : 'complete',
    coverage_note: coverageNotes.length > 0 ? coverageNotes.join('; ') : null,
    as_of: nowIso(),
  };
}

// ===========================================================================
// Weakest area — a metric and a window, never a verdict
// ===========================================================================

/**
 * Which measured area a player is furthest behind their team on.
 *
 * Returns the ranked gaps with sample sizes and lets the answer name a metric
 * and a window. There is no "weakest player" equivalent of this tool, and that
 * is deliberate.
 */
export async function getPlayerWeakestAreas(
  sb: Sb,
  ctx: CoachChatContext,
  input: { player_id: string },
): Promise<ToolEnvelope> {
  const player = requireRosterPlayer(ctx, input.player_id);

  const { data, error } = await sb
    .from('golf_player_stats_cache')
    .select(statsCacheColumns().join(', '))
    .in(
      'player_id',
      ctx.roster.map((p) => p.id),
    );
  if (error) return unavailableEnvelope('Could not read statistics.', 'The statistics query failed.');

  const rows = (data as unknown as StatsRow[] | null) ?? [];
  const own = rows.find((r) => String(r.player_id) === player.id);
  if (!own) {
    return {
      summary: `${player.name} has no computed statistics yet.`,
      measurements: [],
      series: [],
      coverage: 'empty',
      coverage_note: `${player.name} has no rounds recorded.`,
      as_of: nowIso(),
    };
  }

  const entity = { kind: 'player' as const, id: player.id, label: player.name };
  const gaps: { measurement: Measurement; gap: number; teamMean: number; teamN: number }[] = [];

  for (const spec of ALL_METRIC_SPECS) {
    const m = measurementFromCache(own, spec.id, entity);
    if (!m || m.value === null || m.sample_size === 0) continue;

    const peers = rows
      .filter((r) => String(r.player_id) !== player.id)
      .map((r) => num(r[spec.column]))
      .filter((v): v is number => v !== null);
    // Under three peers a "team average" is not a comparison worth drawing.
    if (peers.length < 3) continue;

    const teamMean = peers.reduce((a, b) => a + b, 0) / peers.length;
    const raw = m.value - teamMean;
    const behind = spec.direction === 'higher_better' ? -raw : raw;
    if (behind <= 0) continue;

    gaps.push({ measurement: m, gap: behind, teamMean, teamN: peers.length });
  }

  // Normalise by the metric's own spread so a 0.4-stroke SG gap and a 6-point
  // percentage gap can be ranked against each other honestly.
  gaps.sort((a, b) => b.gap / Math.max(1e-6, Math.abs(b.teamMean)) - a.gap / Math.max(1e-6, Math.abs(a.teamMean)));

  const top = gaps.slice(0, 4);
  const rounds = int(own.rounds_in_calculation) || int(own.rounds_played);

  return {
    summary:
      top.length === 0
        ? `${player.name} is at or above the team average on every measured area with enough data to compare.`
        : `${player.name} is furthest behind the team on ${top[0]?.measurement.metric_label.toLowerCase()}.`,
    measurements: top.map((g) => g.measurement),
    series: [],
    detail: {
      recorded_rounds: rounds,
      gaps: top.map((g) => ({
        metric_id: g.measurement.metric_id,
        metric_label: g.measurement.metric_label,
        player_value: g.measurement.value,
        team_average: Math.round(g.teamMean * 100) / 100,
        team_peers_compared: g.teamN,
        unit: g.measurement.unit,
        direction: g.measurement.direction,
      })),
    },
    coverage: top.length === 0 ? 'partial' : 'complete',
    coverage_note:
      top.length === 0
        ? 'Not enough teammates have comparable data to rank areas against the team.'
        : null,
    as_of: str(own.updated_at) ?? nowIso(),
  };
}

// ===========================================================================
// Rounds, insights, focus areas
// ===========================================================================

export async function getRecentRounds(
  sb: Sb,
  ctx: CoachChatContext,
  input: { player_id: string; last_n: number },
): Promise<ToolEnvelope> {
  const player = requireRosterPlayer(ctx, input.player_id);
  const limit = Math.min(Math.max(input.last_n, 1), 20);

  const { data, error } = await sb
    .from('golf_rounds')
    .select('id, round_date, course_name, round_type, total_score, score_to_par, total_putts, strokes_gained_total')
    .eq('player_id', player.id)
    .eq('status', 'completed')
    .order('round_date', { ascending: false })
    .limit(limit);
  if (error) return unavailableEnvelope(`Could not read ${player.name}'s rounds.`, 'The rounds query failed.');

  const rounds = data ?? [];
  return {
    summary: `${player.name}'s last ${rounds.length} recorded round${rounds.length === 1 ? '' : 's'}.`,
    measurements: [],
    series: [],
    detail: {
      player: { player_id: player.id, name: player.name },
      rounds: rounds.map((r) => ({
        round_id: r.id,
        date: r.round_date,
        course: r.course_name,
        round_type: r.round_type,
        total_score: r.total_score,
        to_par: r.score_to_par,
        putts: r.total_putts,
        sg_total: r.strokes_gained_total,
      })),
    },
    coverage: rounds.length === 0 ? 'empty' : 'complete',
    coverage_note: rounds.length === 0 ? `${player.name} has no completed rounds on record.` : null,
    as_of: nowIso(),
  };
}

export async function getPlayerInsights(
  sb: Sb,
  ctx: CoachChatContext,
  input: { player_id: string; limit: number },
): Promise<ToolEnvelope> {
  const player = requireRosterPlayer(ctx, input.player_id);
  const { data, error } = await applyInsightVisibility(
    sb
      .from('golf_coach_insights')
      .select('id, insight_type, category, title, content, evidence, created_at')
      .eq('player_id', player.id),
  )
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit, 1), 10));

  if (error) return unavailableEnvelope('Could not read insights.', 'The insights query failed.');

  const rows = data ?? [];
  return {
    summary: `${rows.length} open signal${rows.length === 1 ? '' : 's'} for ${player.name}.`,
    measurements: [],
    series: [],
    detail: {
      player: { player_id: player.id, name: player.name },
      insights: rows.map((i) => {
        const ev = (i.evidence ?? {}) as Record<string, unknown>;
        return {
          insight_id: i.id,
          type: i.insight_type,
          category: i.category,
          title: i.title,
          content: i.content,
          metric_label: str(ev.metric_label),
          value_display: str(ev.your_value_display),
          created_at: i.created_at,
        };
      }),
    },
    coverage: rows.length === 0 ? 'empty' : 'complete',
    coverage_note: rows.length === 0 ? `No open signals for ${player.name} right now.` : null,
    as_of: nowIso(),
  };
}

export async function getFocusAreas(
  sb: Sb,
  ctx: CoachChatContext,
  input: { player_id?: string },
): Promise<ToolEnvelope> {
  const ids = input.player_id ? [requireRosterPlayer(ctx, input.player_id).id] : ctx.roster.map((p) => p.id);
  if (ids.length === 0) {
    return {
      summary: 'No active players.',
      measurements: [],
      series: [],
      coverage: 'empty',
      coverage_note: 'No active roster members.',
      as_of: nowIso(),
    };
  }

  const { data, error } = await sb
    .from('golf_player_focus_areas')
    .select('id, player_id, title, area_type, status, target_metric, current_value, target_value, target_date, started_at, updated_at')
    .in('player_id', ids)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });
  if (error) return unavailableEnvelope('Could not read focus areas.', 'The focus-area query failed.');

  const nameById = new Map(ctx.roster.map((p) => [p.id, p.name]));
  const rows = data ?? [];
  return {
    summary: `${rows.length} active focus area${rows.length === 1 ? '' : 's'}.`,
    measurements: [],
    series: [],
    detail: {
      focus_areas: rows.map((f) => ({
        focus_area_id: f.id,
        player_id: f.player_id,
        player_name: nameById.get(f.player_id) ?? 'Unknown',
        title: f.title,
        area_type: f.area_type,
        target_metric: f.target_metric,
        current_value: f.current_value,
        target_value: f.target_value,
        target_date: f.target_date,
        started_at: f.started_at,
        last_updated: f.updated_at,
      })),
    },
    coverage: rows.length === 0 ? 'empty' : 'complete',
    coverage_note: rows.length === 0 ? 'No active focus areas.' : null,
    as_of: nowIso(),
  };
}

// ===========================================================================
// Schedule + RSVP
// ===========================================================================

export async function getUpcomingEvents(
  sb: Sb,
  ctx: CoachChatContext,
  input: { days_ahead: number },
): Promise<ToolEnvelope> {
  const days = Math.min(Math.max(input.days_ahead, 1), 60);
  const now = new Date();
  const until = new Date(now.getTime() + days * 86400_000);

  const { data: events, error } = await sb
    .from('golf_events')
    .select('id, title, event_type, start_time, end_time, location, requires_rsvp, rsvp_deadline, status')
    .eq('team_id', ctx.team_id)
    // Players' synced class meetings share this table. Without this filter the
    // LIMIT fills with one player's semester and CoachHelm tells the coach their
    // week is classes (2026-08-05).
    .neq('event_type', CLASS_EVENT_TYPE)
    .gte('start_time', now.toISOString())
    .lte('start_time', until.toISOString())
    .order('start_time', { ascending: true })
    .limit(50);
  if (error) return unavailableEnvelope('Could not read the calendar.', 'The events query failed.');

  const rows = (events ?? []).filter((e) => e.status !== 'cancelled');
  if (rows.length === 0) {
    return {
      summary: `Nothing scheduled in the next ${days} days.`,
      measurements: [],
      series: [],
      detail: { events: [] },
      coverage: 'empty',
      coverage_note: null,
      as_of: nowIso(),
    };
  }

  const { data: attendance } = await sb
    .from('golf_event_attendance')
    .select('event_id, player_id, status')
    .in(
      'event_id',
      rows.map((e) => e.id),
    );

  const nameById = new Map(ctx.roster.map((p) => [p.id, p.name]));
  const byEvent = new Map<string, { accepted: number; declined: number; pending: string[] }>();
  for (const e of rows) byEvent.set(e.id, { accepted: 0, declined: 0, pending: [] });
  for (const a of attendance ?? []) {
    const bucket = byEvent.get(a.event_id);
    if (!bucket) continue;
    if (a.status === 'accepted') bucket.accepted += 1;
    else if (a.status === 'declined') bucket.declined += 1;
    else bucket.pending.push(nameById.get(a.player_id) ?? 'Unknown');
  }

  return {
    summary: `${rows.length} event${rows.length === 1 ? '' : 's'} in the next ${days} days.`,
    measurements: [],
    series: [],
    detail: {
      timezone: ctx.timezone,
      events: rows.map((e) => {
        const b = byEvent.get(e.id)!;
        return {
          event_id: e.id,
          title: e.title,
          event_type: e.event_type,
          starts_at: e.start_time,
          ends_at: e.end_time,
          location: e.location,
          requires_rsvp: e.requires_rsvp,
          rsvp_deadline: e.rsvp_deadline,
          rsvp_accepted: b.accepted,
          rsvp_declined: b.declined,
          rsvp_pending_count: b.pending.length,
          rsvp_pending_names: b.pending,
        };
      }),
    },
    coverage: 'complete',
    coverage_note: null,
    as_of: nowIso(),
  };
}

export async function getOpenTasks(sb: Sb, ctx: CoachChatContext): Promise<ToolEnvelope> {
  const { data, error } = await sb
    .from('golf_tasks')
    .select('id, title, due_date, status, priority, task_type')
    .eq('team_id', ctx.team_id)
    .neq('status', 'completed')
    .order('due_date', { ascending: true })
    .limit(50);
  if (error) return unavailableEnvelope('Could not read tasks.', 'The tasks query failed.');

  const rows = data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const overdue = rows.filter((t) => t.due_date && String(t.due_date).slice(0, 10) < today);

  return {
    summary: `${rows.length} open task${rows.length === 1 ? '' : 's'}, ${overdue.length} overdue.`,
    measurements: [],
    series: [],
    detail: {
      open_count: rows.length,
      overdue_count: overdue.length,
      tasks: rows.map((t) => ({
        task_id: t.id,
        title: t.title,
        due_date: t.due_date,
        status: t.status,
        priority: t.priority,
        overdue: Boolean(t.due_date && String(t.due_date).slice(0, 10) < today),
      })),
    },
    coverage: rows.length === 0 ? 'empty' : 'complete',
    coverage_note: null,
    as_of: nowIso(),
  };
}

/** Name → roster player, for plain-typed references. Never leaves the server. */
export function resolvePlayerReference(
  ctx: CoachChatContext,
  name: string,
): { player_id: string; name: string } | { error: string; candidates: string[] } {
  const found = resolveRosterPlayerByName(ctx, name);
  if (found) return { player_id: found.id, name: found.name };
  return {
    error: `No single player on the roster matches "${name}".`,
    candidates: ctx.roster.map((p) => p.name),
  };
}
