'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Json } from '@/lib/types/database';
import { logServerError } from '@/lib/server-error-logger';
import { BaseballCapabilityError } from '@/lib/baseball/capabilities';
import { isBaseballDemoCoachEmail } from '@/lib/demo/baseball-config.server';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';
import type {
  GoalStatus,
  DevPlanGoal,
  DevelopmentalPlanWithGoals,
  DevPlanWithPlayer,
} from '@/lib/baseball/dev-plan-types';
import { describeError } from '@/lib/utils/describe-error';

// The canonical definitions live in the plain (non-'use server')
// `dev-plan-types` module — import them from there directly.
//
// They are deliberately NOT re-exported here: in a 'use server' module the
// transform registers every name in an `export type { … }` specifier list
// as a server action, so the emitted module evaluates a runtime reference
// to a type that does not exist and every action in the file throws
// `ReferenceError` at module evaluation.

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

/**
 * Get a player's developmental plan(s)
 */
async function getPlayerDevPlansImpl(playerId: string): Promise<DevelopmentalPlanWithGoals[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('baseball_developmental_plans')
    .select(`
      *,
      coach:baseball_coaches(id, full_name)
    `)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error) {
    await logServerError(`Error fetching player dev plans: ${describeError(error)}`, { action: 'dev_plans.getPlayerDevPlans' });
    throw error;
  }

  // Parse the goals JSON field, lazily backfilling+persisting any missing
  // `id` so a subsequent complete/uncomplete mutation resolves to the same
  // id the UI was handed here (see parseGoalsAndPersistIds).
  return Promise.all(
    (data || []).map(async (plan) => ({
      ...plan,
      goals: await parseGoalsAndPersistIds(supabase, plan.id, plan.goals),
    })),
  );
}

/**
 * Get a player's active developmental plan
 */
async function getActiveDevPlanImpl(playerId: string): Promise<DevelopmentalPlanWithGoals | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

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
    await logServerError(`Error fetching active dev plan: ${describeError(error)}`, { action: 'dev_plans.getActiveDevPlan' });
    throw error;
  }

  const row = data?.[0];
  if (!row) return null;

  return {
    ...row,
    goals: await parseGoalsAndPersistIds(supabase, row.id, row.goals),
  };
}

/**
 * Get a single developmental plan for the coach detail view
 * (`/baseball/dashboard/dev-plans/[id]`). Coach-ownership-checked: only the
 * coach who created the plan may view/mutate it here. Returns fully parsed,
 * normalized goals (stable `id`/`status`/`progress`) so the detail page can
 * key off `goal.id` and the coach-side complete/uncomplete actions round-trip
 * correctly instead of hitting the "Goal not found" schema-schism bug.
 */
export async function getDevPlanForCoach(planId: string): Promise<DevPlanWithPlayer> {
  try {
    return await getDevPlanForCoachAction(planId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'dev_plans.getDevPlanForCoach', featureArea: 'baseball-dev-plans' },
    );
    mapDevPlanCoachError(error);
  }
}

const getDevPlanForCoachAction = withBaseballAction(
  'getDevPlanForCoach',
  {
    featureArea: 'baseball-dev-plans',
    // No requiredCapability: dev plans are gated by OWNERSHIP (coach_id ===
    // ctx.activeCoachId, enforced in the body below), not by a team-settings
    // permission. 'can_manage_settings' governs team configuration, not
    // player development — gating on it meant any assistant coach without
    // that unrelated permission (the default for non-primary/non-head
    // staff) could create a plan (nav-registry shows this route to every
    // coach; CreateDevPlanModal's insert has no capability check) and then
    // be 403'd viewing/completing the very plan they just made. See the
    // matching fix on completeGoal/uncompleteGoal below.
    //
    // Read-only (a single .select().single(), no mutation) so it's safe for
    // the shared BaseballHelm demo coach session — without this the demo
    // coach gets BaseballDemoReadOnlyError on every /dev-plans/[id] detail
    // page it can navigate to from the (unguarded) dev-plans list page.
    demoSafe: true,
  },
  async (ctx, planId: string): Promise<DevPlanWithPlayer> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) throw new Error('Coach profile not found');

    const { data: plan, error: fetchError } = await supabase
      .from('baseball_developmental_plans')
      .select(`
        *,
        player:baseball_players (
          id,
          first_name,
          last_name,
          avatar_url,
          primary_position,
          grad_year
        )
      `)
      .eq('id', planId)
      .single();

    if (fetchError) {
      await logServerError(`Error fetching plan: ${describeError(fetchError)}`, { action: 'dev_plans.getDevPlanForCoach' });
      throw fetchError;
    }

    if (!plan || plan.coach_id !== coachId) {
      throw new Error('You do not have permission to view this plan');
    }

    // demoSafe means this action must never write — skip the id backfill
    // persist for the shared demo coach session (it still gets stable,
    // freshly-minted ids for the current read; they just aren't written
    // back, matching the "no state visible to other visitors" guarantee).
    const isDemo = isBaseballDemoCoachEmail(ctx.user.email);

    return {
      ...plan,
      goals: await parseGoalsAndPersistIds(supabase, plan.id, plan.goals, { persist: !isDemo }),
    };
  },
);

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
    await logServerError(`Error fetching plan: ${describeError(fetchError)}`, { action: actionName });
    throw fetchError;
  }

  if (!plan || plan.player_id !== playerProfile.id) {
    throw new Error('You do not have permission to update this plan');
  }

  return { goals: await parseGoalsAndPersistIds(supabase, planId, plan.goals) };
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
    await logServerError(`Error saving goals: ${describeError(updateError)}`, { action: actionName });
    throw updateError;
  }

  revalidatePath(DEV_PLAN_PATH);
}

/**
 * Update a goal's progress (player can update their own goals)
 */
async function updateGoalProgressImpl(
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
async function completeGoalAsPlayerImpl(
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
async function uncompleteGoalAsPlayerImpl(
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
      `Unexpected error: ${describeError(error)}`,
      { action: 'dev_plans.completeGoal', featureArea: 'baseball-dev-plans' },
    );
    mapDevPlanCoachError(error);
  }
}

const completeGoalAction = withBaseballAction(
  'completeGoal',
  // No requiredCapability: see getDevPlanForCoachAction above — this is
  // gated by the plan.coach_id === coachId ownership check below, not by
  // the unrelated 'can_manage_settings' (team-settings) permission.
  { featureArea: 'baseball-dev-plans' },
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
      await logServerError(`Error fetching plan: ${describeError(fetchError)}`, { action: 'dev_plans.completeGoal' });
      throw fetchError;
    }

    const goals = await parseGoalsAndPersistIds(supabase, planId, plan.goals);
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
      await logServerError(`Error completing goal: ${describeError(updateError)}`, { action: 'dev_plans.completeGoal' });
      throw updateError;
    }

    revalidatePath(DEV_PLAN_PATH);
    revalidatePath('/baseball/dashboard/dev-plans');
    revalidatePath(`/baseball/dashboard/dev-plans/${planId}`);
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
      `Unexpected error: ${describeError(error)}`,
      { action: 'dev_plans.uncompleteGoal', featureArea: 'baseball-dev-plans' },
    );
    mapDevPlanCoachError(error);
  }
}

const uncompleteGoalAction = withBaseballAction(
  'uncompleteGoal',
  // No requiredCapability: see getDevPlanForCoachAction above — this is
  // gated by the plan.coach_id === coachId ownership check below, not by
  // the unrelated 'can_manage_settings' (team-settings) permission.
  { featureArea: 'baseball-dev-plans' },
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
      await logServerError(`Error fetching plan: ${describeError(fetchError)}`, { action: 'dev_plans.uncompleteGoal' });
      throw fetchError;
    }

    const goals = await parseGoalsAndPersistIds(supabase, planId, plan.goals);
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
      await logServerError(`Error uncompleting goal: ${describeError(updateError)}`, { action: 'dev_plans.uncompleteGoal' });
      throw updateError;
    }

    revalidatePath(DEV_PLAN_PATH);
    revalidatePath('/baseball/dashboard/dev-plans');
    revalidatePath(`/baseball/dashboard/dev-plans/${planId}`);
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

/**
 * Parse a plan's `goals` JSONB column, lazily backfilling and PERSISTING any
 * missing `id` so it survives round-trips.
 *
 * Root cause this fixes: before goal ids were persisted at creation time
 * (see `CreateDevPlanModal.handleSubmit`), `goals` rows in the database were
 * stored with no `id` field at all. `parseGoals()` alone mints a brand-new
 * random id on *every* call — so a goal id captured by one read (e.g. the
 * page render) never matches the id a later, independent read computes
 * inside `completeGoalAction`/`uncompleteGoalAction`/`assertPlayerOwnsDevPlan`,
 * and the mutation always throws "Goal not found" for any plan whose goals
 * predate that fix.
 *
 * This backfills once per plan: the first read after this change generates
 * stable ids for any goal missing one and writes the FULL parsed array back
 * with a plain `.update()` on the existing row (never delete-then-insert —
 * see the hard rule against destructive save paths). Every subsequent
 * read/mutation then sees the same, already-persisted ids straight out of
 * `parseGoals()`, so no further writes happen and the ids never change again.
 *
 * `persist: false` opts a caller out of the write (kept in-memory only) —
 * used by `getDevPlanForCoachAction`, which is marked `demoSafe: true` for
 * the shared BaseballHelm demo coach session and therefore must never
 * perform a mutation a visitor could trigger.
 */
async function parseGoalsAndPersistIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
  goalsJson: Json | null,
  options: { persist?: boolean } = {},
): Promise<DevPlanGoal[]> {
  const { persist = true } = options;

  if (!goalsJson || !Array.isArray(goalsJson)) {
    return parseGoals(goalsJson);
  }

  const rawGoals = goalsJson.filter(
    (g): g is Record<string, Json | undefined> =>
      typeof g === 'object' && g !== null && !Array.isArray(g),
  );
  const hasMissingId = rawGoals.some((g) => !g.id);

  const goals = parseGoals(goalsJson);

  if (persist && hasMissingId && goals.length > 0) {
    const { error: backfillError } = await supabase
      .from('baseball_developmental_plans')
      .update({ goals: goals as unknown as Json })
      .eq('id', planId);

    if (backfillError) {
      await logServerError(
        `Error backfilling goal ids: ${describeError(backfillError)}`,
        { action: 'dev_plans.parseGoalsAndPersistIds' },
      );
      // Non-fatal: the caller still gets goals with freshly-minted ids so
      // the current request succeeds; the backfill is simply retried on the
      // next read of this plan.
    }
  }

  return goals;
}

function validateGoalStatus(status: unknown): GoalStatus {
  if (status === 'completed' || status === 'in_progress' || status === 'not_started') {
    return status;
  }
  return 'not_started';
}

export const getPlayerDevPlans = withAdminObserved(
  'getPlayerDevPlans',
  { sport: 'baseball', feature: 'baseball_dev_plans', featureArea: 'baseball-dev-plans' },
  getPlayerDevPlansImpl,
);

export const getActiveDevPlan = withAdminObserved(
  'getActiveDevPlan',
  { sport: 'baseball', feature: 'baseball_dev_plans', featureArea: 'baseball-dev-plans' },
  getActiveDevPlanImpl,
);

export const updateGoalProgress = withAdminObserved(
  'updateGoalProgress',
  { sport: 'baseball', feature: 'baseball_dev_plans', featureArea: 'baseball-dev-plans' },
  updateGoalProgressImpl,
);

export const completeGoalAsPlayer = withAdminObserved(
  'completeGoalAsPlayer',
  { sport: 'baseball', feature: 'baseball_dev_plans', featureArea: 'baseball-dev-plans' },
  completeGoalAsPlayerImpl,
);

export const uncompleteGoalAsPlayer = withAdminObserved(
  'uncompleteGoalAsPlayer',
  { sport: 'baseball', feature: 'baseball_dev_plans', featureArea: 'baseball-dev-plans' },
  uncompleteGoalAsPlayerImpl,
);
