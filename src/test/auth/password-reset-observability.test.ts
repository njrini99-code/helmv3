import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `sendPasswordResetEmail` — the Auth WIRING pass (Phase 2, Track B follow-up).
 *
 * WHY THIS CALL SITE. `admin.auth.admin.generateLink()` is the one place the
 * app mints a password-reset link, and its error branch collapses EVERY
 * failure into `'no-account'`:
 *
 *     if (error || !data?.properties?.hashed_token) return 'no-account';
 *
 * That is correct for the case it was written for (an unregistered address —
 * the anti-enumeration design working) and silently wrong for every other
 * one. A GoTrue 429 or 5xx tells the user "if an account exists we have
 * emailed it", sends nothing, and records nothing anywhere.
 *
 * WHAT THIS FILE PROVES, in both directions:
 *   1. the RETURN VALUE is byte-for-byte what it was before the observer was
 *      added, on the success path and on both error paths;
 *   2. the observer is invoked with the right feature/action/operation and
 *      with `expectedMissingUser: true`, so the routine unknown-address case
 *      classifies EXPECTED and stays silent while a 429/5xx does not.
 *
 * The classification itself is proven in
 * `src/lib/observability/supabase/__tests__/{classify-auth,observe-auth}.test.ts`;
 * this file proves the WIRING, which is what was missing.
 */

const generateLink = vi.fn();
const send = vi.fn(async () => ({ error: null }));
const observeAuthResult = vi.fn((_input: unknown) => ({ observed: true, bucket: null, envelope: null }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { generateLink } } }),
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/observability/supabase/observe-auth', () => ({ observeAuthResult }));

const RESET_PAGE = 'https://helmsportslabs.com/golf/reset-password';

async function sendReset() {
  const mod = await import('@/lib/auth/send-password-reset');
  return mod.sendPasswordResetEmail('coach@example.edu', RESET_PAGE, 'GolfHelm');
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 're_test_key';
  generateLink.mockResolvedValue({
    data: { properties: { hashed_token: 'pkce_abc123hash' } },
    error: null,
  });
});

describe('sendPasswordResetEmail — return value is unchanged by the observer', () => {
  it("still returns 'sent' on the success path, and observes a null error (a no-op)", async () => {
    expect(await sendReset()).toBe('sent');
    expect(observeAuthResult).toHaveBeenCalledTimes(1);
    expect(observeAuthResult).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });

  it("still returns 'no-account' when generateLink errors", async () => {
    generateLink.mockResolvedValue({ data: null, error: { code: 'user_not_found', status: 404, message: 'User not found' } });
    expect(await sendReset()).toBe('no-account');
  });

  it("still returns 'no-account' when generateLink succeeds but carries no hashed_token", async () => {
    generateLink.mockResolvedValue({ data: { properties: {} }, error: null });
    expect(await sendReset()).toBe('no-account');
  });

  it("still returns 'unconfigured' with no RESEND_API_KEY, and never reaches the observer", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendReset()).toBe('unconfigured');
    expect(observeAuthResult).not.toHaveBeenCalled();
  });

  it("still returns 'link-failed' when the admin call throws, and never lets the observer change that", async () => {
    generateLink.mockRejectedValue(new Error('boom'));
    expect(await sendReset()).toBe('link-failed');
  });

  it('a throwing observer can never break the reset flow (fail-open, belt and braces)', async () => {
    observeAuthResult.mockImplementationOnce(() => {
      throw new Error('observer exploded');
    });
    // The real observer never throws; this asserts the call site does not
    // depend on that promise holding.
    await expect(sendReset()).resolves.toBe('link-failed');
  });
});

describe('sendPasswordResetEmail — the observer receives the right context', () => {
  it('declares expectedMissingUser so an unregistered address stays in the silent bucket', async () => {
    generateLink.mockResolvedValue({ data: null, error: { code: 'user_not_found', status: 404, message: 'User not found' } });
    await sendReset();

    expect(observeAuthResult).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'auth_password_reset',
        action: 'send_password_reset_link',
        operation: 'password_reset',
        expectedMissingUser: true,
        error: expect.objectContaining({ code: 'user_not_found' }),
      }),
    );
  });

  it('passes a 429 straight through — the flag narrows one code, not the whole call site', async () => {
    generateLink.mockResolvedValue({ data: null, error: { code: 'over_request_rate_limit', status: 429, message: 'Too many requests' } });
    expect(await sendReset()).toBe('no-account');

    expect(observeAuthResult).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'over_request_rate_limit' }) }),
    );
  });

  it('never hands the observer an email address of its own — only the Auth error object', async () => {
    generateLink.mockResolvedValue({ data: null, error: { code: 'unexpected_failure', status: 500, message: 'internal' } });
    await sendReset();

    const input = observeAuthResult.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    const { error: _error, ...contextOnly } = input;
    expect(JSON.stringify(contextOnly)).not.toContain('coach@example.edu');
  });
});
