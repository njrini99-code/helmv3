/**
 * Goal creation rules (audit row 20, 2026-09-28). Pure — no Supabase.
 *
 * 9 of 12 live goals for active players never showed progress, for three
 * reasons this module closes:
 *
 *  1. A goal could be set on a metric that is not tracked over the goal window
 *     (per-par scoring, putts by band, approach proximity, rough scrambling).
 *     Progress then read the ALL-TIME standing, which barely moves, so every
 *     daily snapshot repeated one number. Those metrics are refused.
 *  2. The baseline came from the all-time standing while progress is measured
 *     over the window, so baseline and current were different quantities. The
 *     baseline is now the same windowed aggregate over the player's rounds in
 *     the {@link PRE_START_BASELINE_DAYS} days before the goal starts.
 *  3. A target on the wrong side of the baseline (target 19.0 ft against a
 *     measured 18.72 ft, lower is better) was "achieved" the next day. A target
 *     must be strictly better than the baseline.
 */

import type { MetricDirection, MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { isWindowedMetric } from './window-metric-ids';
import { aggregateWindowMetric, type WindowRound } from './window-metric';

/** Days of play before the goal start that set its baseline. */
export const PRE_START_BASELINE_DAYS = 90;

export type GoalRuleError = 'metric_not_windowed' | 'target_not_better_than_baseline';

export const GOAL_RULE_MESSAGES: Record<GoalRuleError, string> = {
  metric_not_windowed:
    'Progress on this stat cannot be measured round by round yet. Pick a strokes-gained, greens, sand-save or penalty goal.',
  target_not_better_than_baseline:
    'The target must be better than where the player is now, or the goal is met on day one.',
};

/** Refuse a metric whose in-window value cannot be measured. */
export function checkGoalMetric(metricId: MetricId): GoalRuleError | null {
  return isWindowedMetric(metricId) ? null : 'metric_not_windowed';
}

/**
 * A target must sit strictly on the improving side of the baseline. With no
 * baseline (no rounds before the start) there is nothing to compare, so the
 * target stands.
 */
export function checkGoalTarget(args: {
  baseline: number | null;
  target: number | null;
  direction: MetricDirection;
}): GoalRuleError | null {
  const { baseline, target, direction } = args;
  if (baseline == null || target == null) return null;
  if (!Number.isFinite(baseline) || !Number.isFinite(target)) return null;
  const better = direction === 'lower_better' ? target < baseline : target > baseline;
  return better ? null : 'target_not_better_than_baseline';
}

/** Rounds in [start - days, start) — the window that sets the baseline. */
export function preStartRounds(
  rounds: readonly WindowRound[],
  startedAtIso: string,
  days = PRE_START_BASELINE_DAYS,
): WindowRound[] {
  const startDay = startedAtIso.slice(0, 10);
  const from = new Date(Date.parse(`${startDay}T00:00:00Z`) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return rounds.filter((r) => r.round_date >= from && r.round_date < startDay);
}

/**
 * The goal's baseline: the same windowed aggregate progress uses, over the
 * player's rounds before the start. Null when they played none (the card then
 * reads "baseline pending" instead of comparing unlike quantities).
 */
export function preStartBaseline(
  metricId: MetricId,
  rounds: readonly WindowRound[],
  startedAtIso: string,
  days = PRE_START_BASELINE_DAYS,
): number | null {
  if (!isWindowedMetric(metricId)) return null;
  return aggregateWindowMetric(metricId, preStartRounds(rounds, startedAtIso, days));
}
