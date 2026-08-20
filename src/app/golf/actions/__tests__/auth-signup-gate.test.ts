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

/**
 * The assistant JOIN is stubbed here on purpose.
 *
 * This file tests the GATE — which code opens signup, and what role that code
 * is allowed to produce. The join itself (coach upsert, a staff row per team in
 * the program, the notification, the failure paths) is covered directly in
 * `assistant-join.test.ts` against its own admin-client fakes.
 *
 * Without this stub the case below fails with "We could not find the team for
 * that code" — the admin mock in this file exposes only a read chain
 * (select/eq/limit/maybeSingle), not the upserts the real join performs. That
 * error is a gap in these fakes, not a broken signup: production error_logs
 * carry zero occurrences of that string.
 */
const joinTeamAsAssistantCoach = vi.fn(async () => ({ success: true }));
vi.mock('@/app/golf/actions/teams', () => ({
  joinTeamAsAssistantCoach: (...args: unknown[]) => joinTeamAsAssistantCoach(...(args as [])),
  redeemStaffInvite: vi.fn(async () => ({ success: true })),
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
  it('carries the team join code into onboarding so the player auto-joins', async () => {
    // Not the global code: only the golf_teams.join_code lookup can pass it.
    maybeSingle.mockResolvedValue({ data: { id: 'team-1' }, error: null });
    cookieJar.set(GRANT_COOKIE, 'K7PQX4MN');

    const result = await signupAction('player@example.com', STRONG_PASSWORD, 'player', 'New', 'Player');

    // `?joinCode=` is the parameter completePlayerOnboarding already consumes
    // to attach the player to the inviting team. This previously asserted a
    // bare '/golf/player', which pinned the bug: the gate verified the code
    // and discarded it in the same breath, so a coach-invited player finished
    // onboarding with NO team and had to be invited a second time.
    expect(result).toEqual({ success: true, redirectTo: '/golf/player?joinCode=K7PQX4MN' });
    expect(signUp).toHaveBeenCalledTimes(1);
  });

  // (b2) A TEAM CODE OUTRANKS THE ROLE THE BROWSER SENT.
  //
  // This case used to assert the opposite — that a coach holding a VALID team
  // code still landed on '/golf/coach' — and that is precisely the bug. That
  // path is new-program onboarding: it inserts a fresh organization and team and
  // re-points organization_id at them, which is how assistants at UNCW and
  // Shenandoah got a duplicate program, and how one hit "An organization named
  // 'Guilford College' already exists" as a dead end at the last step of signup.
  //
  // `role` comes from the client. The form derives 'assistant_request' from the
  // resolved scope, but a stale bundle — anyone still holding the pre-deploy
  // JS — posts role:'coach' with a roster code. So the SERVER decides: holding a
  // team code means joining THAT program, never creating a new one.
  it('routes a coach holding a TEAM CODE into the assistant join, never the wizard', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'team-1' }, error: null });
    cookieJar.set(GRANT_COOKIE, 'K7PQX4MN');

    const result = await signupAction('coach@example.com', STRONG_PASSWORD, 'coach', 'New', 'Coach');

    expect(result).toEqual({ success: true, redirectTo: '/golf/dashboard' });
    // Never the duplicate-program door.
    expect(result.redirectTo).not.toBe('/golf/coach');
    // And it joined the team the CODE names — taken from the gate, not the form.
    expect(joinTeamAsAssistantCoach).toHaveBeenCalledTimes(1);
    expect(joinTeamAsAssistantCoach.mock.calls[0]?.[1]).toBe('K7PQX4MN');
  });

  // (b3) the GLOBAL access code is not a team, so there is nothing to join.
  it('does not carry a join code when the global access code was used', async () => {
    // No team matches, so only the global-code branch can pass this.
    maybeSingle.mockResolvedValue({ data: null, error: null });
    cookieJar.set(GRANT_COOKIE, 'HELM25');

    const result = await signupAction('player2@example.com', STRONG_PASSWORD, 'player', 'New', 'Player');

    expect(result).toEqual({ success: true, redirectTo: '/golf/player' });
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
