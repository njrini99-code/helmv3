import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The reset email carried Supabase's `action_link`, and that link could never
 * work.
 *
 * `admin.generateLink()` mints it SERVER-SIDE, so the recipient's browser never
 * stored a PKCE `code_verifier`. Supabase's /auth/v1/verify then redirects in
 * whichever flow the project uses:
 *   - PKCE  -> `?code=`, which exchangeCodeForSession() cannot exchange without
 *              the verifier that browser never had;
 *   - implicit -> tokens in the URL FRAGMENT, which the reset page cannot see at
 *              all, because it reads the query string.
 * Both land on "This reset link is invalid or has expired" — deterministically,
 * for every user, which is why sslate@guilford.edu clicked three of these over
 * two days and stayed locked out.
 *
 * A `token_hash` needs no verifier. The reset page's
 * verifyOtp({ type: 'recovery', token_hash }) branch was already written and
 * already correct; it simply never received one.
 */

const generateLink = vi.fn();
const send = vi.fn(async () => ({ error: null }));

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

const RESET_PAGE = 'https://helmsportslabs.com/golf/reset-password';

async function send1() {
  const mod = await import('@/lib/auth/send-password-reset');
  return mod.sendPasswordResetEmail('sslate@guilford.edu', RESET_PAGE, 'GolfHelm');
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 're_test_key';
  generateLink.mockResolvedValue({
    data: {
      properties: {
        hashed_token: 'pkce_abc123hash',
        // Supabase also returns this; emailing it is what broke the flow.
        action_link: 'https://xyz.supabase.co/auth/v1/verify?token=abc&type=recovery&redirect_to=' + RESET_PAGE,
      },
    },
    error: null,
  });
});

/** The URL actually put in front of the user. */
function emailedLink(): string {
  const call = send.mock.calls[0] as unknown as [{ html?: string; text?: string }] | undefined;
  const payload = call?.[0];
  return `${payload?.html ?? ''}${payload?.text ?? ''}`;
}

describe('password reset email — the link must be one the reset page can consume', () => {
  it('sends the user to OUR reset page, not Supabase /auth/v1/verify', async () => {
    expect(await send1()).toBe('sent');

    const body = emailedLink();
    expect(body).toContain(`${RESET_PAGE}?token_hash=pkce_abc123hash&type=recovery`);
    expect(body).not.toContain('/auth/v1/verify');
  });

  it('carries a token_hash, which needs no browser-side PKCE verifier', async () => {
    await send1();

    const body = emailedLink();
    expect(body).toContain('token_hash=pkce_abc123hash');
    expect(body).toContain('type=recovery');
  });
});

describe('password reset email — unchanged behaviour', () => {
  it('still reports no-account when the address has no auth user', async () => {
    generateLink.mockResolvedValue({ data: { properties: {} }, error: null });

    expect(await send1()).toBe('no-account');
    expect(send).not.toHaveBeenCalled();
  });

  it('still reports unconfigured with no Resend key', async () => {
    delete process.env.RESEND_API_KEY;

    expect(await send1()).toBe('unconfigured');
  });
});
