import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

/**
 * `signupWithStaffInviteAction` — account creation gated by a STAFF INVITE.
 *
 * Why this action exists: GolfHelm self-serve signup is a PLAYER team-code
 * gate, so an invited assistant coach could not create an account at all. A
 * customer hit exactly that on 2026-08-18 — the head coach handed over the
 * team code, and the assistant found only "Player | Coach" with no assistant
 * option, where picking Coach would have minted a duplicate phantom program.
 *
 * The security property under test is the one that makes this safe to exist:
 * the invite TOKEN replaces the access-code gate, so an unauthorized caller
 * must not be able to create an account through it. The token is only ever
 * mintable by someone already holding head_coach (createStaffInvite), and the
 * ROLE lives inside the signature — never in the request — so this path cannot
 * be used to self-assign staff access with a player's join code.
 *
 * The real signStaffInvite/verifyStaffInvite are used, not stubs: mocking the
 * verifier would leave precisely the guard that matters untested.
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
const getUser = vi.fn(async () => ({ data: { user: null } }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { signUp, getUser } })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
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

import { signupWithStaffInviteAction } from '../auth';
import { signStaffInvite } from '@/lib/golf/staff-invite';

const STRONG_PASSWORD = 'Fairway!42x';
const TEAM = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';

describe('signupWithStaffInviteAction — the invite is the authorization', () => {
  const originalSecret = process.env.COACHHELM_INTERNAL_SECRET;

  beforeEach(() => {
    signUp.mockReset();
    signUp.mockResolvedValue({
      data: { user: { id: 'user-1' }, session: { access_token: 'tok' } },
      error: null,
    });
    process.env.COACHHELM_INTERNAL_SECRET = 'test-secret-for-staff-invites';
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.COACHHELM_INTERNAL_SECRET;
    else process.env.COACHHELM_INTERNAL_SECRET = originalSecret;
  });

  it('creates the account for a genuine head-coach-minted invite', async () => {
    const token = signStaffInvite(TEAM, ORG, 'coach');
    expect(token).toBeTruthy();

    const result = await signupWithStaffInviteAction(
      token!,
      'assistant@uncw.edu',
      STRONG_PASSWORD,
      'Jane Assistant',
    );

    expect(result.success).toBe(true);
    expect(signUp).toHaveBeenCalledTimes(1);
    // Role metadata is 'coach' — the STAFF role itself is not written here; it
    // travels in the token and is applied by redeemStaffInvite, which is what
    // stops this path from minting a new program.
    const options = signUp.mock.calls[0]![0].options;
    expect(options.data.role).toBe('coach');
    expect(options.data.sport).toBe('golf');
  });

  it('refuses junk instead of creating an account', async () => {
    const result = await signupWithStaffInviteAction(
      'not-a-real-token',
      'stranger@example.com',
      STRONG_PASSWORD,
      'Stranger',
    );

    expect(result.success).toBe(false);
    // The critical assertion: no account was created for an unauthorized caller.
    expect(signUp).not.toHaveBeenCalled();
  });

  it('refuses a token whose role was edited from coach to admin', async () => {
    const token = signStaffInvite(TEAM, ORG, 'coach')!;
    const [payload, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
    decoded.r = 'admin';
    const forged = `${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${sig}`;

    const result = await signupWithStaffInviteAction(
      forged,
      'climber@example.com',
      STRONG_PASSWORD,
      'Role Climber',
    );

    expect(result.success).toBe(false);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('refuses an expired invite with copy that tells them what to do', async () => {
    vi.useFakeTimers();
    try {
      const token = signStaffInvite(TEAM, ORG, 'coach')!;
      // 72h TTL + a margin.
      vi.setSystemTime(Date.now() + 73 * 60 * 60 * 1000);

      const result = await signupWithStaffInviteAction(
        token,
        'late@example.com',
        STRONG_PASSWORD,
        'Late Arrival',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
      expect(signUp).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a weak password before reaching Supabase', async () => {
    const token = signStaffInvite(TEAM, ORG, 'coach')!;

    const result = await signupWithStaffInviteAction(
      token,
      'assistant@uncw.edu',
      'short',
      'Jane Assistant',
    );

    expect(result.success).toBe(false);
    expect(signUp).not.toHaveBeenCalled();
  });
});
