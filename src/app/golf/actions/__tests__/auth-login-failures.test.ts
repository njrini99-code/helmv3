import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getErrorMessage, CREDENTIALS_MESSAGE, NETWORK_MESSAGE, RATE_LIMIT_MESSAGE, UNVERIFIED_MESSAGE } from '@/lib/auth/golf-sign-in-logic';

/**
 * loginAction's refusals (auth scrub, 2026-11-25). Only a refused password counts toward the account lockout: an
 * unconfirmed email, GoTrue's throttle, a 5xx or the resilient helper's timeout say what happened instead, so a coach
 * with the right password is never told it is wrong and locked out for retrying through an auth-server blip. Each
 * answer is one the sign-in form already turns into its own words (getErrorMessage). Synthetic data only.
 */

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map([['x-forwarded-for', '203.0.113.9']])) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const allow = { allowed: true, remaining: 9, resetAt: Date.now() + 60_000 };
const checkRateLimit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit,
  resetRateLimit: vi.fn(),
  RATE_LIMITS: { LOGIN: { maxAttempts: 5, windowMs: 60_000 }, GOLF_SIGNUP: {}, PASSWORD_RESET: {} },
  formatTimeRemaining: () => '1 minute',
}));
const recordFailedLogin = vi.hoisted(() => vi.fn(async () => ({ locked: false, remainingAttempts: 9 })));
vi.mock('@/lib/auth/account-lockout', () => ({
  recordFailedLogin,
  checkAccountLockout: vi.fn(async () => ({ locked: false })),
  resetLoginAttempts: vi.fn(async () => undefined),
  formatLockoutMessage: () => 'locked',
}));
const signIn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/resilient-get-user', () => ({ signInWithPasswordResilient: (...a: unknown[]) => signIn(...a) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: {} })) }));
vi.mock('@/lib/admin-logger', () => ({ logSignup: vi.fn(async () => null), logLogin: vi.fn(async () => null), logSecurityEvent: vi.fn(async () => null) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined), logServerException: vi.fn(async () => undefined) }));
vi.mock('@/lib/observability/golf-login-outcome', () => ({ recordLoginOutcome: vi.fn() }));
vi.mock('@/lib/observability/supabase/observe-auth', () => ({ observeAuthResult: vi.fn() }));
vi.mock('@/lib/analytics/posthog-server', () => ({ captureServer: vi.fn(async () => undefined) }));
vi.mock('@/lib/demo/config.server', () => ({ isDemoCoachEmail: () => false }));

import { loginAction } from '../auth';

const fail = (error: Record<string, unknown>) => signIn.mockResolvedValue({ data: { user: null, session: null }, error });

beforeEach(() => {
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue(allow);
  recordFailedLogin.mockClear();
  signIn.mockReset();
});

describe('loginAction · what a refusal counts and says', () => {
  it('a wrong password counts toward the lockout and says so', async () => {
    fail({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' });
    const r = await loginAction('coach@school.test', 'wrong');
    expect(recordFailedLogin).toHaveBeenCalledTimes(1);
    expect(r.error).toMatch(/^Invalid email or password/);
  });

  it('an older answer with no code but the credentials wording is still a wrong password', async () => {
    fail({ status: 400, message: 'Invalid login credentials' });
    await loginAction('coach@school.test', 'wrong');
    expect(recordFailedLogin).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an unconfirmed email', { code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' }, UNVERIFIED_MESSAGE],
    ['GoTrue’s throttle', { code: 'over_request_rate_limit', status: 429, message: 'rate limited' }, RATE_LIMIT_MESSAGE],
    ['a 5xx', { status: 503, message: 'upstream' }, NETWORK_MESSAGE],
    ['the resilient helper’s timeout', { name: 'AuthRetryableFetchError', status: 0, message: 'timeout' }, NETWORK_MESSAGE],
  ])('%s counts nothing and gets its own words', async (_label, error, words) => {
    fail(error);
    const r = await loginAction('coach@school.test', 'right-password');
    expect(r.success).toBe(false);
    expect(recordFailedLogin).not.toHaveBeenCalled();
    expect(getErrorMessage(r.error ?? '')).toBe(words);
    expect(getErrorMessage(r.error ?? '')).not.toBe(CREDENTIALS_MESSAGE);
  });

  it('the network limit has room for a whole team on one campus IP', async () => {
    fail({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' });
    await loginAction('coach@school.test', 'wrong');
    const ipCall = checkRateLimit.mock.calls.find((c) => String(c[0]).startsWith('login:ip:'));
    expect((ipCall?.[1] as { maxAttempts: number }).maxAttempts).toBeGreaterThanOrEqual(40);
  });
});
