/**
 * v3 Goals types.
 *
 * Mirror of public.golf_goals (W18) + public.golf_goal_suggestions (W19).
 * Stable surface for consumers (server actions, loader, UI).
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

export type GoalState =
  | 'active'
  | 'paused'
  | 'achieved'
  | 'missed'
  | 'partial'
  | 'abandoned'
  | 'pending_baseline';

export type GoalCreatorRole = 'player' | 'coach';

export type GoalCoachAssignmentMode = 'mandatory' | 'suggested';

export type GoalOrigin = 'manual' | 'engine_suggested' | 'from_insight';

export type GoalTargetSource = 'manual' | 'team_avg' | 'pga_value' | 'midpoint';

export interface Goal {
  id: string;
  player_id: string;
  team_id: string | null;
  created_by_user_id: string;
  creator_role: GoalCreatorRole;
  coach_id_if_assigned: string | null;

  metric_id: MetricId;
  title: string;
  category: string;

  started_at: string;
  ends_at: string;
  window_days: number;

  baseline_value: number | null;
  current_value: number | null;
  target_value: number | null;
  target_source: GoalTargetSource | null;

  state: GoalState;
  outcome_evaluated_at: string | null;

  shared_with_coach: boolean;
  shared_at: string | null;

  coach_assignment_mode: GoalCoachAssignmentMode | null;
  player_accepted_at: string | null;
  player_declined_at: string | null;

  origin: GoalOrigin;
  origin_insight_id: string | null;

  snapshots: Array<{ date: string; value: number; team_avg?: number | null }>;

  created_at: string;
  updated_at: string;
}

export type GoalSuggestionState = 'pending' | 'accepted' | 'dismissed' | 'snoozed' | 'expired';

export interface GoalSuggestion {
  id: string;
  player_id: string;
  metric_id: MetricId;
  suggested_at: string;
  suggested_target_value: number | null;
  suggested_window_days: number;
  origin_insight_id: string | null;
  state: GoalSuggestionState;
  acted_at: string | null;
  snooze_until: string | null;
  expires_at: string;
}

/** Soft cap on active goals per player. Enforced at app layer; UI warns. */
export const ACTIVE_GOAL_SOFT_CAP = 5;

/**
 * Bounds of a goal window, mirroring the `golf_goals_window_range` CHECK
 * (`window_days >= 7 AND window_days <= 365`).
 *
 * `window_days` itself is GENERATED ALWAYS from `ends_at - started_at`, so the
 * only way to keep the CHECK satisfied is to control that span — see
 * `resolveGoalWindow`.
 */
export const GOAL_WINDOW_MIN_DAYS = 7;
export const GOAL_WINDOW_MAX_DAYS = 365;

export interface ResolvedGoalWindow {
  started_at: string;
  ends_at: string;
  window_days: number;
}

/**
 * Turn a requested end date into a span the DB will accept.
 *
 * Two constraints make the naive `{ ends_at }`-only insert unreliable:
 *
 *  1. `window_days` is GENERATED ALWAYS — writing it at all fails the whole
 *     insert with `cannot insert a non-DEFAULT value into column
 *     "window_days"`, regardless of the value.
 *  2. The generated expression is `EXTRACT(day FROM (ends_at - started_at))`,
 *     which TRUNCATES, and `started_at` defaults to `now()` *at insert time*.
 *     A caller computing `ends_at = clientNow + 7 days` therefore yields a
 *     span of 6d23h59m by the time the row lands, so `EXTRACT(day)` is 6 and
 *     the `>= 7` CHECK rejects it. Any network latency — or a client clock a
 *     few hundred ms ahead — is enough.
 *
 * Pinning `started_at` ourselves and rebuilding `ends_at` as an exact multiple
 * of 24h from it makes the generated value deterministic: timestamptz
 * subtraction of an exact 86_400s multiple is exactly `N days, 00:00:00`.
 */
export function resolveGoalWindow(
  requestedEndsAt: string,
  now: Date = new Date(),
): { ok: true; window: ResolvedGoalWindow } | { ok: false; error: string } {
  const requestedMs = new Date(requestedEndsAt).getTime();
  if (!Number.isFinite(requestedMs)) {
    return { ok: false, error: 'Goal end date is not a valid date' };
  }

  const windowDays = Math.round((requestedMs - now.getTime()) / 86_400_000);
  if (windowDays < GOAL_WINDOW_MIN_DAYS || windowDays > GOAL_WINDOW_MAX_DAYS) {
    return {
      ok: false,
      error: `Goal window must be between ${GOAL_WINDOW_MIN_DAYS} and ${GOAL_WINDOW_MAX_DAYS} days`,
    };
  }

  return {
    ok: true,
    window: {
      started_at: now.toISOString(),
      ends_at: new Date(now.getTime() + windowDays * 86_400_000).toISOString(),
      window_days: windowDays,
    },
  };
}
