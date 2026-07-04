// =============================================================================
// src/app/baseball/actions/__tests__/demo-access.test.ts
//
// Issue #392 — BaseballHelm demo gate hardening. Covers:
//   1. Rate-limit denial (per-IP DEMO_GATE throttle).
//   2. The BASEBALL_DEMO_ENABLED kill-switch short-circuit.
//   3. Lead-row capture into baseball_demo_sessions before sign-in.
//   4. The withBaseballAction read-only guard introduced in Phase 1 — the
//      shared demo coach session can never run a non-demoSafe action.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(
    async (): Promise<{ data: { user: { id: string; email: string } | null } }> => ({
      data: { user: null },
    }),
  ),
  signInWithPassword: vi.fn(async () => ({
    data: {
      session: { access_token: 'tok' },
      user: { id: 'demo-user-1', email: 'demo-coach@baseballhelmdemo.com' },
    },
    error: null,
  })),
  adminFrom: vi.fn(),
  insert: vi.fn(async () => ({ data: null, error: null })),
  logLogin: vi.fn(async () => ({})),
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 })),
  formatTimeRemaining: vi.fn(() => '15 minutes'),
  isBaseballDemoEnabled: vi.fn(() => true),
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
  getBaseballDemoCoachCredentials: vi.fn(() => ({
    email: 'demo-coach@baseballhelmdemo.com',
    password: 'BaseballDemo2026',
  })),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
mocks.adminFrom.mockImplementation(() => ({ insert: mocks.insert }));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map([
    ['x-forwarded-for', '203.0.113.7'],
    ['user-agent', 'TestAgent/1.0 (TestOS)'],
    ['referer', 'https://example.com/landing'],
  ])),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.getUser,
      signInWithPassword: mocks.signInWithPassword,
    },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.adminFrom })),
}));

vi.mock('@/lib/admin-logger', () => ({ logLogin: mocks.logLogin }));

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  RATE_LIMITS: { DEMO_GATE: { maxAttempts: 5, windowMs: 5 * 60_000, blockDurationMs: 15 * 60_000 } },
  formatTimeRemaining: mocks.formatTimeRemaining,
}));

vi.mock('@/lib/demo/baseball-config', () => ({
  BASEBALL_DEMO_LANDING_PATH: '/baseball/dashboard',
}));

vi.mock('@/lib/demo/baseball-config.server', () => ({
  getBaseballDemoCoachCredentials: mocks.getBaseballDemoCoachCredentials,
  isBaseballDemoEnabled: mocks.isBaseballDemoEnabled,
  isCurrentSessionBaseballDemo: mocks.isCurrentSessionBaseballDemo,
  isBaseballDemoCoachEmail: vi.fn(() => false),
}));

// withBaseballAction's other dependencies (Sentry, error logger) — silence so
// the Phase-1 guard tests below don't need to exercise real observability.
vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => undefined),
  logServerError: vi.fn(async () => undefined),
}));

import { enterBaseballDemo } from '@/app/baseball/actions/demo-access';
import { withBaseballAction, BaseballDemoReadOnlyError } from '@/lib/baseball/with-baseball-action';

const VALID_INPUT = {
  name: 'Coach Rivera',
  email: 'coach@example.edu',
  program: 'Example University Baseball',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adminFrom.mockImplementation(() => ({ insert: mocks.insert }));
  mocks.insert.mockResolvedValue({ data: null, error: null });
  mocks.isBaseballDemoEnabled.mockReturnValue(true);
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 });
  mocks.signInWithPassword.mockResolvedValue({
    data: {
      session: { access_token: 'tok' },
      user: { id: 'demo-user-1', email: 'demo-coach@baseballhelmdemo.com' },
    },
    error: null,
  });
});

describe('enterBaseballDemo — rate limit', () => {
  it('denies entry once the per-IP DEMO_GATE limit is exceeded, before touching the DB or auth', async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 900_000 });

    const result = await enterBaseballDemo(VALID_INPUT);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/too many demo attempts/i);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('enterBaseballDemo — kill-switch', () => {
  it('short-circuits with a graceful message when BASEBALL_DEMO_ENABLED is off, before rate-limiting', async () => {
    mocks.isBaseballDemoEnabled.mockReturnValue(false);

    const result = await enterBaseballDemo(VALID_INPUT);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not available/i);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('enterBaseballDemo — lead-row capture', () => {
  it('inserts a baseball_demo_sessions row with visitor + request metadata before signing in', async () => {
    await expect(enterBaseballDemo(VALID_INPUT)).rejects.toThrow('REDIRECT:/baseball/dashboard?demo=1');

    expect(mocks.adminFrom).toHaveBeenCalledWith('baseball_demo_sessions');
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Coach Rivera',
        email: 'coach@example.edu',
        program: 'Example University Baseball',
        ip: '203.0.113.7',
        user_agent: 'TestAgent/1.0 (TestOS)',
        referrer: 'https://example.com/landing',
        metadata: {},
      }),
    );
    // The lead row is captured BEFORE the shared-account sign-in.
    const insertOrder = mocks.insert.mock.invocationCallOrder[0]!;
    const signInOrder = mocks.signInWithPassword.mock.invocationCallOrder[0]!;
    expect(insertOrder).toBeLessThan(signInOrder);
  });

  it('never blocks demo entry when the tracking insert fails', async () => {
    mocks.insert.mockRejectedValue(new Error('relation does not exist'));

    await expect(enterBaseballDemo(VALID_INPUT)).rejects.toThrow('REDIRECT:/baseball/dashboard?demo=1');

    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1);
  });
});

describe('withBaseballAction — demo read-only guard (Phase 1, Issue #392)', () => {
  function makeAction(demoSafe?: boolean) {
    return withBaseballAction(
      'testDemoGuardedAction',
      { featureArea: 'baseball-test', requireActiveContext: false, demoSafe },
      async () => ({ ran: true }),
    );
  }

  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'coach@example.edu' } } });
  });

  it('blocks a non-demoSafe action when the active session is the demo coach', async () => {
    mocks.isCurrentSessionBaseballDemo.mockResolvedValue(true);
    const action = makeAction();
    await expect(action()).rejects.toBeInstanceOf(BaseballDemoReadOnlyError);
  });

  it('allows the same action to run for a non-demo session', async () => {
    mocks.isCurrentSessionBaseballDemo.mockResolvedValue(false);
    const action = makeAction();
    await expect(action()).resolves.toEqual({ ran: true });
  });

  it('lets a demoSafe: true action run even for the demo session (explicit opt-out)', async () => {
    mocks.isCurrentSessionBaseballDemo.mockResolvedValue(true);
    const action = makeAction(true);
    await expect(action()).resolves.toEqual({ ran: true });
  });

  it('reuses the already-resolved user email instead of re-querying auth for the guard', async () => {
    mocks.isCurrentSessionBaseballDemo.mockResolvedValue(false);
    const action = makeAction();
    await action();
    expect(mocks.isCurrentSessionBaseballDemo).toHaveBeenCalledWith('coach@example.edu');
    // AUTH already resolved the user once via createClient().auth.getUser();
    // the guard must not trigger a second independent auth round-trip.
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });
});
