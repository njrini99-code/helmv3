// =============================================================================
// src/app/golf/actions/__tests__/demo-access.test.ts
//
// #918 — GolfHelm demo gate hardening. Covers:
//   1. Rate-limit denial (per-IP DEMO_GATE throttle), before touching DB/auth.
//   2. Missing demo credentials short-circuit.
//   3. Lead-row capture into golf_demo_sessions before sign-in.
//   4. The is_demo user_metadata stamp set right after sign-in — the signal
//      the shared idle-timeout flow (middleware + useSessionActivity) reads
//      to route an expired demo session back to /golf/demo instead of the
//      dead-end password login.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(async () => ({
    data: {
      session: { access_token: 'tok' },
      user: { id: 'demo-user-1', email: 'demo@golfhelmdemo.com' },
    },
    error: null,
  })),
  updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
  getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
  adminFrom: vi.fn(),
  insert: vi.fn(async () => ({ data: null, error: null })),
  logLogin: vi.fn(async () => ({})),
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 })),
  formatTimeRemaining: vi.fn(() => '15 minutes'),
  getDemoCoachCredentials: vi.fn(
    (): { email: string; password: string } | null => ({ email: 'demo@golfhelmdemo.com', password: 'Demo2026' }),
  ),
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
      updateUser: mocks.updateUser,
    },
  })),
}));
vi.mock('@/lib/auth/session-idle-server', () => ({
  resetSessionIdleMarker: vi.fn(async () => {}),
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

vi.mock('@/lib/demo/config', () => ({
  DEMO_LANDING_PATH: '/golf/dashboard',
  DEMO_COACHHELM_LANDING_PATH: '/golf/dashboard/intelligence',
}));

vi.mock('@/lib/demo/config.server', () => ({
  getDemoCoachCredentials: mocks.getDemoCoachCredentials,
  isDemoCoachEmail: vi.fn(() => false),
}));

import { enterDemo } from '@/app/golf/actions/demo-access';

const VALID_INPUT = {
  name: 'Coach Rivera',
  email: 'coach@example.edu',
  school: 'Example University Golf',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adminFrom.mockImplementation(() => ({ insert: mocks.insert }));
  mocks.insert.mockResolvedValue({ data: null, error: null });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 });
  mocks.getDemoCoachCredentials.mockReturnValue({ email: 'demo@golfhelmdemo.com', password: 'Demo2026' });
  mocks.signInWithPassword.mockResolvedValue({
    data: {
      session: { access_token: 'tok' },
      user: { id: 'demo-user-1', email: 'demo@golfhelmdemo.com' },
    },
    error: null,
  });
  mocks.updateUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe('enterDemo — rate limit', () => {
  it('denies entry once the per-IP DEMO_GATE limit is exceeded, before touching the DB or auth', async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 900_000 });

    const result = await enterDemo(VALID_INPUT);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/too many demo attempts/i);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('enterDemo — missing credentials', () => {
  it('short-circuits with a graceful message when demo credentials are unconfigured', async () => {
    mocks.getDemoCoachCredentials.mockReturnValue(null);

    const result = await enterDemo(VALID_INPUT);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not available/i);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('enterDemo — lead-row capture', () => {
  it('inserts a golf_demo_sessions row with visitor + request metadata before signing in', async () => {
    await expect(enterDemo(VALID_INPUT)).rejects.toThrow('REDIRECT:/golf/dashboard?demo=1');

    expect(mocks.adminFrom).toHaveBeenCalledWith('golf_demo_sessions');
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Coach Rivera',
        email: 'coach@example.edu',
        school: 'Example University Golf',
        ip: '203.0.113.7',
        user_agent: 'TestAgent/1.0 (TestOS)',
        referrer: 'https://example.com/landing',
        metadata: {},
      }),
    );
    const insertOrder = mocks.insert.mock.invocationCallOrder[0]!;
    const signInOrder = mocks.signInWithPassword.mock.invocationCallOrder[0]!;
    expect(insertOrder).toBeLessThan(signInOrder);
  });

  it('never blocks demo entry when the tracking insert fails', async () => {
    mocks.insert.mockRejectedValue(new Error('relation does not exist'));

    await expect(enterDemo(VALID_INPUT)).rejects.toThrow('REDIRECT:/golf/dashboard?demo=1');

    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('routes CoachHelm CRM invites to the new intelligence desk', async () => {
    await expect(
      enterDemo({ ...VALID_INPUT, destination: 'coachhelm' }),
    ).rejects.toThrow('REDIRECT:/golf/dashboard/intelligence?demo=1');
  });
});

describe('enterDemo — is_demo metadata stamp (#918)', () => {
  it('stamps user_metadata.is_demo = true right after sign-in, before redirecting', async () => {
    await expect(enterDemo(VALID_INPUT)).rejects.toThrow('REDIRECT:/golf/dashboard?demo=1');

    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { is_demo: true } });
    const signInOrder = mocks.signInWithPassword.mock.invocationCallOrder[0]!;
    const updateOrder = mocks.updateUser.mock.invocationCallOrder[0]!;
    expect(signInOrder).toBeLessThan(updateOrder);
  });

  it('never blocks demo entry when the metadata stamp fails', async () => {
    mocks.updateUser.mockRejectedValue(new Error('gotrue hiccup'));

    await expect(enterDemo(VALID_INPUT)).rejects.toThrow('REDIRECT:/golf/dashboard?demo=1');

    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1);
  });
});
