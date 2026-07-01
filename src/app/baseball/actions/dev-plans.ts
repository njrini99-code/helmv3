'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Json } from '@/lib/types/database';
import { logServerError } from '@/lib/server-error-logger';
import { BaseballCapabilityError } from '@/lib/baseball/capabilities';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';

const DEV_PLAN_PATH = '/baseball/dashboard/dev-plan';

function mapDevPlanCoachError(error: unknown): never {
  if (error instanceof BaseballUnauthorizedError) {
    throw new Error('Not authenticated');
  }
  if (error instanceof BaseballNoActiveTeamError) {
    throw new Error('Coach profile not found');
  }
  if (error instanceof BaseballCapabilityError) {
    throw new Error('You do not have permission to modify this plan');
  }
  if (error instanceof BaseballActionError) {
    throw new Error('Something went wrong. Please try again.');
  }
  throw error;
}

// Goal status types
export type GoalStatus = 'not_started' | 'in_progress' | 'completed';

// Goal structure within the JSON field
export interface DevPlanGoal {
  id: string;
  title: string;
  description?: string;
  category?: string;
  progress: number; // 0-100
  status: GoalStatus;
  target_date?: string;
  coach_notes?: string;
  completed_at?: string;
  created_at: string;
}

// Full plan with typed goals
export interface DevelopmentalPlanWithGoals {
  id: string;
  player_id: string;
  team_id: string | null;
  coach_id: string;
  title: string;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  goals: DevPlanGoal[];
  created_at: string | null;
  updated_at: string | null;
  coach?: {
    id: string;
    full_name: string | null;
  } | null;
}

/**
 * Get a player's developmental plan(s)
 */
export async function getPlayerDevPlans(playerId: string): Promise<DevelopmentalPlanWithGoals[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('baseball_developmental_plans')
    .select(`
      *,
      coach:baseball_coaches(id, full_name)
    `)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error) {
    await logServerError(`Error fetching player dev plans: ${error instanceof Error ? error.message : String(error)}`, { action: 'dev_plans.getPlayerDevPlans' });
    throw error;
  }

  // Parse the goals JSON field
  return (data || []).map((plan) => ({
    ...plan,
    goals: parseGoals(plan.goals),
  }));
}

/**
 * Get a player's active developmental plan
 */
export async function getActiveDevPlan(playerId: string): Promise<DevelopmentalPlanWithGoals | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('baseball_developmental_plans')
    .select(`
      *,
      coach:baseball_coaches(id, full_name)
    `)
    .eq('player_id', playerId)
    .in('status', ['sent', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    await logServerError(`Error fetching active dev plan: ${error instanceof Error ? error.message : String(error)}`, { action: 'dev_plans.getActiveDevPlan' });
    throw error;
  }

  const row = data?.[0];
  if (!row) return null;

  return {
    ...row,
    goals: parseGoals(row.goals),
  };
}

/**
 * Verify the authenticated user is the player who owns the given plan.
 * Shared by every player-scoped goal mutation below (progress updates,
 * complete, uncomplete). Throws a user-friendly error on any failure.
 */
async function assertPlayerOwnsDevPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
  actionName: string
): Promise<{ goals: DevPlanGoal[] }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: playerProfile } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!playerProfile) throw new Error('Player profile not found');

  // Fetch current plan — include player_id for ownership check
  const { data: plan, error: fetchError } = await supabase
    .from('baseball_developmental_plans')
    .select('goals, player_id')
    .eq('id', planId)
    .single();

  if (fetchError) {
    await logServerError(`Error fetching plan: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`, { action: actionName });
    throw fetchError;
  }

  if (!plan || plan.player_id !== playerProfile.id) {
    throw new Error('You do not have permission to update this plan');
  }

  return { goals: parseGoals(plan.goals) };
}

/**
 * Persist a mutated goals array back onto the plan.
 */
async function saveDevPlanGoals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
  goals: DevPlanGoal[],
  actionName: string
): Promise<void> {
  const { error: updateError } = await supabase
    .from('baseball_developmental_plans')
    .update({
      goals: goals as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);

  if (updateError) {
    await logServerError(`Error saving goals: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: actionName });
    throw updateError;
  }

  revalidatePath(DEV_PLAN_PATH);
}

/**
 * Update a goal's progress (player can update their own goals)
 */
export async function updateGoalProgress(
  planId: string,
  goalId: string,
  progress: number
): Promise<void> {
  const supabase = await createClient();
  const { goals } = await assertPlayerOwnsDevPlan(supabase, planId, 'dev_plans.updateGoalProgress');

  const goalIndex = goals.findIndex((g) => g.id === goalId);
  if (goalIndex === -1 || !goals[goalIndex]) {
    throw new Error('Goal not found');
  }

  // Update the goal (preserve required fields explicitly)
  const goal = goals[goalIndex]!; // Non-null assertion after check
  const newProgress = Math.min(100, Math.max(0, progress));
  goals[goalIndex] = {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    category: goal.category,
    target_date: goal.target_date,
    coach_notes: goal.coach_notes,
    completed_at: newProgress >= 100 ? new Date().toISOString() : goal.completed_at,
    created_at: goal.created_at,
    progress: newProgress,
    status: newProgress >= 100 ? 'completed' : newProgress > 0 ? 'in_progress' : 'not_started',
  };

  await saveDevPlanGoals(supabase, planId, goals, 'dev_plans.updateGoalProgress');
}

/**
 * Mark a goal as complete (player-owned operation — the player marking
 * their own development-plan goal complete). Verifies the authenticated
 * user is the player who owns this plan before mutating.
 */
export async function completeGoalAsPlayer(
  planId: string,
  goalId: string
): Promise<void> {
  const supabase = await createClient();
  const { goals } = await assertPlayerOwnsDevPlan(supabase, planId, 'dev_plans.completeGoalAsPlayer');

  const goalIndex = goals.findIndex((g) => g.id === goalId);
  const currentGoal = goals[goalIndex];
  if (!currentGoal) {
    throw new Error('Goal not found');
  }

  goals[goalIndex] = {
    id: currentGoal.id,
    title: currentGoal.title,
    description: currentGoal.description,
    category: currentGoal.category,
    target_date: currentGoal.target_date,
    coach_notes: currentGoal.coach_notes,
    created_at: currentGoal.created_at,
    progress: 100,
    status: 'completed',
    completed_at: new Date().toISOString(),
  };

  await saveDevPlanGoals(supabase, planId, goals, 'dev_plans.completeGoalAsPlayer');
}

/**
 * Unmark a goal as complete — set back to in progress (player-owned
 * operation). Verifies the authenticated user is the player who owns
 * this plan before mutating.
 */
export async function uncompleteGoalAsPlayer(
  planId: string,
  goalId: string
): Promise<void> {
  const supabase = await createClient();
  const { goals } = await assertPlayerOwnsDevPlan(supabase, planId, 'dev_plans.uncompleteGoalAsPlayer');

  const goalIndex = goals.findIndex((g) => g.id === goalId);
  const currentGoal = goals[goalIndex];
  if (!currentGoal) {
    throw new Error('Goal not found');
  }

  goals[goalIndex] = {
    id: currentGoal.id,
    title: currentGoal.title,
    description: currentGoal.description,
    category: currentGoal.category,
    target_date: currentGoal.target_date,
    coach_notes: currentGoal.coach_notes,
    created_at: currentGoal.created_at,
    progress: 90,
    status: 'in_progress',
    completed_at: undefined,
  };

  await saveDevPlanGoals(supabase, planId, goals, 'dev_plans.uncompleteGoalAsPlayer');
}

/**
 * Mark a goal as complete (coach-only operation)
 */
export async function completeGoal(
  planId: string,
  goalId: string
): Promise<void> {
  try {
    await completeGoalAction(planId, goalId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'dev_plans.completeGoal', featureArea: 'baseball-dev-plans' },
    );
    mapDevPlanCoachError(error);
  }
}

const completeGoalAction = withBaseballAction(
  'completeGoal',
  { featureArea: 'baseball-dev-plans', requiredCapability: 'can_manage_settings' },
  async (ctx, planId: string, goalId: string): Promise<void> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) throw new Error('Coach profile not found');

    const { data: plan, error: fetchError } = await supabase
      .from('baseball_developmental_plans')
      .select('goals, coach_id')
      .eq('id', planId)
      .single();

    if (!fetchError && plan && plan.coach_id !== coachId) {
      throw new Error('You do not have permission to modify this plan');
    }

    if (fetchError) {
      await logServerError(`Error fetching plan: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`, { action: 'dev_plans.completeGoal' });
      throw fetchError;
    }

    const goals = parseGoals(plan.goals);
    const goalIndex = goals.findIndex((g) => g.id === goalId);
    const currentGoal = goals[goalIndex];

    if (!currentGoal) {
      throw new Error('Goal not found');
    }

    goals[goalIndex] = {
      id: currentGoal.id,
      title: currentGoal.title,
      description: currentGoal.description,
      category: currentGoal.category,
      target_date: currentGoal.target_date,
      coach_notes: currentGoal.coach_notes,
      created_at: currentGoal.created_at,
      progress: 100,
      status: 'completed',
      completed_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('baseball_developmental_plans')
      .update({
        goals: goals as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId);

    if (updateError) {
      await logServerError(`Error completing goal: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'dev_plans.completeGoal' });
      throw updateError;
    }

    revalidatePath(DEV_PLAN_PATH);
  },
);

/**
 * Unmark a goal as complete — set back to in progress (coach-only operation)
 */
export async function uncompleteGoal(
  planId: string,
  goalId: string
): Promise<void> {
  try {
    await uncompleteGoalAction(planId, goalId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'dev_plans.uncompleteGoal', featureArea: 'baseball-dev-plans' },
    );
    mapDevPlanCoachError(error);
  }
}

const uncompleteGoalAction = withBaseballAction(
  'uncompleteGoal',
  { featureArea: 'baseball-dev-plans', requiredCapability: 'can_manage_settings' },
  async (ctx, planId: string, goalId: string): Promise<void> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) throw new Error('Coach profile not found');

    const { data: plan, error: fetchError } = await supabase
      .from('baseball_developmental_plans')
      .select('goals, coach_id')
      .eq('id', planId)
      .single();

    if (!fetchError && plan && plan.coach_id !== coachId) {
      throw new Error('You do not have permission to modify this plan');
    }

    if (fetchError) {
      await logServerError(`Error fetching plan: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`, { action: 'dev_plans.uncompleteGoal' });
      throw fetchError;
    }

    const goals = parseGoals(plan.goals);
    const goalIndex = goals.findIndex((g) => g.id === goalId);
    const currentGoal = goals[goalIndex];

    if (!currentGoal) {
      throw new Error('Goal not found');
    }

    goals[goalIndex] = {
      id: currentGoal.id,
      title: currentGoal.title,
      description: currentGoal.description,
      category: currentGoal.category,
      target_date: currentGoal.target_date,
      coach_notes: currentGoal.coach_notes,
      created_at: currentGoal.created_at,
      progress: 90,
      status: 'in_progress',
      completed_at: undefined,
    };

    const { error: updateError } = await supabase
      .from('baseball_developmental_plans')
      .update({
        goals: goals as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId);

    if (updateError) {
      await logServerError(`Error uncompleting goal: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'dev_plans.uncompleteGoal' });
      throw updateError;
    }

    revalidatePath(DEV_PLAN_PATH);
  },
);

// Helper to parse goals from JSON
function parseGoals(goalsJson: Json | null): DevPlanGoal[] {
  if (!goalsJson) return [];
  if (Array.isArray(goalsJson)) {
    return goalsJson
      .filter((g): g is Record<string, Json | undefined> => 
        typeof g === 'object' && g !== null && !Array.isArray(g)
      )
      .map((g) => ({
        id: String(g.id || crypto.randomUUID()),
        title: String(g.title || 'Untitled Goal'),
        description: g.description ? String(g.description) : undefined,
        category: g.category ? String(g.category) : undefined,
        progress: typeof g.progress === 'number' ? g.progress : 0,
        status: validateGoalStatus(g.status),
        target_date: g.target_date ? String(g.target_date) : undefined,
        coach_notes: g.coach_notes ? String(g.coach_notes) : undefined,
        completed_at: g.completed_at ? String(g.completed_at) : undefined,
        created_at: g.created_at ? String(g.created_at) : new Date().toISOString(),
      }));
  }
  return [];
}

function validateGoalStatus(status: unknown): GoalStatus {
  if (status === 'completed' || status === 'in_progress' || status === 'not_started') {
    return status;
  }
  return 'not_started';
}
