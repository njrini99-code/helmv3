'use server';

/**
 * ============================================================================
 * Goal progress driver (P1-07 live wiring) — makes "track progress" actually work
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
import { withAdminObserved } from '@/lib/admin/observed-action';

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
