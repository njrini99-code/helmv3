import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * ONE CODE, TWO DESTINATIONS — `signupAction` with role 'assistant_request'.
 *
 * A head coach hands out exactly one thing: the team join code. Whoever types
 * it picks Player or Assistant coach at signup. This file pins the security
 * property that lets that ship: choosing "Assistant coach" must create a
 * REQUEST, never a grant.
 *
 * The reason is mechanical, not stylistic. Every player on the roster holds the
 * team code, and both access helpers are bare existence checks over
 * golf_team_coach_staff (verified against prod 2026-08-19):
 *
 *   is_golf_team_coach(t) = EXISTS(SELECT 1 FROM golf_team_coach_staff …)
 *
 * so writing that row IS the grant. If the picker wrote it, any player could
 * self-promote with a second email and read every teammate's rounds and PII.
 * That is the escalation reverted in 266d02d91 (2026-08-05).
 */

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map([['x-forwarded-for', '203.0.113.9']])),
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => {} })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

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

const { signUp } = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { signUp, getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }));
vi.mock('@/lib/admin-logger', () => ({
  logSignup: vi.fn(async () => null),
  logLogin: vi.fn(async () => null),
  logSecurityEvent: vi.fn(async () => null),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
}));
vi.mock('@/lib/analytics/posthog-server', () => ({ captureServer: vi.fn(async () => undefined) }));
vi.mock('@/lib/demo/config.server', () => ({ isDemoCoachEmail: () => false }));

// The gate is the ONLY source of the team code — never the form.
const { verifySignupGate } = vi.hoisted(() => ({ verifySignupGate: vi.fn() }));
vi.mock('@/lib/golf/signup-gate', () => ({ verifySignupGate }));
const { resolveStaffInviteCode } = vi.hoisted(() => ({
  resolveStaffInviteCode: vi.fn(async (_code: string) => null as string | null),
}));
vi.mock('@/lib/golf/staff-invite-lookup', () => ({ resolveStaffInviteCode }));

// vi.mock factories are hoisted above every const in this file, so the spies
// they hand back have to be created inside vi.hoisted() or the factory runs
// before they exist.
const { createPendingAssistantCoach, redeemStaffInvite } = vi.hoisted(() => ({
  createPendingAssistantCoach: vi.fn(
    async (_userId: string, _teamJoinCode: string, _fullName?: string, _email?: string) => ({
      success: true,
    }),
  ),
  redeemStaffInvite: vi.fn(async (_token: string, _fullName?: string) => ({ success: true })),
}));
vi.mock('@/app/golf/actions/teams', () => ({
  createPendingAssistantCoach,
  redeemStaffInvite,
}));

import { signupAction } from '../auth';

const STRONG_PASSWORD = 'Fairway!42x';
const CODE = 'K7PQX4MN';

beforeEach(() => {
  signUp.mockReset();
  createPendingAssistantCoach.mockClear();
  redeemStaffInvite.mockClear();
  signUp.mockResolvedValue({
    data: { user: { id: 'user-1' }, session: { access_token: 't' } },
    error: null,
  });
  verifySignupGate.mockResolvedValue({ passed: true, teamJoinCode: CODE, staffInviteCode: null });
});

describe("assistant coach on the team code — a request, never a grant", () => {
  it('records a pending request and never writes a staff grant', async () => {
    const result = await signupAction('asst@shenandoah.edu', STRONG_PASSWORD, 'assistant_request', 'Ben', 'Potter');

    expect(result.success).toBe(true);
    expect(createPendingAssistantCoach).toHaveBeenCalledTimes(1);
    // The team comes from the GATE, so a forged form field cannot redirect the
    // request at another program.
    expect(createPendingAssistantCoach.mock.calls[0]?.[1]).toBe(CODE);
    // Nothing on this path may mint staff access.
    expect(redeemStaffInvite).not.toHaveBeenCalled();
  });

  it('lands on the pending screen, not coach onboarding', async () => {
    const result = await signupAction('asst@shenandoah.edu', STRONG_PASSWORD, 'assistant_request');
    // '/golf/coach' is new-program onboarding — the school-details form that
    // minted a phantom duplicate program for UNCW and Shenandoah.
    expect(result.redirectTo).toBe('/golf/coach/pending');
    expect(result.redirectTo).not.toBe('/golf/coach');
  });

  it("writes 'coach' into auth metadata, not the request marker", async () => {
    await signupAction('asst@shenandoah.edu', STRONG_PASSWORD, 'assistant_request');
    // handle_new_user's CASE accepts only 'coach'/'player' and silently
    // defaults anything else to 'player'. Leaking 'assistant_request' through
    // would make every assistant a player in public.users, with no error.
    expect(signUp.mock.calls[0]?.[0]?.options?.data?.role).toBe('coach');
  });

  it('refuses the request when no team code opened the gate', async () => {
    verifySignupGate.mockResolvedValue({ passed: true, teamJoinCode: null, staffInviteCode: null });

    const result = await signupAction('nobody@example.com', STRONG_PASSWORD, 'assistant_request');

    expect(result.success).toBe(false);
    expect(createPendingAssistantCoach).not.toHaveBeenCalled();
  });
});

describe("a staff invite still seals the role — the server's redirect wins", () => {
  it("returns the dashboard for a redeemed staff invite", async () => {
    verifySignupGate.mockResolvedValue({ passed: true, teamJoinCode: null, staffInviteCode: 'STAFF123' });
    resolveStaffInviteCode.mockResolvedValue('signed.token.here');

    const result = await signupAction('asst@shenandoah.edu', STRONG_PASSWORD, 'coach');

    // Pins the precedence bug: the client used to check `role === 'player' &&
    // code` BEFORE result.redirectTo, so a successful redemption was overridden
    // and the new assistant was sent to /golf/player?joinCode=<staff code>.
    // A test that never sets redirectTo cannot see that.
    expect(result.redirectTo).toBe('/golf/dashboard');
  });
});
