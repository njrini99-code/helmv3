import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * signupAction with a STAFF CODE (the short code a head coach hands an
 * assistant, which resolves to a signed invite token).
 *
 * - The code must still resolve before an account exists: an expired or
 *   revoked code refuses without calling auth.signUp.
 * - The retry link after a failed redemption carries the TOKEN. The accept
 *   screen (/golf/staff/join/[token]) verifies a signed token, so the short
 *   code there always read as "not valid".
 * - `staffJoined` says whether the account landed on staff.
 * - Every successful signup resets the idle marker, like login does.
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

const signUp = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { signUp, getUser: vi.fn(async () => ({ data: { user: null } })) } })),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: vi.fn() }) }));

vi.mock('@/lib/golf/signup-gate', () => ({
  verifySignupGate: vi.fn(async () => ({ passed: true, staffInviteCode: 'STAFF123', teamJoinCode: null })),
}));
const resolveStaffInviteCode = vi.fn();
vi.mock('@/lib/golf/staff-invite-lookup', () => ({
  resolveStaffInviteCode: (code: string) => resolveStaffInviteCode(code),
}));
const redeemStaffInvite = vi.fn();
vi.mock('@/app/golf/actions/teams', () => ({
  redeemStaffInvite: (token: string, name?: string) => redeemStaffInvite(token, name),
}));
const resetSessionIdleMarker = vi.fn(async () => undefined);
vi.mock('@/lib/auth/session-idle-server', () => ({
  resetSessionIdleMarker: () => resetSessionIdleMarker(),
}));

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

import { signupAction } from '../auth';

const STRONG_PASSWORD = 'Fairway!42x';
const TOKEN = 'signed.invite-token';

describe('signupAction — staff code', () => {
  beforeEach(() => {
    signUp.mockReset();
    signUp.mockResolvedValue({ data: { user: { id: 'user-1' }, session: { access_token: 'tok' } }, error: null });
    resolveStaffInviteCode.mockReset();
    redeemStaffInvite.mockReset();
    resetSessionIdleMarker.mockClear();
  });

  it('refuses a staff code that no longer resolves, before creating any account', async () => {
    resolveStaffInviteCode.mockResolvedValue(null);

    const result = await signupAction('asst@uncw.edu', STRONG_PASSWORD, 'coach', 'Jane', 'Doe');

    expect(result.success).toBe(false);
    expect(result.error).toContain('no longer valid');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('lands on the dashboard with staffJoined when redemption succeeds', async () => {
    resolveStaffInviteCode.mockResolvedValue(TOKEN);
    redeemStaffInvite.mockResolvedValue({ success: true });

    const result = await signupAction('asst@uncw.edu', STRONG_PASSWORD, 'coach', 'Jane', 'Doe');

    expect(result).toEqual({ success: true, redirectTo: '/golf/dashboard', staffJoined: true });
    expect(redeemStaffInvite).toHaveBeenCalledWith(TOKEN, 'Jane Doe');
    expect(resetSessionIdleMarker).toHaveBeenCalledTimes(1);
  });

  it('sends a failed redemption to the accept screen with the TOKEN, not the short code', async () => {
    resolveStaffInviteCode.mockResolvedValue(TOKEN);
    redeemStaffInvite.mockResolvedValue({ success: false, error: 'already used' });

    const result = await signupAction('asst@uncw.edu', STRONG_PASSWORD, 'coach', 'Jane', 'Doe');

    expect(result).toEqual({
      success: true,
      redirectTo: `/golf/staff/join/${encodeURIComponent(TOKEN)}`,
      staffJoined: false,
    });
  });
});
