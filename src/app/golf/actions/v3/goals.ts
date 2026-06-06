'use server';

/**
 * v3 Goals server actions (W19).
 *
 * RLS handles authz; these actions resolve the auth user and write
 * through the standard server-side Supabase client.
 *
 * Soft-cap discipline: when a player creates a 6th active goal, the
 * action succeeds but returns `{ ok: true, warning: 'soft_cap_exceeded' }`
 * so the UI can surface a non-blocking warning per locked decision.
 */

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { ACTIVE_GOAL_SOFT_CAP } from '@/lib/coachhelm/v3/goals/types';
import type {
  GoalCoachAssignmentMode,
  GoalTargetSource,
} from '@/lib/coachhelm/v3/goals/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { isMetricId } from '@/lib/coachhelm/v3/metrics/registry';

export interface CreateGoalInput {
  metric_id: MetricId;
  title: string;
  category: string;
  ends_at: string; // ISO timestamp
  target_value: number | null;
  target_source: GoalTargetSource | null;
  baseline_value: number | null;
  shared_with_coach?: boolean;
  // Coach-only inputs:
  team_id?: string | null;
  player_id_if_coach_creating?: string;
  coach_assignment_mode?: GoalCoachAssignmentMode;
}

export interface ActionResult {
  ok: boolean;
  warning?: 'soft_cap_exceeded';
  error?: string;
  goal_id?: string;
}

/**
 * Create a goal. Either:
 *  - Player creating for themselves (player_id derived from auth)
 *  - Coach creating for a player (coach_id + player_id_if_coach_creating)
 */
export async function createGoal(input: CreateGoalInput): Promise<ActionResult> {
  try {
    if (!isMetricId(input.metric_id)) {
      return { ok: false, error: 'Unknown metric_id' };
    }

    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return { ok: false, error: 'Unauthorized' };

    // Resolve creator role + player/coach IDs from session.
    const { data: playerRow } = await supabase
      .from('golf_players')
      .select('id, user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: coachRow } = await supabase
      .from('golf_coaches')
      .select('id, user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let creator_role: 'player' | 'coach';
    let player_id: string;
    let coach_id_if_assigned: string | null;
    let team_id: string | null = input.team_id ?? null;

    if (coachRow && input.player_id_if_coach_creating) {
      creator_role = 'coach';
      player_id = input.player_id_if_coach_creating;
      coach_id_if_assigned = coachRow.id;
      if (!team_id) {
        return { ok: false, error: 'Coach-created goal requires team_id' };
      }
    } else if (playerRow) {
      creator_role = 'player';
      player_id = playerRow.id;
      coach_id_if_assigned = null;
      // Try to derive team_id from active membership when not provided.
      if (!team_id) {
        const { data: m } = await supabase
          .from('golf_team_members')
          .select('team_id')
          .eq('player_id', playerRow.id)
          .eq('status', 'active')
          .maybeSingle();
        team_id = m?.team_id ?? null;
      }
    } else {
      return { ok: false, error: 'Not a player or coach' };
    }

    // Soft-cap check (non-blocking)
    let warning: ActionResult['warning'];
    const { count } = await supabase
      .from('golf_goals')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', player_id)
      .eq('state', 'active');
    if ((count ?? 0) >= ACTIVE_GOAL_SOFT_CAP) {
      warning = 'soft_cap_exceeded';
    }

    const insertPayload = {
      player_id,
      team_id,
      created_by_user_id: user.id,
      creator_role,
      coach_id_if_assigned,
      metric_id: input.metric_id,
      title: input.title,
      category: input.category,
      ends_at: input.ends_at,
      baseline_value: input.baseline_value,
      current_value: input.baseline_value, // start equal; cron updates
      target_value: input.target_value,
      target_source: input.target_source,
      // Coach-mandatory goals are auto-accepted on insert
      coach_assignment_mode: creator_role === 'coach' ? (input.coach_assignment_mode ?? 'suggested') : null,
      player_accepted_at:
        creator_role === 'coach' && input.coach_assignment_mode === 'mandatory'
          ? new Date().toISOString()
          : null,
      shared_with_coach: input.shared_with_coach ?? false,
      shared_at: input.shared_with_coach ? new Date().toISOString() : null,
      origin: 'manual' as const,
    };

    const { data, error } = await supabase
      .from('golf_goals')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error || !data) {
      await logServerError(`createGoal failed: ${error?.message ?? 'no row'}`, {
        action: 'v3.goals.create',
      });
      return { ok: false, error: error?.message ?? 'Insert failed' };
    }

    revalidatePath('/golf/dashboard/my-development');
    revalidatePath('/golf/dashboard/coachhelm');
    return { ok: true, goal_id: data.id, warning };
  } catch (err) {
    await logServerError(
      `createGoal exception: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.goals.create' },
    );
    return { ok: false, error: 'Unexpected error' };
  }
}

/** Pause an active goal. Only the player or assigning coach can call. */
export async function pauseGoal(goalId: string): Promise<ActionResult> {
  return transitionGoal(goalId, 'paused');
}

/** Abandon a goal (player gave up). Records reason if provided. */
export async function abandonGoal(goalId: string, reason?: string): Promise<ActionResult> {
  return transitionGoal(goalId, 'abandoned', reason);
}

/** Resume a paused goal back to active. */
export async function resumeGoal(goalId: string): Promise<ActionResult> {
  return transitionGoal(goalId, 'active');
}

async function transitionGoal(
  goalId: string,
  newState: 'paused' | 'abandoned' | 'active',
  reason?: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const update: Record<string, unknown> = {
      state: newState,
      updated_at: new Date().toISOString(),
    };
    if (newState === 'abandoned' && reason) {
      update.player_decline_reason = reason;
      update.player_declined_at = new Date().toISOString();
    }

    const { error } = await fromUntyped(supabase, 'golf_goals')
      .update(update)
      .eq('id', goalId);

    if (error) {
      return { ok: false, error: error.message };
    }
    revalidatePath('/golf/dashboard/my-development');
    revalidatePath('/golf/dashboard/coachhelm');
    return { ok: true, goal_id: goalId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Accept an engine-suggested goal — creates a real goal + marks the
 * suggestion accepted.
 */
export async function acceptGoalSuggestion(
  suggestionId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { data: sug, error: sugErr } = await supabase
      .from('golf_goal_suggestions')
      .select('*')
      .eq('id', suggestionId)
      .maybeSingle();
    if (sugErr || !sug) return { ok: false, error: 'Suggestion not found' };
    if (sug.state !== 'pending') return { ok: false, error: 'Suggestion already acted on' };

    if (!isMetricId(sug.metric_id)) {
      return { ok: false, error: 'Suggestion references unknown metric_id' };
    }

    const endsAt = new Date(Date.now() + sug.suggested_window_days * 86400_000).toISOString();
    const createResult = await createGoal({
      metric_id: sug.metric_id as MetricId,
      title: `Goal — ${sug.metric_id}`,
      category: 'engine_suggested',
      ends_at: endsAt,
      target_value: sug.suggested_target_value,
      target_source: 'midpoint',
      baseline_value: null,
    });
    if (!createResult.ok) return createResult;

    await supabase
      .from('golf_goal_suggestions')
      .update({ state: 'accepted', acted_at: new Date().toISOString() })
      .eq('id', suggestionId);

    return createResult;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Dismiss a suggestion (player not interested). */
export async function dismissGoalSuggestion(
  suggestionId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { error } = await supabase
      .from('golf_goal_suggestions')
      .update({ state: 'dismissed', acted_at: new Date().toISOString() })
      .eq('id', suggestionId);
    if (error) return { ok: false, error: error.message };

    revalidatePath('/golf/dashboard/coachhelm');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
