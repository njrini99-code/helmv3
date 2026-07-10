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
  logServerError: vi.fn(async (..._args: unknown[]) => undefined),
  logServerEvent: vi.fn(async (..._args: unknown[]) => undefined),
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
  logServerError: mocks.logServerError,
  logServerEvent: mocks.logServerEvent,
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: typeof mocks.scope) => unknown) => fn(mocks.scope),
}));

import {
  BaseballActionError,
  BaseballNoActiveTeamError,
  withBaseballAction,
} from '../with-baseball-action';
// Intentionally NOT mocked (see the "RLS-denial capture" describe block
// below) — the real isRlsDenial/maybeCaptureRlsDenial logic is exercised
// against the (real) `logServerEvent` mock above.
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';

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
      feature: 'baseball_dashboard',
      featureArea: 'baseball-dashboard',
      sport: 'baseball',
      teamId: null,
      userId: 'user-123',
      userEmail: 'coach@example.edu',
      handled: true,
      skipSentry: true,
      tags: {
        sport: 'baseball',
        feature: 'baseball_dashboard',
        feature_area: 'baseball-dashboard',
      },
    });
  });

  it('logs { success: false } soft failures to Helm Bridge without throwing', async () => {
    const action = withBaseballAction(
      'uploadBaseballDocument',
      { featureArea: 'baseball-documents', feature: 'baseball_documents' },
      async () => ({ success: false as const, error: 'Storage bucket unavailable' }),
    );

    const result = await action();
    expect(result).toEqual({ success: false, error: 'Storage bucket unavailable' });
    expect(mocks.logServerException).not.toHaveBeenCalled();
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);

    const softCall = mocks.logServerError.mock.calls[0] as
      | [string, Record<string, unknown> | undefined, 'warning' | 'error' | 'critical']
      | undefined;
    expect(softCall?.[0]).toBe('Storage bucket unavailable');
    expect(softCall?.[2]).toBe('error');
    expect(softCall?.[1]).toMatchObject({
      action: 'uploadBaseballDocument',
      sport: 'baseball',
      feature: 'baseball_documents',
      source: 'server_action',
      handled: true,
    });
  });
});

// =============================================================================
// Wrapper-level RLS-denial capture (with-baseball-action.ts:506-517).
//
// This branch was previously untested here: the module mock above didn't
// even export `logServerEvent` (the function `maybeCaptureRlsDenial` calls),
// so any RLS-shaped throw silently no-op'd inside `maybeCaptureRlsDenial`'s
// try/catch instead of asserting anything. `@/lib/admin/rls-denial` is
// intentionally left UNMOCKED below so the real `isRlsDenial` /
// `maybeCaptureRlsDenial` logic runs against our (now real) `logServerEvent`
// mock.
// =============================================================================

describe('withBaseballAction RLS-denial capture', () => {
  it('fires the generic fallback (table=featureArea, verb=rpc) when the action body throws an RLS-shaped error directly', async () => {
    const action = withBaseballAction(
      'recomputeDynamicGroup',
      { featureArea: 'baseball-lifting', feature: 'baseball_lifting' },
      async () => {
        throw { code: '42501', message: 'new row violates row-level security policy' };
      },
    );

    await expect(action()).rejects.toBeInstanceOf(BaseballActionError);

    const rlsCalls = mocks.logServerEvent.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].startsWith('RLS denial:'),
    );
    expect(rlsCalls).toHaveLength(1);
    expect(rlsCalls[0]?.[0]).toBe('RLS denial: rpc on baseball-lifting');
  });

  it('does not double-fire when the action body already captured a precise denial and rethrows a generic BaseballActionError', async () => {
    // Mirrors the fixed logSetResult pattern (lifting-v11.ts) and
    // watchlist.ts's addToWatchlist: capture a precise denial at the swallow
    // site, then rethrow a *generic* BaseballActionError (not the raw error)
    // so the wrapper's own fallback below doesn't see an RLS-shaped error and
    // fire a second, bogus (table=featureArea) denial on top of it.
    const action = withBaseballAction(
      'logSetResult',
      { featureArea: 'baseball-lifting', feature: 'baseball_lifting' },
      async () => {
        maybeCaptureRlsDenial(
          { code: '42501', message: 'new row violates row-level security policy' },
          {
            table: 'helm_lifting_set_results',
            verb: 'insert',
            action: 'logSetResult',
            sport: 'baseball',
          },
        );
        throw new BaseballActionError();
      },
    );

    await expect(action()).rejects.toBeInstanceOf(BaseballActionError);

    const rlsCalls = mocks.logServerEvent.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].startsWith('RLS denial:'),
    );
    expect(rlsCalls).toHaveLength(1);
    expect(rlsCalls[0]?.[0]).toBe('RLS denial: insert on helm_lifting_set_results');
    expect(rlsCalls.some((call) => call[0] === 'RLS denial: rpc on baseball-lifting')).toBe(false);
  });

  it('does not fire for a non-RLS error (no over-suppression / false positives)', async () => {
    const action = withBaseballAction(
      'someAction',
      { featureArea: 'baseball-lifting', feature: 'baseball_lifting' },
      async () => {
        throw new Error('unexpected null pointer');
      },
    );

    await expect(action()).rejects.toBeInstanceOf(BaseballActionError);
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
    expect(mocks.logServerException).toHaveBeenCalledTimes(1);
  });
});
