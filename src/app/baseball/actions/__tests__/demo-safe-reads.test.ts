// =============================================================================
// src/app/baseball/actions/__tests__/demo-safe-reads.test.ts
//
// Incident 8dee84b8 (2026-11-26): the shared BaseballHelm demo coach hit
// "This isn't available in the live demo." 83 times in two hours on three
// READ-ONLY actions the dashboard shell and Decision Room call on every
// render or poll:
//   - getProgramBrand           (dashboard shell branding)
//   - getUnreadNotificationCount (bell badge, polled every 60 s)
//   - getDecisionRoomData       (Decision Room page; the refusal lands on error.tsx)
// None of them writes, so each is opted in with `demoSafe: true` (Issue #392's
// designed opt-in). This test runs the REAL withBaseballAction guard with the
// demo session on and asserts none of them is refused by the demo guard. Any
// other outcome (a result, or a later context/capability error from the thin
// mocks below) is fine: the guard is the only thing under test.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({
    data: { user: { id: 'demo-user-1', email: 'demo-coach@baseballhelmdemo.com' } },
  })),
  isCurrentSessionBaseballDemo: vi.fn(async () => true),
}));

// A query builder that accepts any chain and resolves to an empty result.
function emptyQuery(): unknown {
  const result = { data: null, error: null, count: 0 };
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn(() => emptyQuery()),
    rpc: vi.fn(() => emptyQuery()),
  })),
}));

vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: mocks.isCurrentSessionBaseballDemo,
  isBaseballDemoEnabled: vi.fn(() => true),
  isBaseballDemoCoachEmail: vi.fn(() => true),
  getBaseballDemoCoachCredentials: vi.fn(() => ({ email: 'x', password: 'y' })),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn(), setContext: vi.fn() }),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => undefined),
  logServerError: vi.fn(async () => undefined),
  logServerEvent: vi.fn(async () => undefined),
}));

import { BaseballDemoReadOnlyError } from '@/lib/baseball/with-baseball-action';
import { getProgramBrand } from '@/app/baseball/actions/program-settings';
import { getUnreadNotificationCount } from '@/app/baseball/actions/notifications';
import { getDecisionRoomData } from '@/app/baseball/actions/decision-room';

async function demoGuardRefused(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return false;
  } catch (error) {
    return error instanceof BaseballDemoReadOnlyError;
  }
}

describe('read-only baseball actions the demo dashboard calls (incident 8dee84b8)', () => {
  beforeEach(() => {
    mocks.isCurrentSessionBaseballDemo.mockResolvedValue(true);
  });

  it('getProgramBrand is not refused for the demo session', async () => {
    expect(await demoGuardRefused(() => getProgramBrand())).toBe(false);
  });

  it('getUnreadNotificationCount is not refused for the demo session', async () => {
    expect(await demoGuardRefused(() => getUnreadNotificationCount())).toBe(false);
  });

  it('getDecisionRoomData is not refused for the demo session', async () => {
    expect(await demoGuardRefused(() => getDecisionRoomData())).toBe(false);
  });
});
