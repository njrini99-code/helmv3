import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyTeamAccess: vi.fn().mockResolvedValue({ allowed: true, reason: 'coach' }),
  verifyPlayerAccess: vi.fn().mockResolvedValue({ allowed: true, reason: 'coach' }),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));

import {
  getInsightEffectiveness,
  getPatternImpact,
} from '@/app/golf/actions/coachhelm-analytics';

describe('coachhelm-analytics — error surfacing (no silent mock fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getInsightEffectiveness returns success:false when the effectiveness query errors', async () => {
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => ({
              lte: () => ({
                order: async () => ({ data: null, error: { message: 'simulated', code: 'PG42P01' } }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await getInsightEffectiveness('team-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/simulated/);
  });

  it('getPatternImpact returns success:false when the patterns query errors', async () => {
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'golf_team_members') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: [{ player_id: 'p-1' }], error: null }),
              }),
            }),
          };
        }
        if (table === 'golf_patterns_v2') {
          return {
            select: () => ({
              in: () => ({
                gte: async () => ({ data: null, error: { message: 'pattern query broke', code: 'XX' } }),
              }),
            }),
          };
        }
        return { select: () => ({}) };
      },
    });

    const result = await getPatternImpact('team-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/pattern query broke/);
  });

  it('getInsightEffectiveness returns Forbidden when verifyTeamAccess denies', async () => {
    const { verifyTeamAccess } = await import('@/lib/auth/verify-player-access');
    (verifyTeamAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      reason: 'denied',
    });

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
      from: () => ({ select: () => ({}) }),
    });

    const result = await getInsightEffectiveness('team-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
  });
});
