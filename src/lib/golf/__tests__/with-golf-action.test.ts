/**
 * @vitest-environment node
 *
 * Server-module test. The default project environment is jsdom, which
 * defines `window` — and rls-denial.ts gates its capture on
 * `typeof window === 'undefined'` so server-only logging never lands in a
 * client bundle. Under jsdom that guard is false, the capture branch never
 * runs, and these assertions silently test nothing. Pin to node so the code
 * path under test is the one that actually executes on the server. Mirrors
 * src/lib/baseball/__tests__/with-baseball-action-observability.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logServerException: vi.fn(async (..._args: unknown[]) => undefined),
  logServerError: vi.fn(async (..._args: unknown[]) => undefined),
  logServerEvent: vi.fn(async (..._args: unknown[]) => undefined),
  scope: {
    setTag: vi.fn(),
    setUser: vi.fn(),
    addBreadcrumb: vi.fn(),
  },
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
  GolfActionError,
  withGolfAction,
  captureGolfActionError,
} from '../with-golf-action';
// Intentionally NOT mocked (matches the baseball precedent) — the real
// isRlsDenial/maybeCaptureRlsDenial and classifySoftFailure logic runs
// against the (mocked) server-error-logger above.
import { flushRlsDenialLogs } from '@/lib/admin/rls-denial';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';

beforeEach(() => {
  vi.clearAllMocks();
  __resetEmitThrottleForTests();
});

describe('withGolfAction observability', () => {
  it('logs unexpected failures with Helm Bridge golf tracing context and rethrows a sanitized GolfActionError', async () => {
    const action = withGolfAction(
      'saveGolfRoundHole',
      { featureArea: 'golf-round-tracking', feature: 'round_tracking' },
      async () => {
        throw new Error('database write failed');
      },
    );

    await expect(action()).rejects.toBeInstanceOf(GolfActionError);

    expect(mocks.scope.setTag).toHaveBeenCalledWith('sport', 'golf');
    expect(mocks.scope.setTag).toHaveBeenCalledWith('feature_area', 'golf-round-tracking');
    expect(mocks.scope.setTag).toHaveBeenCalledWith('feature', 'round_tracking');
    expect(mocks.scope.setTag).toHaveBeenCalledWith('action', 'saveGolfRoundHole');
    expect(mocks.logServerException).toHaveBeenCalledTimes(1);

    const [error, context, severity] = mocks.logServerException.mock.calls[0]! as unknown[];
    expect(error).toBeInstanceOf(Error);
    expect(severity).toBe('error');
    expect(context).toMatchObject({
      action: 'saveGolfRoundHole',
      featureArea: 'golf-round-tracking',
      feature: 'round_tracking',
      sport: 'golf',
      source: 'server_action',
      handled: false,
      skipSentry: false,
      fingerprint: ['server_action', 'golf-round-tracking', 'saveGolfRoundHole'],
    });
  });

  it('rethrows an expected/benign failure as the ORIGINAL error, logged as a handled warning', async () => {
    const action = withGolfAction(
      'loadGolfDashboard',
      { featureArea: 'golf-dashboard' },
      async () => {
        throw new Error('Not authenticated.');
      },
    );

    await expect(action()).rejects.toThrow('Not authenticated.');
    await expect(action()).rejects.not.toBeInstanceOf(GolfActionError);

    expect(mocks.logServerException).toHaveBeenCalledTimes(2);
    const [error, context, severity] = mocks.logServerException.mock.calls[0]! as unknown[];
    expect((error as Error).message).toBe('Not authenticated.');
    expect(severity).toBe('warning');
    expect(context).toMatchObject({
      action: 'loadGolfDashboard',
      featureArea: 'golf-dashboard',
      sport: 'golf',
      handled: true,
      skipSentry: true,
    });
  });

  it('logs { success: false } soft failures to Helm Bridge without throwing', async () => {
    const action = withGolfAction(
      'uploadGolfDocument',
      { featureArea: 'golf-documents', feature: 'documents' },
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
      action: 'uploadGolfDocument',
      sport: 'golf',
      feature: 'documents',
      source: 'server_action',
      handled: true,
    });
  });

  it('passes a Next.js control-flow throw straight through, untouched and unlogged', async () => {
    const redirectError = new Error('NEXT_REDIRECT');
    (redirectError as { digest?: string }).digest = 'NEXT_REDIRECT;replace;/golf/login;307;';

    const action = withGolfAction(
      'redirectToSignIn',
      { featureArea: 'golf-auth' },
      async () => {
        throw redirectError;
      },
    );

    await expect(action()).rejects.toBe(redirectError);
    expect(mocks.logServerException).not.toHaveBeenCalled();
    expect(mocks.logServerError).not.toHaveBeenCalled();
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
  });

  it('returns the action error shape via toErrorResult instead of throwing, for both expected and unexpected failures', async () => {
    const expectedAction = withGolfAction(
      'expectedFailureAction',
      {
        featureArea: 'golf-qualifiers',
        toErrorResult: (message, code) => ({ success: false as const, error: message, code: code ?? undefined }),
      },
      async () => {
        throw new Error('Forbidden');
      },
    );
    await expect(expectedAction()).resolves.toEqual({ success: false, error: 'Forbidden', code: undefined });

    const unexpectedAction = withGolfAction(
      'unexpectedFailureAction',
      {
        featureArea: 'golf-qualifiers',
        toErrorResult: (message, code) => ({ success: false as const, error: message, code: code ?? undefined }),
      },
      async () => {
        throw new Error('some internal pg detail nobody should see');
      },
    );
    const result = await unexpectedAction();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Something went wrong. Please try again.');
    expect(result.error).not.toContain('pg detail');
  });

  it('derives identity/subject context from the original call args via contextFrom', async () => {
    const action = withGolfAction(
      'deletePlayerRound',
      {
        featureArea: 'golf-round-tracking',
        contextFrom: (roundId: string, playerId: string) => ({ roundId, playerId }),
      },
      async (_roundId: string, _playerId: string) => {
        throw new Error('unexpected failure');
      },
    );

    await expect(action('round-1', 'player-1')).rejects.toBeInstanceOf(GolfActionError);

    const [, context] = mocks.logServerException.mock.calls[0]! as unknown[];
    expect(context).toMatchObject({ roundId: 'round-1', playerId: 'player-1' });
  });
});

// =============================================================================
// Wrapper-level RLS-denial capture — mirrors
// with-baseball-action-observability.test.ts's equivalent block.
// =============================================================================

describe('withGolfAction RLS-denial capture', () => {
  it('fires the generic fallback (table=featureArea, verb=rpc) when the action body throws an RLS-shaped error and no rlsContext is given', async () => {
    const action = withGolfAction(
      'recalculateStrokesGained',
      { featureArea: 'golf-stats-analytics', feature: 'stats_analytics' },
      async () => {
        throw { code: '42501', message: 'new row violates row-level security policy' };
      },
    );

    await expect(action()).rejects.toBeInstanceOf(GolfActionError);

    await flushRlsDenialLogs();
    const rlsCalls = mocks.logServerEvent.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].startsWith('RLS denial:'),
    );
    expect(rlsCalls).toHaveLength(1);
    expect(rlsCalls[0]?.[0]).toBe('RLS denial: rpc on golf-stats-analytics');
    // The generic fallback fired, so no SECOND generic error log for the same failure.
    expect(mocks.logServerException).not.toHaveBeenCalled();
  });

  it('uses the precise table/verb from rlsContext instead of the generic fallback', async () => {
    const action = withGolfAction(
      'updateGolfRound',
      { featureArea: 'golf-round-tracking', rlsContext: { table: 'golf_rounds', verb: 'update' } },
      async () => {
        throw { code: '42501', message: 'new row violates row-level security policy' };
      },
    );

    await expect(action()).rejects.toBeInstanceOf(GolfActionError);

    await flushRlsDenialLogs();
    const rlsCalls = mocks.logServerEvent.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].startsWith('RLS denial:'),
    );
    expect(rlsCalls).toHaveLength(1);
    expect(rlsCalls[0]?.[0]).toBe('RLS denial: update on golf_rounds');
  });

  it('does not fire for a non-RLS error (no over-suppression / false positives)', async () => {
    const action = withGolfAction(
      'someGolfAction',
      { featureArea: 'golf-misc' },
      async () => {
        throw new Error('unexpected null pointer');
      },
    );

    await expect(action()).rejects.toBeInstanceOf(GolfActionError);
    await flushRlsDenialLogs();
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
    expect(mocks.logServerException).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// captureGolfActionError — for catch sites that keep their own fallback value.
// =============================================================================

describe('captureGolfActionError', () => {
  it('logs the failure and returns nothing, never throwing', () => {
    expect(() =>
      captureGolfActionError(new Error('boom'), {
        action: 'getPlayerRoundHistory',
        featureArea: 'golf-round-tracking',
      }),
    ).not.toThrow();
  });

  it('captures a precise RLS denial when rls context is supplied, and skips the generic log', async () => {
    captureGolfActionError(
      { code: '42501', message: 'new row violates row-level security policy' },
      {
        action: 'getPlayerRoundHistory',
        featureArea: 'golf-round-tracking',
        rls: { table: 'golf_rounds', verb: 'select' },
        playerId: 'player-9',
      },
    );

    await flushRlsDenialLogs();
    const rlsCalls = mocks.logServerEvent.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].startsWith('RLS denial:'),
    );
    expect(rlsCalls).toHaveLength(1);
    expect(rlsCalls[0]?.[0]).toBe('RLS denial: select on golf_rounds');
    expect(mocks.logServerException).not.toHaveBeenCalled();
  });

  it('logs a non-RLS error via logServerException at the classified severity', async () => {
    captureGolfActionError(new Error('Forbidden'), {
      action: 'getPlayerRoundHistory',
      featureArea: 'golf-round-tracking',
    });

    // Fire-and-forget: give the internal promise a tick to settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.logServerException).toHaveBeenCalledTimes(1);
    const [, , severity] = mocks.logServerException.mock.calls[0]! as unknown[];
    expect(severity).toBe('warning');
  });
});
