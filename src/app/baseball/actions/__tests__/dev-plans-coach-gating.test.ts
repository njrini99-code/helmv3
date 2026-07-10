// =============================================================================
// Regression test: dev-plan coach actions must be gated by PLAN OWNERSHIP
// (coach_id === ctx.activeCoachId), not by the unrelated 'can_manage_settings'
// (team-settings) capability.
//
// THE BUG: getDevPlanForCoach/completeGoal/uncompleteGoal all required
// 'can_manage_settings' via withBaseballAction — but the Dev Plans nav entry
// has no capability gate and CreateDevPlanModal's insert has no capability
// check either, so ANY coach (including a non-primary/non-head assistant
// coach, who defaults to can_manage_settings: false) could create a plan and
// then be 403'd trying to view or complete a goal on the very plan they just
// made, unless a head coach separately granted them an unrelated team-
// settings permission.
//
// THE FIX: drop requiredCapability from these three actions and rely on the
// ownership check already present in each body (plan.coach_id !== coachId).
// These tests lock BOTH halves of that contract:
//   1. A capability-less coach who OWNS the plan can view/complete/uncomplete.
//   2. A coach who does NOT own the plan is still rejected (ownership check
//      alone remains a real gate — this isn't a capability free-for-all).
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let activeCoachId = 'coach-owner';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => ({
    userId: 'user-1',
    activeTeamId: 'team-1',
    activeRole: 'coach' as const,
    activeCoachId,
    activePlayerId: null,
    fellBackFromStale: false,
  })),
}));

vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
  isBaseballDemoCoachEmail: vi.fn(() => false),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => undefined),
  logServerError: vi.fn(async () => undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getDevPlanForCoach, completeGoal, uncompleteGoal } from '@/app/baseball/actions/dev-plans';

const GOAL = {
  id: 'goal-1',
  title: 'Improve exit velocity',
  progress: 0,
  status: 'not_started' as const,
  created_at: '2026-01-01T00:00:00.000Z',
};

function seedPlan() {
  fake = createFakeSupabase({
    user: { id: 'user-1', email: 'coach@example.edu' },
    tables: {
      baseball_developmental_plans: [
        { id: 'plan-1', coach_id: 'coach-owner', player_id: 'player-1', goals: [GOAL] },
      ],
    },
  });
}

beforeEach(() => {
  activeCoachId = 'coach-owner';
  seedPlan();
});

describe('dev-plan coach actions — ownership gating, not team-settings capability (#508-style)', () => {
  it('getDevPlanForCoach succeeds for a capability-less coach who OWNS the plan', async () => {
    const plan = await getDevPlanForCoach('plan-1');
    expect(plan.id).toBe('plan-1');
    expect(plan.goals[0]?.id).toBe('goal-1');
  });

  it('getDevPlanForCoach still rejects a coach who does NOT own the plan', async () => {
    // Asserts on rejection, not a specific message: withBaseballAction's
    // catch-all sanitizes any non-whitelisted thrown Error (including the
    // action body's own "You do not have permission..." message) into a
    // generic BaseballActionError before mapDevPlanCoachError ever sees it —
    // a pre-existing, separate quirk outside this fix's scope. What matters
    // here is that ownership alone (with NO capability check at all) still
    // hard-blocks a non-owning coach.
    activeCoachId = 'coach-other';
    await expect(getDevPlanForCoach('plan-1')).rejects.toThrow();
  });

  it('completeGoal succeeds for a capability-less coach who OWNS the plan', async () => {
    await expect(completeGoal('plan-1', 'goal-1')).resolves.toBeUndefined();

    const { data } = await fake
      .from('baseball_developmental_plans')
      .select('*')
      .eq('id', 'plan-1')
      .single();
    const goals = (data as { goals: Array<{ id: string; status: string; progress: number }> }).goals;
    expect(goals[0]?.status).toBe('completed');
    expect(goals[0]?.progress).toBe(100);
  });

  it('completeGoal still rejects a coach who does NOT own the plan, and leaves the goal untouched', async () => {
    activeCoachId = 'coach-other';
    await expect(completeGoal('plan-1', 'goal-1')).rejects.toThrow();

    const { data } = await fake
      .from('baseball_developmental_plans')
      .select('*')
      .eq('id', 'plan-1')
      .single();
    const goals = (data as { goals: Array<{ id: string; status: string }> }).goals;
    expect(goals[0]?.status).toBe('not_started');
  });

  it('uncompleteGoal succeeds for a capability-less coach who OWNS the plan', async () => {
    await expect(uncompleteGoal('plan-1', 'goal-1')).resolves.toBeUndefined();

    const { data } = await fake
      .from('baseball_developmental_plans')
      .select('*')
      .eq('id', 'plan-1')
      .single();
    const goals = (data as { goals: Array<{ id: string; status: string; progress: number }> }).goals;
    expect(goals[0]?.status).toBe('in_progress');
  });
});
