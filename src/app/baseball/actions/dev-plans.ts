'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Json } from '@/lib/types/database.types';

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
    console.error('Error fetching player dev plans:', error);
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
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No active plan found
      return null;
    }
    console.error('Error fetching active dev plan:', error);
    throw error;
  }

  return {
    ...data,
    goals: parseGoals(data.goals),
  };
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

  // Fetch current plan
  const { data: plan, error: fetchError } = await supabase
    .from('baseball_developmental_plans')
    .select('goals')
    .eq('id', planId)
    .single();

  if (fetchError) {
    console.error('Error fetching plan:', fetchError);
    throw fetchError;
  }

  const goals = parseGoals(plan.goals);
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
    completed_at: goal.completed_at,
    created_at: goal.created_at,
    progress: newProgress,
    status: newProgress >= 100 ? 'completed' : newProgress > 0 ? 'in_progress' : 'not_started',
  };

  // Save back
  const { error: updateError } = await supabase
    .from('baseball_developmental_plans')
    .update({
      goals: goals as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);

  if (updateError) {
    console.error('Error updating goal progress:', updateError);
    throw updateError;
  }

  revalidatePath('/baseball/dashboard/dev-plan');
}

/**
 * Mark a goal as complete
 */
export async function completeGoal(
  planId: string,
  goalId: string
): Promise<void> {
  const supabase = await createClient();

  // Fetch current plan
  const { data: plan, error: fetchError } = await supabase
    .from('baseball_developmental_plans')
    .select('goals')
    .eq('id', planId)
    .single();

  if (fetchError) {
    console.error('Error fetching plan:', fetchError);
    throw fetchError;
  }

  const goals = parseGoals(plan.goals);
  const goalIndex = goals.findIndex((g) => g.id === goalId);
  const currentGoal = goals[goalIndex];
  
  if (!currentGoal) {
    throw new Error('Goal not found');
  }

  // Mark complete (preserve required fields explicitly)
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

  // Save back
  const { error: updateError } = await supabase
    .from('baseball_developmental_plans')
    .update({
      goals: goals as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);

  if (updateError) {
    console.error('Error completing goal:', updateError);
    throw updateError;
  }

  revalidatePath('/baseball/dashboard/dev-plan');
}

/**
 * Unmark a goal as complete (set back to in progress)
 */
export async function uncompleteGoal(
  planId: string,
  goalId: string
): Promise<void> {
  const supabase = await createClient();

  // Fetch current plan
  const { data: plan, error: fetchError } = await supabase
    .from('baseball_developmental_plans')
    .select('goals')
    .eq('id', planId)
    .single();

  if (fetchError) {
    console.error('Error fetching plan:', fetchError);
    throw fetchError;
  }

  const goals = parseGoals(plan.goals);
  const goalIndex = goals.findIndex((g) => g.id === goalId);
  const currentGoal = goals[goalIndex];
  
  if (!currentGoal) {
    throw new Error('Goal not found');
  }

  // Unmark complete (preserve required fields explicitly)
  goals[goalIndex] = {
    id: currentGoal.id,
    title: currentGoal.title,
    description: currentGoal.description,
    category: currentGoal.category,
    target_date: currentGoal.target_date,
    coach_notes: currentGoal.coach_notes,
    created_at: currentGoal.created_at,
    progress: 90, // Set to 90% so it's close but not complete
    status: 'in_progress',
    completed_at: undefined,
  };

  // Save back
  const { error: updateError } = await supabase
    .from('baseball_developmental_plans')
    .update({
      goals: goals as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);

  if (updateError) {
    console.error('Error uncompleting goal:', updateError);
    throw updateError;
  }

  revalidatePath('/baseball/dashboard/dev-plan');
}

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
