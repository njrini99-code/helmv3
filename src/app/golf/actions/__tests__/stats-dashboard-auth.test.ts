import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const createResult = (name: string) =>
    vi.fn(async (playerId: string) => {
      const { getStatsActionContext } = await import('@/lib/golf/stats-action-context');
      const context = getStatsActionContext();
      if (!context || context.requestedPlayerId !== playerId) {
        throw new Error(`${name} ran without the shared stats context`);
      }
      return { source: name };
    });

  return {
    getUser: vi.fn(),
    getSession: vi.fn(),
    verifyPlayerAccess: vi.fn(),
    logServerException: vi.fn(async () => undefined),
    getDetailedStats: createResult('detailed'),
    getTrendAnalysis: createResult('trend'),
    getPlayerStandingRows: createResult('standing'),
    getPlayerLeakMaps: createResult('leak'),
    getSprayChartData: createResult('spray'),
    getPlayerStrengthsWeaknesses: createResult('strengthsWeaknesses'),
    getWorstHoleAnalysis: createResult('worstHoles'),
    getPlayerPatterns: createResult('patterns'),
  };
});

const supabase = {
  auth: {
    getUser: mocks.getUser,
    getSession: mocks.getSession,
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabase),
}));

vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: mocks.verifyPlayerAccess,
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: mocks.logServerException,
  logServerError: vi.fn(async () => undefined),
  logServerEvent: vi.fn(async () => undefined),
}));

vi.mock('../stats-data', () => ({
  getDetailedStats: mocks.getDetailedStats,
  getTrendAnalysis: mocks.getTrendAnalysis,
  getSprayChartData: mocks.getSprayChartData,
  getPlayerStrengthsWeaknesses: mocks.getPlayerStrengthsWeaknesses,
  getWorstHoleAnalysis: mocks.getWorstHoleAnalysis,
}));

vi.mock('../stats-leak-maps', () => ({
  getPlayerStandingRows: mocks.getPlayerStandingRows,
  getPlayerLeakMaps: mocks.getPlayerLeakMaps,
}));

vi.mock('../insights', () => ({
  getPlayerPatterns: mocks.getPlayerPatterns,
}));

import { getPlayerStatsDashboardBundle } from '../stats-dashboard';

const allReads = [
  mocks.getDetailedStats,
  mocks.getTrendAnalysis,
  mocks.getPlayerStandingRows,
  mocks.getPlayerLeakMaps,
  mocks.getSprayChartData,
  mocks.getPlayerStrengthsWeaknesses,
  mocks.getWorstHoleAnalysis,
  mocks.getPlayerPatterns,
];

describe('getPlayerStatsDashboardBundle auth boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'player@example.com' } },
      error: null,
    });
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.verifyPlayerAccess.mockResolvedValue({
      allowed: true,
      reason: 'self',
    });
  });

  it('performs one verified auth lookup and shares that context with all eight reads', async () => {
    const result = await getPlayerStatsDashboardBundle('player-1');

    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.verifyPlayerAccess).toHaveBeenCalledTimes(1);
    expect(mocks.verifyPlayerAccess).toHaveBeenCalledWith(
      'player-1',
      'user-1',
      supabase,
    );
    for (const read of allReads) expect(read).toHaveBeenCalledTimes(1);
    expect(Object.values(result).every((entry) => entry.ok)).toBe(true);
    expect(mocks.logServerException).not.toHaveBeenCalled();
  });

  it('settles an expected denial without running reads or emitting a Sentry exception', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const result = await getPlayerStatsDashboardBundle('player-1');

    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.verifyPlayerAccess).not.toHaveBeenCalled();
    for (const read of allReads) expect(read).not.toHaveBeenCalled();
    expect(Object.values(result)).toEqual(
      Array.from({ length: 8 }, () => ({ ok: false, reason: 'failed' })),
    );
    expect(mocks.logServerException).not.toHaveBeenCalled();
  });

  it('uses no second GoTrue attempt when the latency-bounded auth read is transient', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { name: 'TimeoutError', message: 'auth timed out' },
    });

    const result = await getPlayerStatsDashboardBundle('player-1');

    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.verifyPlayerAccess).not.toHaveBeenCalled();
    expect(Object.values(result).every((entry) => !entry.ok)).toBe(true);
  });

  it('runs the canonical access check once and starts no reads when it denies', async () => {
    mocks.verifyPlayerAccess.mockResolvedValueOnce({
      allowed: false,
      reason: 'denied',
    });

    const result = await getPlayerStatsDashboardBundle('player-1');

    expect(mocks.verifyPlayerAccess).toHaveBeenCalledTimes(1);
    for (const read of allReads) expect(read).not.toHaveBeenCalled();
    expect(Object.values(result).every((entry) => !entry.ok)).toBe(true);
    expect(mocks.logServerException).not.toHaveBeenCalled();
  });
});
