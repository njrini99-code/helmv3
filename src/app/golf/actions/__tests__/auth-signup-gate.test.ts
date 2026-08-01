import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

/**
 * B8-1 — the signup access-code gate is enforced SERVER-SIDE.
 *
 * Before this, the gate lived only in the signup page's client component:
 * `grep -rn validateAccessCode src` found no server-side caller at all, so
 * `signupAction` was directly POST-able and the gate was decorative.
 *
 * These specs drive the REAL gate (access-code.ts) through `signupAction` —
 * only the request primitives (headers/cookies), the limiter, and the Supabase
 * clients are stubbed. That's deliberate: the regression that matters here is
 * "a legitimate coach-invited player can no longer sign up", and mocking the
 * gate itself would test nothing.
 */

// ── request primitives ───────────────────────────────────────────────────
const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map([['x-forwarded-for', '203.0.113.9']])),
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// ── limiters (both modules: auth.ts uses one, access-code.ts the other) ──
const allow = { allowed: true, remaining: 9, resetAt: Date.now() + 60_000 };

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => allow),
  resetRateLimit: vi.fn(),
  RATE_LIMITS: { LOGIN: {}, SIGNUP: { maxAttempts: 10, windowMs: 3_600_000 }, PASSWORD_RESET: {} },
  formatTimeRemaining: () => '1 minute',
}));

vi.mock('@/lib/auth/supabase-rate-limit', () => ({
  checkRateLimit: vi.fn(async () => allow),
  RATE_LIMITS: { SIGNUP: { maxAttempts: 10, windowMs: 3_600_000 } },
}));

// ── Supabase ─────────────────────────────────────────────────────────────
const signUp = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: null } }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { signUp, getUser } })),
}));

// golf_teams.join_code lookup behind the gate.
const maybeSingle = vi.fn(async () => ({ data: null as { id: string } | null, error: null }));
const teamQuery = {
  select: () => teamQuery,
  eq: () => teamQuery,
  limit: () => teamQuery,
  maybeSingle,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => teamQuery }),
}));

// ── logging / telemetry ──────────────────────────────────────────────────
const logSecurityEvent = vi.fn(async () => null);

vi.mock('@/lib/admin-logger', () => ({
  logSignup: vi.fn(async () => null),
  logLogin: vi.fn(async () => null),
  logSecurityEvent: (...args: unknown[]) => logSecurityEvent(...(args as [])),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
}));

vi.mock('@/lib/analytics/posthog-server', () => ({ captureServer: vi.fn(async () => undefined) }));
vi.mock('@/lib/demo/config.server', () => ({ isDemoCoachEmail: () => false }));

import { signupAction } from '../auth';

const GRANT_COOKIE = 'helm_golf_signup_gate';
const STRONG_PASSWORD = 'Fairway!42x';

function signUpSucceeds() {
  signUp.mockResolvedValue({
    data: { user: { id: 'user-1' }, session: { access_token: 'tok' } },
    error: null,
  });
}

describe('signupAction — server-side access-code gate (B8-1)', () => {
  const original = process.env.SIGNUP_ACCESS_CODE;

  beforeEach(() => {
    cookieJar.clear();
    maybeSingle.mockResolvedValue({ data: null, error: null });
    signUpSucceeds();
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SIGNUP_ACCESS_CODE;
    else process.env.SIGNUP_ACCESS_CODE = original;
    vi.clearAllMocks();
  });

  // (a) valid global access code
  it('creates the account when the grant carries the global access code', async () => {
    cookieJar.set(GRANT_COOKIE, 'HELM25');

    const result = await signupAction('New@Example.com', STRONG_PASSWORD, 'coach', 'New', 'Coach');

    expect(result).toEqual({ success: true, redirectTo: '/golf/coach' });
    expect(signUp).toHaveBeenCalledTimes(1);
  });

  // (b) valid team join code — the coach-invited player path
  it('creates the account when the grant carries a live team join code', async () => {
    // Not the global code: only the golf_teams.join_code lookup can pass it.
    maybeSingle.mockResolvedValue({ data: { id: 'team-1' }, error: null });
    cookieJar.set(GRANT_COOKIE, 'K7PQX4MN');

    const result = await signupAction('player@example.com', STRONG_PASSWORD, 'player', 'New', 'Player');

    expect(result).toEqual({ success: true, redirectTo: '/golf/player' });
    expect(signUp).toHaveBeenCalledTimes(1);
  });

  // (c) neither — a direct POST with no gate
  it('refuses, and never calls auth.signUp, when there is no grant at all', async () => {
    const result = await signupAction('attacker@example.com', STRONG_PASSWORD, 'coach');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/access code/i);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('refuses a grant whose code matches neither the global code nor any team', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    cookieJar.set(GRANT_COOKIE, 'ZZZZZZZZ');

    const result = await signupAction('attacker@example.com', STRONG_PASSWORD, 'player');

    expect(result.success).toBe(false);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('records a security event when the gate is bypassed', async () => {
    await signupAction('attacker@example.com', STRONG_PASSWORD, 'coach');

    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.stringContaining('without a valid access-code grant'),
      'warning',
      expect.objectContaining({ email: 'attacker@example.com' }),
    );
  });

  it('still rejects a weak password before it ever reaches the gate', async () => {
    // Ordering guard: password feedback stays immediate, as it was before B8-1.
    const result = await signupAction('new@example.com', 'short', 'coach');

    expect(result.success).toBe(false);
    expect(signUp).not.toHaveBeenCalled();
  });
});
