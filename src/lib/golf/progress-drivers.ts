import 'server-only';

/**
 * ============================================================================
 * Goal + focus-area progress drivers (P1-07 live wiring) — makes "track
 * progress" actually work
 * ----------------------------------------------------------------------------
 * SECURITY: this module intentionally has NO 'use server' directive. Every
 * function here runs createAdminClient() (full RLS bypass) keyed on a
 * caller-supplied player_id / player_id[] with ZERO auth check inside the
 * function body — that is safe ONLY because every real caller (server
 * components under src/app/golf/(dashboard)/**, the v3 standing-refresh
 * cron) already scoped those ids via its own session/cron auth before
 * calling in. Per Next.js's server-actions guidance, EVERY exported async
 * function in a 'use server' file becomes a public, directly-POSTable
 * endpoint — discoverable by its action id — regardless of whether any
 * client component actually imports it. Exporting these from a 'use server'
 * module would let anyone POST an arbitrary player_id and read/mutate that
 * player's goals/focus areas. Keep this file a plain server module; import
 * it directly from other server-side code (server components, route
 * handlers, cron), never from a 'use server' actions file's export surface.
 * ----------------------------------------------------------------------------
 * Originally lived as two 'use server' action files:
 *   - src/app/golf/actions/v3/goal-progress.ts
 *   - src/app/golf/actions/v3/focus-area-progress.ts
 * Relocated here (unchanged logic) to close that public-endpoint hole; both
 * original files are now thin, non-'use server' re-export shims — nothing
 * else changed for legitimate callers.
 *
 * ----------------------------------------------------------------------------
 * GOAL PROGRESS
 * ----------------------------------------------------------------------------
 * The pure `evaluateGoal` core has always existed but was NEVER RUN in a live
 * system: no Inngest function, no cron, no post-round hook called it. So every
 * goal sat frozen at `current_value === baseline_value` with an empty
 * `snapshots[]` — the progress bar could never move and outcomes never resolved.
 *
 * This driver closes that gap. For a player's active goals it:
 *   1. reads each goal's latest OBSERVED standing value (golf_player_standing,
 *      via loadPlayerStandingMap) — a real measured reading, never an estimate,
 *   2. runs the deterministic evaluator (direction-aware target check + dated
 *      snapshot append), and
 *   3. persists current_value + snapshots + any terminal state transition.
 *
 * Idempotent per UTC day (the evaluator dedupes same-day snapshots), so it is
 * safe to call BOTH on page view (immediate, no infra) and from a daily /
 * post-round job. Uses the admin client so it runs with a player session OR
 * headless; the explicit `player_id` filter is the scoping guard.
 *
 * Honesty: when a goal's metric has no standing reading yet, the evaluator
 * returns `unchanged` and we skip the write — the goal correctly stays
 * "awaiting" rather than showing a fabricated number.
 *
 * ----------------------------------------------------------------------------
 * FOCUS-AREA PROGRESS
 * ----------------------------------------------------------------------------
 * Focus areas (golf_player_focus_areas) historically only moved their
 * `current_value` when someone manually tapped "Update progress". So an active
 * focus area sat frozen at the value captured at creation — the progress bar
 * never reflected the rounds the player actually went out and played.
 *
 * This driver closes that gap, in the SAME spirit as the goal-progress driver
 * above. For each ACTIVE focus area with a windowable measurable metric it:
 *   1. measures the metric over the area's OWN window — rounds played since it
 *      started (started_at) — NOT the diluted all-time average, and on the SAME
 *      scale as the baseline captured at creation (both come from the per-round
 *      golf_round_stats_cache written by the gender-aware recalculate RPC),
 *   2. writes the windowed value to `current_value` so the bar advances.
 *
 * HONESTY: metrics with no clean per-round source (proximity, up&down, 1/3-putt
 * %, per-par averages) are NOT windowable — {@link aggregateFocusMetric} returns
 * null and we SKIP the write, leaving `current_value` as last set rather than
 * fabricating a number. Areas still in 'proposed' (awaiting player acceptance)
 * are ignored — their window hasn't started. We never auto-complete: hitting the
 * target is the player's/coach's call, so only `current_value` is touched.
 *
 * Idempotent and side-effect-light: safe to call on page view (coach + player
 * development surfaces) AND from the nightly cron, so the bar is fresh whenever
 * anyone looks and still advances when nobody opens the app. Uses the admin
 * client (runs under a session OR headless); the explicit player_id filter is
 * the scoping guard.
 * ========================================================================== */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { loadActiveGoals } from '@/lib/coachhelm/v3/goals/loader';
import { evaluateGoal, type GoalSnapshot } from '@/lib/coachhelm/v3/goals/evaluator';
import {
  loadPlayerStandingMap,
  loadPlayersStandingMap,
} from '@/lib/coachhelm/v3/standing/loader';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import {
  loadPlayerWindowRounds,
  aggregateWindowMetric,
  isWindowedMetric,
  type WindowRound,
} from '@/lib/coachhelm/v3/goals/window-metric';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { MetricDirection, MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import {
  aggregateFocusMetric,
  isWindowableFocusMetric,
  findMetric,
  type FocusWindowRound,
} from '@/lib/coachhelm/focus-areas/catalog';
import { withAdminObserved } from '@/lib/admin/observed-action';

// ============================================================================
// GOAL PROGRESS
// ============================================================================

export interface GoalProgressSummary {
  /** Active goals examined. */
  evaluated: number;
  /** Goals whose snapshot/value/state was written this pass. */
  updated: number;
  /** Goals that flipped to `achieved` this pass. */
  achieved: number;
}

/**
 * Shared per-goal evaluation core. Runs the deterministic evaluator against the
 * player's latest standing for each goal and persists current_value + snapshots
 * + any terminal transition. Skips the write when nothing changed (`unchanged`)
 * so we never fabricate a reading. Returns counts only.
 */
async function evaluatePlayerGoals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  goals: Goal[],
  standing: Map<MetricId, PlayerStanding>,
  nowIso: string,
): Promise<{ updated: number; achieved: number }> {
  let updated = 0;
  let achieved = 0;
  if (goals.length === 0) return { updated, achieved };

  // Load this player's windowed rounds ONCE (covering the earliest goal start),
  // so each goal's in-progress value is measured over rounds played SINCE it
  // started — not the diluted all-time career average. Only when ≥1 goal is
  // windowable; one round query + one stats query regardless of goal count.
  const playerId = goals[0]!.player_id; // non-empty (guarded above)
  const windowable = goals.filter((g) => isWindowedMetric(g.metric_id));
  let windowRounds: WindowRound[] = [];
  if (windowable.length > 0) {
    // Earliest goal start (guarded non-empty), so one load covers every window.
    const earliest = windowable
      .map((g) => g.started_at)
      .reduce((min, s) => (s < min ? s : min));
    windowRounds = await loadPlayerWindowRounds(supabase, playerId, earliest);
  }

  for (const goal of goals) {
    const st = standing.get(goal.metric_id);
    // Observed value: prefer the goal-WINDOW value (rounds since it started) for
    // accurate in-progress tracking; fall back to the all-time standing when the
    // metric isn't windowable or no rounds have been played in the window yet
    // (then current ≈ baseline → the card honestly reads "not started").
    let observed = st?.player_value ?? null;
    if (isWindowedMetric(goal.metric_id)) {
      const startDate = goal.started_at.slice(0, 10);
      const inWindow = windowRounds.filter((r) => r.round_date >= startDate);
      const windowed = aggregateWindowMetric(goal.metric_id, inWindow);
      if (windowed !== null) observed = windowed;
    }
    const cfg = getMetricRenderConfig(goal.metric_id);
    const direction: MetricDirection =
      cfg?.direction === 'lower_better' ? 'lower_better' : 'higher_better';

    const result = evaluateGoal({
      target_value: goal.target_value,
      direction,
      ends_at: goal.ends_at,
      observed_value: observed,
      snapshots: (goal.snapshots ?? []) as GoalSnapshot[],
      team_avg: st?.team_avg ?? null,
    });

    // No observed reading and not lapsed → leave the goal untouched (never guess).
    if (result.unchanged) continue;

    const patch: Record<string, unknown> = {
      current_value: result.current_value,
      snapshots: result.snapshots,
      updated_at: nowIso,
    };
    // Only transition state on a terminal outcome; stay 'active' otherwise.
    if (result.state !== 'active') {
      patch.state = result.state;
      patch.outcome_evaluated_at = result.outcome_evaluated_at;
    }

    const { error } = await fromUntyped(supabase, 'golf_goals')
      .update(patch) // nosemgrep: helmv3-action-missing-revalidate -- invoked from server renders/cron, not cached routes
      .eq('id', goal.id);

    if (!error) {
      updated += 1;
      if (result.state === 'achieved') achieved += 1;
    }
  }

  return { updated, achieved };
}

/**
 * Evaluate + persist progress for every active goal of one player. Returns a
 * small summary (counts only) so callers can log/celebrate without re-querying.
 */
async function evaluateAndPersistGoalsImpl(playerId: string): Promise<GoalProgressSummary> {
  if (!playerId) return { evaluated: 0, updated: 0, achieved: 0 };

  const [goals, standing] = await Promise.all([
    loadActiveGoals(playerId),
    loadPlayerStandingMap(playerId),
  ]);
  if (goals.length === 0) return { evaluated: 0, updated: 0, achieved: 0 };

  const supabase = createAdminClient();
  const { updated, achieved } = await evaluatePlayerGoals(
    supabase,
    goals,
    standing,
    new Date().toISOString(),
  );
  return { evaluated: goals.length, updated, achieved };
}

const observedEvaluateAndPersistGoals = withAdminObserved(
  'evaluateAndPersistGoals',
  { sport: 'golf', feature: 'coachhelm_v3_goals' },
  evaluateAndPersistGoalsImpl,
);

export async function evaluateAndPersistGoals(playerId: string): Promise<GoalProgressSummary> {
  return observedEvaluateAndPersistGoals(playerId);
}

export interface BatchGoalProgressSummary extends GoalProgressSummary {
  /** Distinct players that had ≥1 active goal evaluated this pass. */
  players_with_goals: number;
}

/**
 * Batch variant — evaluate + persist progress for EVERY active goal across the
 * given players in one efficient pass (a single goals query + one chunked
 * standing read via loadPlayersStandingMap), instead of N single-player round
 * trips. Used by the standing-refresh cron (durable nightly progress, so a goal
 * moves even if nobody opens the app) and the coach development page (so the
 * coach sees fresh progress, not stale-since-the-player-last-looked).
 */
async function runGoalProgressForPlayersImpl(
  playerIds: string[],
): Promise<BatchGoalProgressSummary> {
  const empty: BatchGoalProgressSummary = {
    evaluated: 0,
    updated: 0,
    achieved: 0,
    players_with_goals: 0,
  };
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (ids.length === 0) return empty;

  const supabase = createAdminClient();

  // All active goals for these players (one query).
  const { data, error } = await fromUntyped(supabase, 'golf_goals')
    .select('*')
    .in('player_id', ids)
    .eq('state', 'active');
  if (error || !data) return empty;
  const goals = data as unknown as Goal[];
  if (goals.length === 0) return empty;

  // Batched standing for every player (chunked internally, gender-anchored).
  const standingByPlayer = await loadPlayersStandingMap(ids);

  const goalsByPlayer = new Map<string, Goal[]>();
  for (const g of goals) {
    const list = goalsByPlayer.get(g.player_id) ?? [];
    list.push(g);
    goalsByPlayer.set(g.player_id, list);
  }

  const nowIso = new Date().toISOString();
  let updated = 0;
  let achieved = 0;
  for (const [pid, playerGoals] of goalsByPlayer) {
    const standing = standingByPlayer.get(pid) ?? new Map<MetricId, PlayerStanding>();
    const res = await evaluatePlayerGoals(supabase, playerGoals, standing, nowIso);
    updated += res.updated;
    achieved += res.achieved;
  }

  return {
    evaluated: goals.length,
    updated,
    achieved,
    players_with_goals: goalsByPlayer.size,
  };
}

const observedRunGoalProgressForPlayers = withAdminObserved(
  'runGoalProgressForPlayers',
  { sport: 'golf', feature: 'coachhelm_v3_goals' },
  runGoalProgressForPlayersImpl,
);

export async function runGoalProgressForPlayers(playerIds: string[]): Promise<BatchGoalProgressSummary> {
  return observedRunGoalProgressForPlayers(playerIds);
}

// ============================================================================
// FOCUS-AREA PROGRESS
// ============================================================================

export interface FocusAreaProgressSummary {
  /** Active focus areas examined (windowable, with a target + start). */
  evaluated: number;
  /** Areas whose current_value was written this pass. */
  updated: number;
}

export interface BatchFocusAreaProgressSummary extends FocusAreaProgressSummary {
  /** Distinct players that had ≥1 windowable active focus area. */
  players_with_areas: number;
}

/** Minimal focus-area row this driver reads. */
interface ActiveFocusArea {
  id: string;
  player_id: string;
  target_metric: string | null;
  current_value: number | null;
  started_at: string | null;
}

/** golf_round_stats_cache columns we window, plus the round id to join dates. */
const STATS_SELECT =
  'round_id, total_score, total_putts, fairways_hit, fairways_total, greens_hit, ' +
  'greens_total, driving_distance_avg, scrambles_converted, scramble_attempts, ' +
  'sand_saves, sand_attempts';

function roundToMetric(metric: string | null, value: number): number {
  const decimals = findMetric(metric)?.decimals ?? 1;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Load every completed round (with the per-round stats we window) for the given
 * players on or after `sinceDate`. ONE rounds query + ONE stats query for the
 * whole batch; the caller date-filters per area in memory. Returns a map keyed
 * by player_id. Empty map on any error or no qualifying rounds (callers then
 * skip — current_value stays as-is).
 */
async function loadWindowRoundsByPlayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  playerIds: string[],
  sinceDate: string,
): Promise<Map<string, FocusWindowRound[]>> {
  const out = new Map<string, FocusWindowRound[]>();
  if (playerIds.length === 0) return out;

  const { data: rounds, error: rErr } = (await fromUntyped(supabase, 'golf_rounds')
    .select('id, player_id, round_date')
    .in('player_id', playerIds)
    .eq('status', 'completed')
    .gte('round_date', sinceDate)) as {
    data: { id: string; player_id: string; round_date: string | null }[] | null;
    error: unknown;
  };
  if (rErr || !rounds || rounds.length === 0) return out;

  const meta = new Map<string, { player_id: string; round_date: string }>();
  for (const r of rounds) {
    if (r.round_date) meta.set(r.id, { player_id: r.player_id, round_date: r.round_date });
  }
  const roundIds = [...meta.keys()];
  if (roundIds.length === 0) return out;

  const { data: stats, error: sErr } = (await fromUntyped(supabase, 'golf_round_stats_cache')
    .select(STATS_SELECT)
    .in('round_id', roundIds)) as {
    data: (Omit<FocusWindowRound, 'round_date'> & { round_id: string })[] | null;
    error: unknown;
  };
  if (sErr || !stats) return out;

  for (const { round_id, ...rest } of stats) {
    const m = meta.get(round_id);
    if (!m) continue;
    const list = out.get(m.player_id) ?? [];
    list.push({ round_date: m.round_date, ...rest });
    out.set(m.player_id, list);
  }
  return out;
}

/**
 * Core: window each area against its player's rounds-since-start and persist the
 * new current_value. Skips non-windowable metrics, areas with no target window
 * start, and any area whose window yields no value (no fabrication) or an
 * unchanged value (no-op write).
 */
async function evaluateAreas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  areas: ActiveFocusArea[],
  nowIso: string,
): Promise<{ evaluated: number; updated: number; players: Set<string> }> {
  const players = new Set<string>();
  let updated = 0;

  // Only areas we can actually window: have a start + a recognized windowable metric.
  const windowable = areas.filter(
    (a) => a.started_at && isWindowableFocusMetric(a.target_metric),
  );
  if (windowable.length === 0) {
    return { evaluated: 0, updated, players };
  }

  windowable.forEach((a) => players.add(a.player_id));

  // Earliest start across the batch → one rounds load covers every window.
  const earliest = windowable
    .map((a) => a.started_at!.slice(0, 10))
    .reduce((min, d) => (d < min ? d : min));

  const roundsByPlayer = await loadWindowRoundsByPlayer(
    supabase,
    [...players],
    earliest,
  );

  for (const area of windowable) {
    const startDate = area.started_at!.slice(0, 10);
    const playerRounds = roundsByPlayer.get(area.player_id) ?? [];
    const inWindow = playerRounds.filter((r) => r.round_date >= startDate);
    const raw = aggregateFocusMetric(area.target_metric, inWindow);
    if (raw == null) continue; // no usable rounds yet → leave current_value as-is

    const next = roundToMetric(area.target_metric, raw);
    if (area.current_value != null && area.current_value === next) continue; // no-op

    const { error } = await fromUntyped(supabase, 'golf_player_focus_areas')
      .update({ current_value: next, updated_at: nowIso }) // nosemgrep: helmv3-action-missing-revalidate -- invoked from server renders/cron, not cached routes
      .eq('id', area.id);
    if (!error) updated += 1;
  }

  return { evaluated: windowable.length, updated, players };
}

/**
 * Evaluate + persist progress for every active focus area across the given
 * players in one efficient pass. Used by the nightly standing-refresh cron and
 * the coach development page (so the coach sees fresh progress, not stale).
 */
async function runFocusAreaProgressForPlayersImpl(
  playerIds: string[],
): Promise<BatchFocusAreaProgressSummary> {
  const empty: BatchFocusAreaProgressSummary = {
    evaluated: 0,
    updated: 0,
    players_with_areas: 0,
  };
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (ids.length === 0) return empty;

  const supabase = createAdminClient();

  const { data, error } = (await fromUntyped(supabase, 'golf_player_focus_areas')
    .select('id, player_id, target_metric, current_value, started_at')
    .in('player_id', ids)
    .eq('status', 'active')) as { data: ActiveFocusArea[] | null; error: unknown };
  if (error || !data || data.length === 0) return empty;

  const { evaluated, updated, players } = await evaluateAreas(
    supabase,
    data,
    new Date().toISOString(),
  );
  return { evaluated, updated, players_with_areas: players.size };
}

const observedRunFocusAreaProgressForPlayers = withAdminObserved(
  'runFocusAreaProgressForPlayers',
  { sport: 'golf', feature: 'coachhelm_v3_goals' },
  runFocusAreaProgressForPlayersImpl,
);

export async function runFocusAreaProgressForPlayers(playerIds: string[]): Promise<BatchFocusAreaProgressSummary> {
  return observedRunFocusAreaProgressForPlayers(playerIds);
}

/**
 * Single-player variant — evaluate + persist progress for one player's active
 * focus areas. Used on the player My Development page view.
 */
async function evaluateAndPersistFocusAreasImpl(
  playerId: string,
): Promise<FocusAreaProgressSummary> {
  if (!playerId) return { evaluated: 0, updated: 0 };
  const { evaluated, updated } = await runFocusAreaProgressForPlayers([playerId]);
  return { evaluated, updated };
}

const observedEvaluateAndPersistFocusAreas = withAdminObserved(
  'evaluateAndPersistFocusAreas',
  { sport: 'golf', feature: 'coachhelm_v3_goals' },
  evaluateAndPersistFocusAreasImpl,
);

export async function evaluateAndPersistFocusAreas(playerId: string): Promise<FocusAreaProgressSummary> {
  return observedEvaluateAndPersistFocusAreas(playerId);
}
