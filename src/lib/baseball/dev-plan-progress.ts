/**
 * Dev-plan progress — honest computation from real goal data.
 *
 * The HS team dashboards previously fabricated per-player development progress
 * with Math.random(). The real data lives in the JSONB `goals` column of
 * `baseball_developmental_plans` (see actions/dev-plans.ts `DevPlanGoal`). This
 * module derives progress from those goals so coaches see truth, and exposes a
 * `goals_tracked` flag so the UI can render an honest "not tracked yet" state
 * for plans that have no goals entered (instead of a fake 0% / random bar).
 *
 * Pure + dependency-free so it can be unit-tested and shared across the
 * client dashboards without pulling in server-only Supabase code.
 */

import { getFullName } from '@/lib/utils';

/** A goal as it may appear in the raw JSONB. We read defensively. */
interface RawGoal {
  status?: unknown;
  progress?: unknown;
}

/** Minimal shape of a dev-plan row needed to compute progress. */
export interface DevPlanRowForProgress {
  player_id: string;
  goals: unknown;
  player: { first_name: string | null; last_name: string | null } | null;
}

export interface DevPlanProgress {
  player_id: string;
  player_name: string;
  total_goals: number;
  completed_goals: number;
  progress_percentage: number;
  /**
   * False when the plan has zero goals entered. When false, the UI must show an
   * honest "progress not tracked yet" state rather than a 0/0 or 0% bar that
   * reads as real, measured progress.
   */
  goals_tracked: boolean;
}

function isCompleted(goal: RawGoal): boolean {
  if (goal.status === 'completed') return true;
  // A goal at 100% progress is complete even if status was never written.
  return typeof goal.progress === 'number' && goal.progress >= 100;
}

function clampProgress(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Compute honest progress for a single plan from its `goals` JSONB.
 * `progress_percentage` is the mean of per-goal progress (0–100), rounded.
 */
export function computeDevPlanProgress(plan: DevPlanRowForProgress): DevPlanProgress {
  const goals: RawGoal[] = Array.isArray(plan.goals)
    ? (plan.goals as unknown[]).filter(
        (g): g is RawGoal => typeof g === 'object' && g !== null && !Array.isArray(g),
      )
    : [];

  const totalGoals = goals.length;
  const completedGoals = goals.filter(isCompleted).length;

  // Mean of per-goal progress gives a smoother signal than completed/total
  // (a goal at 60% counts as 60%, not 0). Falls back to 0 with no goals.
  const progressPercentage =
    totalGoals > 0
      ? Math.round(
          goals.reduce((sum, g) => sum + clampProgress(g.progress), 0) / totalGoals,
        )
      : 0;

  return {
    player_id: plan.player_id,
    player_name: getFullName(plan.player?.first_name, plan.player?.last_name),
    total_goals: totalGoals,
    completed_goals: completedGoals,
    progress_percentage: progressPercentage,
    goals_tracked: totalGoals > 0,
  };
}

/**
 * Build the dashboard progress list from raw plan rows. Sorts goal-tracked
 * plans first (most actionable) so the sidebar surfaces real signal, then
 * caps to `limit`.
 */
export function buildDevPlanProgress(
  plans: DevPlanRowForProgress[],
  limit = 5,
): DevPlanProgress[] {
  return plans
    .map(computeDevPlanProgress)
    .sort((a, b) => {
      // Tracked plans first; among tracked, higher progress first.
      if (a.goals_tracked !== b.goals_tracked) return a.goals_tracked ? -1 : 1;
      return b.progress_percentage - a.progress_percentage;
    })
    .slice(0, limit);
}
