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
