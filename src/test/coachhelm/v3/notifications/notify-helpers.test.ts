/**
 * Audit row 53 — one tested helper per CoachHelm category that had no caller,
 * plus the resolved-insight path that never reached the dispatcher.
 * Every helper routes through dispatchCoachHelmNotification (prefs, quiet
 * mode, daily throttle) and never throws.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = {
  player_id: string;
  category: string;
  title: string;
  body: string;
  action_url?: string;
  data?: Record<string, unknown>;
  throttle_key?: string | null;
};
const calls: Call[] = [];
let throwNext = false;

vi.mock('@/lib/coachhelm/v3/notifications/dispatch', () => ({
  dispatchCoachHelmNotification: vi.fn(async (args: Call) => {
    if (throwNext) throw new Error('boom');
    calls.push(args);
    return { decision: { push: false, email: false, in_app: true, exempted_from_quiet: false }, throttled: false, in_app: true, push: false, email: false };
  }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));

import {
  notifyRoundReviewReady,
  notifyCoachCommented,
  notifyCoachAssignedGoal,
  notifyEngineSuggestedGoals,
  notifyGoalMissed,
  notifyCompositeInsight,
  notifyStandingPercentileChanged,
  notifyWeeklyDigest,
} from '@/lib/coachhelm/v3/notifications/notify';
import { notifyInsightResolved } from '@/lib/notifications/insight-notifier';

beforeEach(() => {
  calls.length = 0;
  throwNext = false;
});

describe('category helpers', () => {
  const cases: Array<[string, () => Promise<void>, string]> = [
    ['round_review_ready', () => notifyRoundReviewReady({ player_id: 'p1', round_id: 'r1' }), 'round_review_ready'],
    ['coach_commented', () => notifyCoachCommented({ player_id: 'p1', round_id: 'r1' }), 'coach_commented'],
    ['coach_assigned_goal', () => notifyCoachAssignedGoal({ player_id: 'p1', goal_id: 'g1', goal_title: 'Cut 3-putts' }), 'coach_assigned_goal'],
    ['engine_suggested_goal', () => notifyEngineSuggestedGoals({ player_id: 'p1', count: 2 }), 'engine_suggested_goal'],
    ['goal_missed', () => notifyGoalMissed({ player_id: 'p1', goal_id: 'g1', goal_title: 'Cut 3-putts' }), 'goal_missed'],
    ['composite_insight', () => notifyCompositeInsight({ player_id: 'p1', insight_id: 'i1' }), 'composite_insight'],
    ['standing_percentile_changed', () => notifyStandingPercentileChanged({ player_id: 'p1', direction: 'up' }), 'standing_percentile_changed'],
    ['weekly_digest', () => notifyWeeklyDigest({ player_id: 'p1' }), 'weekly_digest'],
  ];

  it.each(cases)('%s dispatches its own category with the category as throttle key', async (_n, run, category) => {
    await run();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ player_id: 'p1', category, throttle_key: category });
    expect(calls[0]!.title.length).toBeGreaterThan(0);
    expect(calls[0]!.action_url).toMatch(/^\/golf\//);
  });

  it.each(cases)('%s never throws when the dispatcher does', async (_n, run) => {
    throwNext = true;
    await expect(run()).resolves.toBeUndefined();
  });

  it('carries the entity ids the feed needs to expire a receipt', async () => {
    await notifyCompositeInsight({ player_id: 'p1', insight_id: 'i9' });
    expect(calls[0]!.data).toMatchObject({ insightId: 'i9' });
  });

  it('suggested-goal copy states the count', async () => {
    await notifyEngineSuggestedGoals({ player_id: 'p1', count: 1 });
    expect(calls[0]!.body).toContain('1 new goal');
    calls.length = 0;
    await notifyEngineSuggestedGoals({ player_id: 'p1', count: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe('notifyInsightResolved', () => {
  it('dispatches goal_achieved with the insight id, for writers that bypass upsertInsight', async () => {
    await notifyInsightResolved({ player_id: 'p1', insight_id: 'i1', category: 'putting' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      category: 'goal_achieved',
      throttle_key: 'insight_resolved',
      data: expect.objectContaining({ insightId: 'i1', kind: 'insight_resolved' }),
    });
    expect(calls[0]!.body).toContain('putting');
  });
});
