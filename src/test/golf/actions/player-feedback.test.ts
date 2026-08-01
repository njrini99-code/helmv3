/**
 * Tests for rateInsightAsPlayer server action.
 *
 * Team D — Task D1. Verifies auth, ownership, upsert, and behavior-learner
 * invocation paths for the player feedback loop.
 *
 * DS-6 (2026-08-01): the action used to accept `supabaseOverride` /
 * `recorderOverride` as its 2nd and 3rd parameters, and these tests injected
 * through them. Every export of a `'use server'` module is a wire-callable
 * endpoint, so those seams were removed from the public signature. The tests
 * now drive the same paths through the module mocks below — `createClient`
 * for the Supabase client, `BehaviorLearner` for the learner fan-out — which
 * additionally exercises the real `buildDefaultRecorder` adapter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { learnFromInteractionSpy } = vi.hoisted(() => ({
  learnFromInteractionSpy: vi.fn().mockResolvedValue(undefined),
}));

// Mock the supabase server client so the module under test doesn't try to read
// cookies during import. Each test sets the client the action will receive.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

// Mock next/cache so revalidatePath is a harmless no-op in the test env.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock the BehaviorLearner so we don't hit the DB for the learner path.
// A real class, not vi.fn().mockImplementation(() => ({…})) — the action
// constructs the learner with `new`, and an arrow implementation is not a
// constructor.
vi.mock('@/lib/coachhelm/v2/learning/behavior-learner', () => {
  return {
    BehaviorLearner: class BehaviorLearnerMock {
      learnFromInteraction = learnFromInteractionSpy;
    },
  };
});

import { createClient } from '@/lib/supabase/server';
import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';

/** Point the action's `await createClient()` at this test's stub client. */
function useSupabase(client: unknown): void {
  vi.mocked(createClient).mockResolvedValue(client as never);
}

// Zod v4's uuid() requires a spec-compliant v1-v8 UUID (version nibble 1-8
// and 8/9/a/b variant bit). Use a proper v4 UUID for fixture data.
const VALID_UUID = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('rateInsightAsPlayer', () => {
  it('rejects unauthenticated users', async () => {
    useSupabase({
      auth: { getUser: async () => ({ data: { user: null } }) },
    });
    await expect(
      rateInsightAsPlayer({ insightId: VALID_UUID, rating: 'helpful' })
    ).rejects.toThrow(/unauthorized/i);
  });

  it('rejects when player record does not match auth user', async () => {
    useSupabase({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    });
    await expect(
      rateInsightAsPlayer({ insightId: VALID_UUID, rating: 'helpful' })
    ).rejects.toThrow(/player not found/i);
  });

  it('verifies the insight belongs to the authed player', async () => {
    useSupabase({
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
    });
    await expect(
      rateInsightAsPlayer({ insightId: VALID_UUID, rating: 'helpful' })
    ).rejects.toThrow(/forbidden/i);
  });

  it('upserts feedback row and fans the rating into the behavior learner', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    useSupabase({
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
    });

    const result = await rateInsightAsPlayer({
      insightId: VALID_UUID,
      rating: 'helpful',
      note: 'thanks coach',
    });

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
    expect(learnFromInteractionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'p1',
        entityType: 'player',
        interactionType: 'action',
        targetType: 'insight',
        targetId: VALID_UUID,
        metadata: expect.objectContaining({ insight_type: 'driving', rating: 'helpful' }),
      })
    );
  });

  it('rejects invalid rating values via Zod', async () => {
    useSupabase({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });
    await expect(
      // @ts-expect-error - intentional bad value
      rateInsightAsPlayer({ insightId: VALID_UUID, rating: 'lol' })
    ).rejects.toThrow();
  });

  it('rejects non-UUID insightId via Zod', async () => {
    useSupabase({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    });
    await expect(
      rateInsightAsPlayer({ insightId: 'not-a-uuid', rating: 'helpful' })
    ).rejects.toThrow();
  });
});
