/**
 * v3 Goals evaluator (P1-07) — pure outcome + snapshot core.
 *
 * Goals were created but never measured: in production active goals had empty
 * snapshot arrays, null current values, and no outcome transitions. This module
 * provides the deterministic, side-effect-free core that:
 *
 *   - appends a dated snapshot of the player's current metric value, and
 *   - decides the goal's resulting state (active / achieved / missed) given a
 *     fresh observed value, the target, the metric direction, and the deadline.
 *
 * The pure core is exported so unit tests can drive it without Supabase. A
 * thin live driver (snapshot-after-round + daily repair) reads observed values
 * from the standing/stat loaders and persists the result via golf_goals; that
 * wiring is intentionally kept separate from this deterministic core.
 *
 * IMPORTANT (never present inferred values as observed fact): `current_value`
 * and every snapshot value carried here are OBSERVED metric readings sourced
 * from the player's real round data — not estimates. The evaluator never
 * fabricates a value; when no observed value is available it leaves the goal
 * untouched (see {@link evaluateGoal} returning `unchanged`).
 *
 * Spec: docs/v3-master-plan.md Part VI.5 — "Goal outcomes".
 */

import type { MetricDirection } from '@/lib/coachhelm/v3/metrics/registry';

/** A single dated reading appended to golf_goals.snapshots. */
export interface GoalSnapshot {
  /** ISO date (YYYY-MM-DD) the reading was taken. */
  date: string;
  /** OBSERVED metric value on that date (not inferred). */
  value: number;
  /** Optional team average on that date, when available. */
  team_avg?: number | null;
}

/** Terminal/active outcome of an evaluation pass over one goal. */
export type GoalEvaluationState = 'active' | 'achieved' | 'missed' | 'expired';

export interface EvaluateGoalInput {
  /** Goal target value (the number the player is aiming for). */
  target_value: number | null;
  /** Metric direction — decides whether "≥ target" or "≤ target" wins. */
  direction: MetricDirection;
  /** Deadline (ISO timestamp). */
  ends_at: string;
  /**
   * Latest OBSERVED metric value, or null when no reading is available. When
   * null the goal is left unchanged (we never guess a value).
   */
  observed_value: number | null;
  /** Existing snapshots already on the goal (chronological). */
  snapshots: GoalSnapshot[];
  /** Evaluation timestamp (defaults to now). Injected for deterministic tests. */
  now?: Date;
  /** Optional team average to record alongside the snapshot. */
  team_avg?: number | null;
}

export interface EvaluateGoalResult {
  /** Resulting goal state. */
  state: GoalEvaluationState;
  /** The current value to persist (the latest observed reading), or null. */
  current_value: number | null;
  /** Full snapshot array to persist (existing + at most one appended). */
  snapshots: GoalSnapshot[];
  /** Whether a new snapshot was appended this pass. */
  appended: boolean;
  /**
   * True when nothing observable changed (no observed value AND not past the
   * deadline) — the caller should skip the write entirely.
   */
  unchanged: boolean;
  /** When the outcome was decided (achieved/missed/expired), else null. */
  outcome_evaluated_at: string | null;
}

/** YYYY-MM-DD for a Date in UTC. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Direction-aware target satisfaction. For `higher_better`, the goal is met
 * when value ≥ target; for `lower_better`, when value ≤ target.
 */
export function meetsTarget(
  value: number,
  target: number,
  direction: MetricDirection,
): boolean {
  return direction === 'higher_better' ? value >= target : value <= target;
}

/**
 * Pure single-goal evaluation. Appends today's observed reading (deduped per
 * UTC day) and resolves the outcome:
 *
 *   - If a fresh observed value meets the target → `achieved`.
 *   - Else if past the deadline → `missed` (or `expired` when there is no
 *     target to measure against).
 *   - Else → `active`.
 *
 * Never fabricates a value: with no observed value and no deadline breach the
 * result is `unchanged` and the caller should not write.
 */
export function evaluateGoal(input: EvaluateGoalInput): EvaluateGoalResult {
  const now = input.now ?? new Date();
  const today = isoDate(now);
  const pastDeadline = new Date(input.ends_at).getTime() <= now.getTime();

  const hasObserved = input.observed_value != null && Number.isFinite(input.observed_value);

  // Nothing observable changed and the goal hasn't lapsed → no-op.
  if (!hasObserved && !pastDeadline) {
    return {
      state: 'active',
      current_value: lastValue(input.snapshots),
      snapshots: input.snapshots,
      appended: false,
      unchanged: true,
      outcome_evaluated_at: null,
    };
  }

  // Append an observed snapshot (one per UTC day — re-running same-day replaces
  // today's reading rather than stacking duplicates).
  let snapshots = input.snapshots;
  let appended = false;
  let currentValue = lastValue(input.snapshots);

  if (hasObserved) {
    const value = input.observed_value as number;
    currentValue = value;
    const withoutToday = input.snapshots.filter((s) => s.date !== today);
    snapshots = [
      ...withoutToday,
      { date: today, value, team_avg: input.team_avg ?? null },
    ];
    appended = true;
  }

  // Resolve outcome.
  let state: GoalEvaluationState = 'active';
  let outcomeAt: string | null = null;

  if (input.target_value != null && hasObserved &&
      meetsTarget(currentValue as number, input.target_value, input.direction)) {
    state = 'achieved';
    outcomeAt = now.toISOString();
  } else if (pastDeadline) {
    // Past deadline without hitting target. `missed` when we had a target to
    // measure; `expired` when there was nothing measurable to begin with.
    state = input.target_value != null ? 'missed' : 'expired';
    outcomeAt = now.toISOString();
  }

  return {
    state,
    current_value: currentValue,
    snapshots,
    appended,
    unchanged: false,
    outcome_evaluated_at: outcomeAt,
  };
}

/** Last recorded snapshot value, or null when there are none. */
function lastValue(snapshots: GoalSnapshot[]): number | null {
  if (snapshots.length === 0) return null;
  return snapshots[snapshots.length - 1]!.value;
}
