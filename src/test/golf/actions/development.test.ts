import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifyDevPlanAssigned: vi.fn().mockResolvedValue(undefined),
}));

const verifyPlayerAccessMock = vi.fn();
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) => verifyPlayerAccessMock(...args),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));

import {
  createFocusAreaFromInsight,
  updateFocusAreaProgress,
} from '@/app/golf/actions/development';

describe('createFocusAreaFromInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts with from_insight_id (NOT source_insight_id)', async () => {
    // Required since the 2026-05-23 audit added verifyPlayerAccess to
    // createFocusAreaFromInsight; without this the prod code reads
    // `undefined.allowed` and throws.
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });

    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: 'fa-1' }, error: null }),
      }),
    });

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: 'coach-1' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'golf_coach_insights') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { metadata: null, content: 'insight body' },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        if (table === 'golf_player_focus_areas') {
          return { insert: insertSpy };
        }
        return {};
      },
    });

    const result = await createFocusAreaFromInsight({
      insight_id: 'insight-1',
      player_id: 'player-1',
      coach_id: 'coach-1',
      title: 'Work on putts',
      description: null,
      insight_type: 'stat_regression',
    });

    expect(result.success).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const payload = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toBeDefined();
    expect(payload).toHaveProperty('from_insight_id', 'insight-1');
    expect(payload).not.toHaveProperty('source_insight_id');
  });
});

describe('updateFocusAreaProgress — ownership guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when verifyPlayerAccess denies', async () => {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: false, reason: 'denied' });

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { player_id: 'p-1' }, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: async () => ({ data: [{ id: 'fa-1' }], error: null }),
          }),
        }),
      }),
    });

    const result = await updateFocusAreaProgress('fa-1', 42);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/forbidden/i);
  });

  it('allows when verifyPlayerAccess grants', async () => {
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { player_id: 'p-1' }, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: async () => ({ data: [{ id: 'fa-1' }], error: null }),
          }),
        }),
      }),
    });

    const result = await updateFocusAreaProgress('fa-1', 42);
    expect(result.success).toBe(true);
  });
});
