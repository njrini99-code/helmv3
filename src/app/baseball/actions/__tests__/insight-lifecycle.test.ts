// =============================================================================
// Regression tests for #472: `baseball_coach_insights.coach_id` is a
// `baseball_coaches.id`, NOT the auth uid. dismissInsight / markInsightAddressed
// / submitInsightFeedback must resolve the caller's coach row first and compare
// AGAINST THAT — never against `user.id` directly (that comparison rejects
// every real coach since the two ids live in different domains).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  dismissInsight,
  markInsightAddressed,
  submitInsightFeedback,
  resolveCallerCoachId,
} from '@/app/baseball/actions/insights';

const OWNER_USER_ID = 'user-owner';
const OWNER_COACH_ID = 'coach-owner';
const OTHER_COACH_USER_ID = 'user-other-coach';
const OTHER_COACH_ID = 'coach-other';
const NO_COACH_USER_ID = 'user-no-coach';
const INSIGHT_ID = 'insight-1';

function tablesWithInsight(overrides: Record<string, unknown> = {}) {
  return {
    baseball_coaches: [
      { id: OWNER_COACH_ID, user_id: OWNER_USER_ID },
      { id: OTHER_COACH_ID, user_id: OTHER_COACH_USER_ID },
    ],
    baseball_coach_insights: [
      {
        id: INSIGHT_ID,
        coach_id: OWNER_COACH_ID,
        status: 'active',
        metadata: null,
        ...overrides,
      },
    ],
  };
}

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: OWNER_USER_ID } });
});

describe('resolveCallerCoachId', () => {
  it('returns the baseball_coaches.id for a user that has a coach row', async () => {
    fake = createFakeSupabase({
      user: { id: OWNER_USER_ID },
      tables: tablesWithInsight(),
    });
    const id = await resolveCallerCoachId(fake, OWNER_USER_ID);
    expect(id).toBe(OWNER_COACH_ID);
  });

  it('returns null when the user has no baseball_coaches row', async () => {
    fake = createFakeSupabase({
      user: { id: NO_COACH_USER_ID },
      tables: tablesWithInsight(),
    });
    const id = await resolveCallerCoachId(fake, NO_COACH_USER_ID);
    expect(id).toBeNull();
  });
});

describe('dismissInsight', () => {
  it('succeeds when insight.coach_id === the caller resolved coach id', async () => {
    fake = createFakeSupabase({ user: { id: OWNER_USER_ID }, tables: tablesWithInsight() });
    const result = await dismissInsight(INSIGHT_ID);
    expect(result.success).toBe(true);
  });

  it('returns Forbidden when the caller resolves to a DIFFERENT coach id', async () => {
    fake = createFakeSupabase({ user: { id: OTHER_COACH_USER_ID }, tables: tablesWithInsight() });
    const result = await dismissInsight(INSIGHT_ID);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Forbidden/);
  });

  it('returns Forbidden when the caller has no coach row at all', async () => {
    fake = createFakeSupabase({ user: { id: NO_COACH_USER_ID }, tables: tablesWithInsight() });
    const result = await dismissInsight(INSIGHT_ID);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Forbidden/);
  });
});

describe('markInsightAddressed', () => {
  it('succeeds when insight.coach_id === the caller resolved coach id', async () => {
    fake = createFakeSupabase({ user: { id: OWNER_USER_ID }, tables: tablesWithInsight() });
    const result = await markInsightAddressed(INSIGHT_ID);
    expect(result.success).toBe(true);
  });

  it('returns Forbidden when the caller resolves to a DIFFERENT coach id', async () => {
    fake = createFakeSupabase({ user: { id: OTHER_COACH_USER_ID }, tables: tablesWithInsight() });
    const result = await markInsightAddressed(INSIGHT_ID);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Forbidden/);
  });

  it('returns Forbidden when the caller has no coach row at all', async () => {
    fake = createFakeSupabase({ user: { id: NO_COACH_USER_ID }, tables: tablesWithInsight() });
    const result = await markInsightAddressed(INSIGHT_ID);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Forbidden/);
  });
});

describe('submitInsightFeedback', () => {
  it('succeeds when insight.coach_id === the caller resolved coach id', async () => {
    fake = createFakeSupabase({ user: { id: OWNER_USER_ID }, tables: tablesWithInsight() });
    const result = await submitInsightFeedback(INSIGHT_ID, 'helpful');
    expect(result.success).toBe(true);
  });

  it('returns Forbidden when the caller resolves to a DIFFERENT coach id', async () => {
    fake = createFakeSupabase({ user: { id: OTHER_COACH_USER_ID }, tables: tablesWithInsight() });
    const result = await submitInsightFeedback(INSIGHT_ID, 'helpful');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Forbidden/);
  });

  it('returns Forbidden when the caller has no coach row at all', async () => {
    fake = createFakeSupabase({ user: { id: NO_COACH_USER_ID }, tables: tablesWithInsight() });
    const result = await submitInsightFeedback(INSIGHT_ID, 'helpful');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Forbidden/);
  });
});
