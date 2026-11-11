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
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import {
  mapRowToRankable,
  rankEvidenceInsights,
  collapseParScoring,
  dedupeBySubject,
  type RawInsightRowForRanking,
} from '@/app/golf/actions/insight-delivery-ranking';
import { deliverReads, READS_V1_FLAG } from '@/app/golf/actions/insight-delivery-reads';
import { loadPinnedReadIds } from '@/lib/coachhelm/delivery/pinned-reads';
import { isCoachHelmFlagEnabled } from '@/lib/coachhelm/canary';
import { loadCoachWeightsForPlayer } from '@/lib/coachhelm/v3/ranking/score';
import { loadActiveGoals } from '@/lib/coachhelm/v3/goals/loader';
import { type CoachChatContext, requireRosterPlayer } from './context';
import { getMetricSpec, statsCacheColumns } from './metrics-catalog';
import { type Measurement, type ToolEnvelope, coverageFor, nowIso, unavailableEnvelope } from './provenance';
import { CLASS_EVENT_TYPE } from '@/lib/calendar/class-events';
import { todayIsoInZone } from '@/lib/golf/timezone';

type Sb = SupabaseClient<Database>;
type StatsRow = Record<string, unknown>;

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const int = (v: unknown): number => {
  const n = num(v);
  return n === null ? 0 : Math.max(0, Math.round(n));
};
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

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
    // What the sample counts: the attempts when the cache holds them, else the rounds it covers. A rate over holes with no hole count beside it
    // (three-putt rate) is sampled over rounds: 23 "holes" was 23 rounds (staging, 2026-11-08).
    sample_unit: spec.attemptsColumn ? spec.sampleUnit : 'rounds',
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
/** The window a round-based figure names: each player's newest 5, 10 (Stats' default) or 20 rounds, or this season. `cache` is the stats cache's own, lagging, window. */
export const FIGURE_WINDOWS = ['last5', 'last10', 'last20', 'season', 'cache'] as const;
export type FigureWindow = 'last5' | 'last10' | 'last20' | 'season';

/** What the stats pages print for one player in a window (Clubhouse's `playerFiguresOver`). */
export type PlayerFigures = {
  rounds: number;
  hole_rounds: number;
  scoring_average: number | null;
  putts_per_round: number | null;
  putt_rounds: number;
  sg_total: number | null;
  sg_rounds: number;
  legs: { tee: number | null; approach: number | null; around: number | null; putting: number | null };
  /** Greens in regulation and fairways, pooled over the holes (never a mean of percentages), as Stats prints them. */
  gir_pct: number | null;
  gir_holes: number;
  fairway_pct: number | null;
  fairway_holes: number;
  window_start: string | null;
  window_end: string | null;
  /** The rounds the window holds, newest first: what a list of "the last N rounds" must be, so the list and the figure are the same rounds. */
  round_ids?: string[];
};
/**
 * The key under which a figures source also returns the TEAM's pooled figures (all the asked players' rounds in the window, as Team Stats pools them),
 * beside the players' own. It is not a player id; a caller that walks its own ids never meets it.
 */
export const TEAM_FIGURES_KEY = '__team__';
/** Reads these players' figures for a window, one read for the lot; null when the rounds could not be read. Handed in by the route, which may import Clubhouse. */
export type PlayerFiguresSource = (playerIds: string[], window: FigureWindow) => Promise<Map<string, PlayerFigures> | null>;

/** One player's putts counted into the Stats page's six bands for a window (Clubhouse's `loadPlayerPuttBands`). `label` is the band as Stats names it ("3–5 ft"). */
export type PuttBandsRead = {
  bands: Array<{ label: string; attempts: number; made: number }>;
  rounds: number;
  window_start: string | null;
  window_end: string | null;
};
/** Reads one player's putting bands for a window as Stats does; null when the rounds or shots could not be read. Handed in by the route, like {@link PlayerFiguresSource}. */
export type PuttBandsSource = (playerId: string, window: FigureWindow) => Promise<PuttBandsRead | null>;

/** The metrics a round holds, and where in {@link PlayerFigures} each one is. The rest are shot-level and stay on the cache. */
const FIGURE_OF: Record<string, (f: PlayerFigures) => { value: number | null; n: number; unit?: 'holes' }> = {
  gir_pct: (f) => ({ value: f.gir_pct, n: f.gir_holes, unit: 'holes' }),
  driving_accuracy_pct: (f) => ({ value: f.fairway_pct, n: f.fairway_holes, unit: 'holes' }),
  scoring_average: (f) => ({ value: f.scoring_average, n: f.rounds }),
  putts_per_round: (f) => ({ value: f.putts_per_round, n: f.putt_rounds }),
  sg_total: (f) => ({ value: f.sg_total, n: f.sg_rounds }),
  sg_tee: (f) => ({ value: f.legs.tee, n: f.sg_rounds }),
  sg_approach: (f) => ({ value: f.legs.approach, n: f.sg_rounds }),
  sg_around_green: (f) => ({ value: f.legs.around, n: f.sg_rounds }),
  sg_putting: (f) => ({ value: f.legs.putting, n: f.sg_rounds }),
};

function measurementFromFigures(f: PlayerFigures, metricId: string, entity: Measurement['entity']): Measurement | null {
  const spec = getMetricSpec(metricId);
  const pick = FIGURE_OF[metricId];
  if (!spec || !pick) return null;
  const { value, n, unit } = pick(f);
  const hundredth = value === null ? null : Number(value.toFixed(2));
  return {
    metric_id: spec.id,
    metric_label: spec.label,
    unit: spec.unit,
    value: hundredth,
    entity,
    window_start: f.window_start,
    window_end: f.window_end,
    sample_size: n,
    sample_unit: unit ?? 'rounds',
    as_of: nowIso(),
    coverage: hundredth === null ? 'empty' : 'complete',
    coverage_note: hundredth === null ? `Not enough rounds in this window for ${spec.blurb}.` : !unit && n < 5 ? `Only ${n} ${n === 1 ? 'round' : 'rounds'}, so this is a lean read.` : null,
    source: 'rounds',
    method: `${spec.id}_per_18_over_the_window_as_stats_reads_it`,
    denominator: unit ? n : null,
    benchmark: null,
    direction: spec.direction,
  };
}

/** A metric for one player: from the rounds in the window when a round holds it and the window was read, else the cache's own, saying its window. */
function measurementFor(row: StatsRow | null, figures: PlayerFigures | null | undefined, metricId: string, entity: Measurement['entity']): Measurement | null {
  if (figures && metricId in FIGURE_OF) return measurementFromFigures(figures, metricId, entity);
  return row ? measurementFromCache(row, metricId, entity) : null;
}

/** The team's figure on one metric for a window: pooled as Team Stats does when the rounds were read, else the mean of the players' own cache figures. */
function teamFigure(metricId: string, byFigures: Map<string, PlayerFigures> | null, listed: readonly Measurement[], window: string) {
  const pick = FIGURE_OF[metricId];
  const team = byFigures?.get(TEAM_FIGURES_KEY) ?? null;
  if (team && pick) {
    const { value } = pick(team);
    return { value: value === null ? null : Number(value.toFixed(2)), window, method: 'pooled' as const, players: listed.length, rounds: team.hole_rounds };
  }
  const values = listed.flatMap((m) => (typeof m.value === 'number' ? [m.value] : []));
  const mean = values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null;
  return { value: mean, window: 'cache', method: 'mean' as const, players: values.length, rounds: null as number | null };
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
  input: { metric_id: string; window?: (typeof FIGURE_WINDOWS)[number] },
  figures?: PlayerFiguresSource,
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
  // A figure a round holds is read for every player over the same window; the rest are the cache's.
  const window = input.window ?? 'last10';
  const byFigures = figures && window !== 'cache' && spec.id in FIGURE_OF ? await figures(ctx.roster.map((p) => p.id), window) : null;

  for (const p of ctx.roster) {
    const row = byPlayer.get(p.id);
    const fig = byFigures?.get(p.id) ?? null;
    if (!row && !fig) {
      missing.push(p.name);
      continue;
    }
    const m = measurementFor(row ?? null, fig, spec.id, { kind: 'player', id: p.id, label: p.name });
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
    summary: `${spec.label} across ${ctx.team_name}${byFigures ? (window === 'season' ? ', this season' : window === 'last5' ? ', over each player’s newest five rounds' : window === 'last20' ? ', over each player’s newest twenty rounds' : ', over each player’s newest ten rounds') : ''}.`,
    measurements: [...withValue, ...measurements.filter((m) => m.value === null)],
    series: [],
    // `window` is the one every value was read over ('cache' when the figures were the stats cache's own); `team_ranking` marks the values as the whole roster's,
    // so a comparison uses them as the team. `team_figure` is the team's own number for the window: Team Stats' pooled one (every player's newest rounds
    // pooled, practice cut as Stats cuts it) when the rounds were read, else the mean of the players' stats-cache figures.
    detail: { metric_id: spec.id, metric_label: spec.label, direction: spec.direction, window: byFigures ? window : 'cache', team_ranking: true, team_figure: teamFigure(spec.id, byFigures, withValue, window) },
    coverage: coverageFor(withValue.length, ctx.roster.length),
    coverage_note:
      missing.length > 0
        ? `No ${spec.label.toLowerCase()} recorded for ${missing.join(', ')}.`
        : null,
    as_of: nowIso(),
  };
}

/**
 * Open CoachHelm signals for one player, ranked the SAME way every other
 * surface ranks them.
 *
 * Before this fix: ordered by `created_at DESC` and truncated to
 * `input.limit` (<=10) at the DB level — an ad-hoc, recency-only "ranking"
 * that could disagree with the feed's #1 the moment a higher-impact insight
 * was older than the newest ~10. A later fix widened the DB truncation to a
 * bounded cap (100) before ranking — still a truncate-before-rank shape, just
 * a wider one. Now: paginate the player's FULL eligible set via
 * `fetchAllRowsResult` (the same pattern insight-delivery.ts's single-player
 * readers use; a normal player's set is a few dozen rows, so this is still
 * one round trip), route through the SAME canonical pipeline the coach
 * feed's per-player branch uses (`rankEvidenceInsights` ->
 * `collapseParScoring` -> `dedupeBySubject`), THEN slice to `input.limit` —
 * so this tool's leading insight always agrees with what the coach feed
 * shows for that player, with no candidate silently excluded before ranking.
 *
 * Coach-facing (not player-facing): loads the player's real coach weights +
 * active goals (same inputs the coach feed's per-player branch loads), but
 * does NOT apply the player-feedback dismissal overlay — that overlay is
 * player-view-only by design (see insight-delivery.ts's
 * `applyPlayerFeedbackOverlay` doc comment: "Coach reads never call this").
 *
 * `mapRowToRankable` applies the same eligibility floor the feed's mapper
 * does (numeric strokes_impact/confidence, string metric), so a row the feed
 * can't score is invisible here too — the "N open signals" count can
 * therefore be lower than the raw eligible-row count for a player whose rows
 * are missing that evidence.
 */
export async function getPlayerInsights(
  sb: Sb,
  ctx: CoachChatContext,
  input: { player_id: string; limit: number },
): Promise<ToolEnvelope> {
  const player = requireRosterPlayer(ctx, input.player_id);
  const { data, error } = await fetchAllRowsResult(
    (from, to) =>
      applyInsightVisibility(
        sb
          .from('golf_coach_insights')
          .select(
            'id, player_id, category, insight_type, title, content, signature, evidence, metadata, lifecycle_state, status, priority, acknowledged_at, resolved_at, created_at, updated_at',
          )
          .eq('player_id', player.id),
      )
        .order('id', { ascending: true })
        .range(from, to),
    undefined,
    {
      table: 'golf_coach_insights',
      action: 'getPlayerInsights',
      feature: 'coachhelm_ai_engine',
      sport: 'golf',
    },
  );

  if (error) return unavailableEnvelope('Could not read insights.', 'The insights query failed.');

  const rawRows = (data ?? []) as unknown as RawInsightRowForRanking[];
  const rankable = rawRows
    .map(mapRowToRankable)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const [weights, goals] = await Promise.all([
    loadCoachWeightsForPlayer(sb, player.id).catch(() => ({})),
    loadActiveGoals(player.id).catch(() => []),
  ]);
  const ranked = await rankEvidenceInsights(rankable, weights, goals, sb);
  // CoachHelm Slice 0 (flag off by default): the same fold as the coach feed
  // (insight-delivery-reads.ts), with the reads a live focus came from kept
  // unfolded, so a read the chat names is one the feed shows. No 3 + 1 cap:
  // the coach asked about this player, so the chat lists every read, the way
  // the feed's `includeMore` does.
  const readsV1 = isCoachHelmFlagEnabled(READS_V1_FLAG);
  // null: the focus-area read failed (logged by the loader); fold without pins.
  const pinned = readsV1 ? await loadPinnedReadIds(sb, [player.id]) : null;
  const deduped = deliverReads(dedupeBySubject(collapseParScoring(ranked)), {
    fold: readsV1,
    cap: false,
    pinned: pinned ?? undefined,
  });
  const rows = deduped.slice(0, Math.min(Math.max(input.limit, 1), 10));

  return {
    summary: `${rows.length} open signal${rows.length === 1 ? '' : 's'} for ${player.name}.`,
    measurements: [],
    series: [],
    detail: {
      player: { player_id: player.id, name: player.name },
      insights: rows.map((i) => {
        const ev = (i.evidence ?? {}) as unknown as Record<string, unknown>;
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

const EVENTS_CAP = 50;

/** The calendar day in the team's zone (YYYY-MM-DD), the day all-day events are stored under. */
function teamDay(now: Date, timeZone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'America/New_York' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The calendar's four replies, legacy column values included. Kept in step with rsvpOf. */
export function replyOf(status: string | null | undefined): 'accepted' | 'maybe' | 'declined' | 'pending' {
  switch (status) {
    case 'accepted':
    case 'attending':
      return 'accepted';
    case 'tentative':
    case 'maybe':
      return 'maybe';
    case 'declined':
    case 'not_attending':
    case 'excused':
    case 'unexcused':
      return 'declined';
    default:
      return 'pending';
  }
}

/** The team's coming events, the one read a coach's and a player's schedule share. Null when the query failed. */
export async function readUpcomingEventRows(sb: Sb, ctx: CoachChatContext, days: number) {
  const now = new Date();
  const until = new Date(now.getTime() + days * 86400_000);

  const { data: events, error } = await sb
    .from('golf_events')
    .select('id, title, event_type, start_time, end_time, all_day, location, requires_rsvp, rsvp_deadline, status')
    .eq('team_id', ctx.team_id)
    // Players' synced class meetings share this table. Without this filter the
    // LIMIT fills with one player's semester and CoachHelm tells the coach their
    // week is classes (2026-08-05).
    .neq('event_type', CLASS_EVENT_TYPE)
    // A day back: an all-day event is stored at UTC midnight, so today's is already "past" by the clock.
    .gte('start_time', new Date(now.getTime() - 86400_000).toISOString())
    .lte('start_time', until.toISOString())
    .order('start_time', { ascending: true })
    .limit(EVENTS_CAP);
  if (error) return null;
  const today = teamDay(now, ctx.timezone);
  const rows = (events ?? []).filter(
    (e) =>
      e.status !== 'cancelled' &&
      (e.all_day === true ? e.start_time.slice(0, 10) >= today : Date.parse(e.start_time) >= now.getTime()),
  );
  return { rows, capped: (events ?? []).length >= EVENTS_CAP };
}

export async function getOpenTasks(sb: Sb, ctx: CoachChatContext): Promise<ToolEnvelope> {
  const { data, error } = await sb
    .from('golf_tasks')
    .select('id, title, due_date, status, priority, task_type')
    .eq('team_id', ctx.team_id)
    .eq('is_test', false)
    // `neq` alone drops a task whose status is null (NULL <> 'completed' is not true), and that task is open.
    .or('status.is.null,status.neq.completed')
    .order('due_date', { ascending: true })
    .limit(TASKS_CAP);
  if (error) return unavailableEnvelope('Could not read tasks.', 'The tasks query failed.');

  const rows = data ?? [];
  // The team's calendar day, NOT UTC's. `due_date` is a calendar date, so
  // comparing it against `new Date().toISOString().slice(0, 10)` reported a task
  // due TODAY as overdue from 20:00 EDT onward — the hours a coach is most
  // likely to be reviewing tomorrow's plan. `ctx.timezone` is NOT NULL and was
  // already being passed through as `detail.timezone` above; it just was not
  // used for this. See `todayIsoInZone`.
  const today = todayIsoInZone(ctx.timezone);
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
    coverage: rows.length === 0 ? 'empty' : rows.length >= TASKS_CAP ? 'partial' : 'complete',
    coverage_note: rows.length >= TASKS_CAP ? `Only the first ${TASKS_CAP} open tasks were read, so the counts are at least these.` : null,
    as_of: nowIso(),
  };
}

const TASKS_CAP = 50;
const TRIPS_CAP = 20;

/**
 * The team's trips (golf_travel_itineraries, Clubhouse Travel), from two weeks back on, soonest first. Owner,
 * 2026-10-31: asked for a travel plan, Ask said it had no way to see trips.
 */
export async function getTeamTravel(sb: Sb, ctx: CoachChatContext): Promise<ToolEnvelope> {
  const since = dayOffset(todayIsoInZone(ctx.timezone), -14);
  const { data, error } = await sb
    .from('golf_travel_itineraries')
    .select('id, event_name, destination, departure_date, departure_time, departure_location, return_date, return_time, transportation_type, hotel_name, notes')
    .eq('team_id', ctx.team_id)
    .eq('is_test', false)
    // A trip still under way counts even when it left more than two weeks ago.
    .or(`departure_date.gte.${since},return_date.gte.${since}`)
    .order('departure_date', { ascending: true })
    .limit(TRIPS_CAP);
  if (error) return unavailableEnvelope('Could not read the team’s trips.', 'The travel query failed.');

  const rows = data ?? [];
  if (rows.length === 0) {
    return { summary: 'No upcoming or recent trips are set up.', measurements: [], series: [], detail: { trips: [] }, coverage: 'empty', coverage_note: null, as_of: nowIso() };
  }
  return {
    summary: `${rows.length} trip${rows.length === 1 ? '' : 's'}.`,
    measurements: [],
    series: [],
    detail: {
      timezone: ctx.timezone,
      trips: rows.map((t) => ({
        trip_id: t.id,
        event: t.event_name,
        destination: t.destination,
        departs_on: t.departure_date,
        departs_at: t.departure_time,
        departs_from: t.departure_location,
        returns_on: t.return_date,
        returns_at: t.return_time,
        transportation: t.transportation_type,
        hotel: t.hotel_name,
        notes: t.notes,
      })),
    },
    coverage: rows.length >= TRIPS_CAP ? 'partial' : 'complete',
    coverage_note: rows.length >= TRIPS_CAP ? `Only the first ${TRIPS_CAP} trips from two weeks back were read; later ones are not listed.` : null,
    as_of: nowIso(),
  };
}

const dayOffset = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
