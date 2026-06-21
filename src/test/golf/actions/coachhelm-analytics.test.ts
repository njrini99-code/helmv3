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
  getPredictionPerformance,
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

  // P070 — the hero sentence "X% of N resolved proved accurate" must pair a
  // rate and a count drawn from the SAME rolling-snapshot window. Previously
  // overallAccuracy averaged accuracy_rate across ALL snapshots while
  // validatedPredictions used only the latest snapshot — two denominators.
  it('getPredictionPerformance reports overallAccuracy and validatedPredictions from the same (latest) window', async () => {
    const snapshots = [
      { period_end: '2026-06-01', accuracy_rate: 0.40, predictions_made: 10, predictions_validated: 6, mean_absolute_error: 0.2, overconfidence_rate: 0.1, underconfidence_rate: 0.1, calibration_score: 0.5, accuracy_by_confidence: {}, error_distribution: {} },
      { period_end: '2026-06-15', accuracy_rate: 0.60, predictions_made: 12, predictions_validated: 8, mean_absolute_error: 0.2, overconfidence_rate: 0.1, underconfidence_rate: 0.1, calibration_score: 0.5, accuracy_by_confidence: {}, error_distribution: {} },
      { period_end: '2026-06-29', accuracy_rate: 0.80, predictions_made: 14, predictions_validated: 10, mean_absolute_error: 0.2, overconfidence_rate: 0.1, underconfidence_rate: 0.1, calibration_score: 0.5, accuracy_by_confidence: {}, error_distribution: {} },
    ];

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => ({
              order: async () => ({ data: snapshots, error: null }),
            }),
          }),
        }),
      }),
    });

    const result = await getPredictionPerformance('team-1');
    expect(result.success).toBe(true);
    // Both must come from the LATEST snapshot (0.80 accuracy, 10 validated),
    // NOT the all-snapshot average (which would be (0.4+0.6+0.8)/3 = 0.60).
    expect(result.data?.summary.overallAccuracy).toBe(0.8);
    expect(result.data?.summary.validatedPredictions).toBe(10);
    expect(result.data?.summary.overallAccuracy).not.toBe(0.6);
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
