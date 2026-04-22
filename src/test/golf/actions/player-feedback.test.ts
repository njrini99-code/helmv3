/**
 * Tests for rateInsightAsPlayer server action.
 *
 * Team D — Task D1. Verifies auth, ownership, upsert, and behavior-learner
 * invocation paths for the player feedback loop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase server client so the module under test doesn't try
// to read cookies during import. Tests inject their own client via the
// supabaseOverride parameter.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

// Mock next/cache so revalidatePath is a harmless no-op in the test env.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock the BehaviorLearner so we don't hit the DB for the learner path.
vi.mock('@/lib/coachhelm/v2/learning/behavior-learner', () => {
  return {
    BehaviorLearner: vi.fn().mockImplementation(() => ({
      recordInteraction: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';

// Zod v4's uuid() requires a spec-compliant v1-v8 UUID (version nibble 1-8
// and 8/9/a/b variant bit). Use a proper v4 UUID for fixture data.
const VALID_UUID = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('rateInsightAsPlayer', () => {
  it('rejects unauthenticated users', async () => {
    const supabaseMock = {
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as unknown;
    await expect(
      rateInsightAsPlayer({ insightId: VALID_UUID, rating: 'helpful' }, supabaseMock as never)
    ).rejects.toThrow(/unauthorized/i);
  });

  it('rejects when player record does not match auth user', async () => {
    const supabaseMock = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    } as unknown;
    await expect(
      rateInsightAsPlayer({ insightId: VALID_UUID, rating: 'helpful' }, supabaseMock as never)
    ).rejects.toThrow(/player not found/i);
  });

  it('verifies the insight belongs to the authed player', async () => {
    const supabaseMock = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'golf_players') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1' }, error: null }) }),
            }),
          };
        }
        if (table === 'golf_coach_insights') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { player_id: 'p-stranger', metadata: {} }, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown;
    await expect(
      rateInsightAsPlayer({ insightId: VALID_UUID, rating: 'helpful' }, supabaseMock as never)
    ).rejects.toThrow(/forbidden/i);
  });

  it('upserts feedback row and calls BehaviorLearner.recordInteraction', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const recordSpy = vi.fn().mockResolvedValue(undefined);
    const supabaseMock = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'golf_players') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1' }, error: null }) }),
            }),
          };
        }
        if (table === 'golf_coach_insights') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () =>
                  ({ data: { player_id: 'p1', metadata: { insight_type: 'driving' } }, error: null }),
              }),
            }),
          };
        }
        if (table === 'golf_insight_player_feedback') {
          return { upsert: upsertSpy };
        }
        return {};
      }),
    } as unknown;

    const result = await rateInsightAsPlayer(
      { insightId: VALID_UUID, rating: 'helpful', note: 'thanks coach' },
      supabaseMock as never,
      { recordInteraction: recordSpy } as never
    );

    expect(result).toEqual({ success: true });
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const firstCall = upsertSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall![0]).toMatchObject({
      insight_id: VALID_UUID,
      player_id: 'p1',
      rating: 'helpful',
      note: 'thanks coach',
    });
    expect(recordSpy).toHaveBeenCalledWith({
      interaction_type: 'insight_rated_helpful',
      target_type: 'insight',
      target_id: VALID_UUID,
      metadata: expect.objectContaining({ insight_type: 'driving', rating: 'helpful' }),
    });
  });

  it('rejects invalid rating values via Zod', async () => {
    const supabaseMock = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    } as unknown;
    await expect(
      // @ts-expect-error - intentional bad value
      rateInsightAsPlayer({ insightId: VALID_UUID, rating: 'lol' }, supabaseMock as never)
    ).rejects.toThrow();
  });

  it('rejects non-UUID insightId via Zod', async () => {
    const supabaseMock = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    } as unknown;
    await expect(
      rateInsightAsPlayer({ insightId: 'not-a-uuid', rating: 'helpful' }, supabaseMock as never)
    ).rejects.toThrow();
  });
});
