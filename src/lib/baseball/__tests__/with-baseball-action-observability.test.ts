import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({
    data: { user: { id: 'user-123', email: 'coach@example.edu' } },
  })),
  getActiveBaseballContext: vi.fn(async () => ({
    userId: 'user-123',
    activeTeamId: 'team-123',
    activeRole: 'coach' as const,
    activeCoachId: 'coach-123',
    activePlayerId: null,
    fellBackFromStale: false,
  })),
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
  logServerException: vi.fn(async (..._args: unknown[]) => undefined),
  scope: {
    setTag: vi.fn(),
    setUser: vi.fn(),
    addBreadcrumb: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: mocks.getActiveBaseballContext,
}));

vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: mocks.isCurrentSessionBaseballDemo,
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: mocks.logServerException,
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: typeof mocks.scope) => unknown) => fn(mocks.scope),
}));

import {
  BaseballActionError,
  BaseballNoActiveTeamError,
  withBaseballAction,
} from '../with-baseball-action';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'user-123', email: 'coach@example.edu' } },
  });
  mocks.getActiveBaseballContext.mockResolvedValue({
    userId: 'user-123',
    activeTeamId: 'team-123',
    activeRole: 'coach',
    activeCoachId: 'coach-123',
    activePlayerId: null,
    fellBackFromStale: false,
  });
  mocks.isCurrentSessionBaseballDemo.mockResolvedValue(false);
});

describe('withBaseballAction observability', () => {
  it('logs unexpected failures with Helm Bridge Baseball tracing context', async () => {
    const action = withBaseballAction(
      'saveBaseballPractice',
      {
        feature: 'baseball_practice',
        featureArea: 'baseball-practice',
        requiredCapability: 'can_manage_practice',
      },
      async () => {
        throw new Error('database write failed');
      },
    );

    await expect(action()).rejects.toBeInstanceOf(BaseballActionError);

    expect(mocks.scope.setTag).toHaveBeenCalledWith('sport', 'baseball');
    expect(mocks.scope.setTag).toHaveBeenCalledWith('feature', 'baseball_practice');
    expect(mocks.scope.setTag).toHaveBeenCalledWith('feature_area', 'baseball-practice');
    expect(mocks.logServerException).toHaveBeenCalledTimes(1);

    const [error, context] = mocks.logServerException.mock.calls[0]! as unknown[];
    expect(error).toBeInstanceOf(Error);
    expect(context).toMatchObject({
      action: 'saveBaseballPractice',
      feature: 'baseball_practice',
      featureArea: 'baseball-practice',
      sport: 'baseball',
      teamId: 'team-123',
      userId: 'user-123',
      userEmail: 'coach@example.edu',
      source: 'server_action',
      handled: false,
      fingerprint: ['server_action', 'baseball_practice', 'saveBaseballPractice'],
      tags: {
        sport: 'baseball',
        feature: 'baseball_practice',
        feature_area: 'baseball-practice',
        baseball_role: 'coach',
        baseball_team: 'team-123',
        baseball_target_team: 'team-123',
        baseball_capability: 'can_manage_practice',
      },
      metadata: {
        activeTeamId: 'team-123',
        targetTeamId: 'team-123',
        activeRole: 'coach',
        activeCoachId: 'coach-123',
        activePlayerId: null,
        requiredCapability: 'can_manage_practice',
        requiredPlayerAccess: null,
        requireActiveContext: true,
        demoSafe: false,
      },
    });
  });

  it('logs expected context failures as handled Baseball warnings', async () => {
    mocks.getActiveBaseballContext.mockResolvedValue(null as never);
    const action = withBaseballAction(
      'loadBaseballDashboard',
      { featureArea: 'baseball-dashboard' },
      async () => ({ ok: true }),
    );

    await expect(action()).rejects.toBeInstanceOf(BaseballNoActiveTeamError);

    expect(mocks.logServerException).toHaveBeenCalledTimes(1);
    const [error, context, severity] = mocks.logServerException.mock.calls[0]! as unknown[];
    expect(error).toBeInstanceOf(BaseballNoActiveTeamError);
    expect(severity).toBe('warning');
    expect(context).toMatchObject({
      action: 'loadBaseballDashboard',
      feature: 'baseball-dashboard',
      featureArea: 'baseball-dashboard',
      sport: 'baseball',
      teamId: null,
      userId: 'user-123',
      userEmail: 'coach@example.edu',
      handled: true,
      skipSentry: true,
      tags: {
        sport: 'baseball',
        feature: 'baseball-dashboard',
        feature_area: 'baseball-dashboard',
      },
    });
  });
});
