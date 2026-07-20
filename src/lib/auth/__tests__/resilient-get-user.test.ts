import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getUserResilient,
  isTransientAuthError,
  signInWithPasswordResilient,
} from '@/lib/auth/resilient-get-user';

// Backoff delays are real timers — keep them instant in tests.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

const USER = { id: 'user-1' } as never;

/** Well-formed unexpired JWT whose `sub` matches USER — passes the local
    plausibility check (signature is NOT verified locally by design). */
function plausibleJwt(sub = 'user-1', expInSeconds = 3600): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + expInSeconds }),
  ).toString('base64url');
  return `header.${payload}.signature`;
}

function authClient(overrides: {
  getUser?: ReturnType<typeof vi.fn>;
  getSession?: ReturnType<typeof vi.fn>;
  signInWithPassword?: ReturnType<typeof vi.fn>;
}) {
  return {
    auth: {
      getUser: overrides.getUser ?? vi.fn(),
      getSession:
        overrides.getSession ?? vi.fn().mockResolvedValue({ data: { session: null } }),
      signInWithPassword: overrides.signInWithPassword ?? vi.fn(),
    },
  };
}

describe('isTransientAuthError', () => {
  it('classifies 429, 5xx, and retryable fetch errors as transient', () => {
    expect(isTransientAuthError({ status: 429 })).toBe(true);
    expect(isTransientAuthError({ status: 500 })).toBe(true);
    expect(isTransientAuthError({ status: 503 })).toBe(true);
    expect(isTransientAuthError({ name: 'AuthRetryableFetchError' })).toBe(true);
  });

  it('classifies real auth rejections and absence of error as NOT transient', () => {
    expect(isTransientAuthError(null)).toBe(false);
    expect(isTransientAuthError(undefined)).toBe(false);
    expect(isTransientAuthError({ status: 400 })).toBe(false);
    expect(isTransientAuthError({ status: 401 })).toBe(false);
    expect(isTransientAuthError({ status: 403 })).toBe(false);
    expect(isTransientAuthError({ name: 'AuthApiError', status: 400 })).toBe(false);
  });
});

describe('getUserResilient', () => {
  it('returns the user on first success without extra calls', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: USER }, error: null });
    const client = authClient({ getUser });

    const result = await getUserResilient(client);

    expect(result).toEqual({ user: USER, degraded: false });
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('returns null immediately on a NON-transient error (real sign-out)', async () => {
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    const client = authClient({ getUser });

    const result = await getUserResilient(client);

    expect(result).toEqual({ user: null, degraded: false });
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(client.auth.getSession).not.toHaveBeenCalled();
  });

  it('retries once on a transient error and succeeds', async () => {
    const getUser = vi
      .fn()
      .mockResolvedValueOnce({ data: { user: null }, error: { status: 429 } })
      .mockResolvedValueOnce({ data: { user: USER }, error: null });
    const client = authClient({ getUser });

    const result = await getUserResilient(client);

    expect(result).toEqual({ user: USER, degraded: false });
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('falls back to the LOCAL session when the auth server stays throttled', async () => {
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { status: 429 } });
    const getSession = vi
      .fn()
      .mockResolvedValue({ data: { session: { user: USER, access_token: plausibleJwt() } } });
    const client = authClient({ getUser, getSession });

    const result = await getUserResilient(client);

    expect(result).toEqual({ user: USER, degraded: true });
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing access_token', { user: USER }],
    ['malformed token', { user: USER, access_token: 'not-a-jwt' }],
    ['sub mismatch', { user: USER, access_token: plausibleJwt('someone-else') }],
    ['expired token', { user: USER, access_token: plausibleJwt('user-1', -60) }],
  ])('rejects an implausible local session during fallback: %s', async (_label, session) => {
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { status: 429 } });
    const getSession = vi.fn().mockResolvedValue({ data: { session } });
    const client = authClient({ getUser, getSession });

    const result = await getUserResilient(client);

    expect(result).toEqual({ user: null, degraded: false });
  });

  it('returns null (not degraded) when throttled AND no local session exists', async () => {
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError' } });
    const client = authClient({ getUser });

    const result = await getUserResilient(client);

    expect(result).toEqual({ user: null, degraded: false });
  });
});

describe('signInWithPasswordResilient', () => {
  const CREDS = { email: 'demo@example.com', password: 'pw' };

  it('returns first success without retrying', async () => {
    const signInWithPassword = vi
      .fn()
      .mockResolvedValue({ data: { user: USER, session: {} }, error: null });
    const client = authClient({ signInWithPassword });

    const result = await signInWithPasswordResilient(client, CREDS);

    expect(result.error).toBeNull();
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a non-transient error (wrong credentials)', async () => {
    const signInWithPassword = vi
      .fn()
      .mockResolvedValue({ data: { user: null, session: null }, error: { status: 400 } });
    const client = authClient({ signInWithPassword });

    const result = await signInWithPasswordResilient(client, CREDS);

    expect(result.error).toEqual({ status: 400 });
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and returns the eventual success', async () => {
    const signInWithPassword = vi
      .fn()
      .mockResolvedValueOnce({ data: { user: null, session: null }, error: { status: 429 } })
      .mockResolvedValueOnce({ data: { user: null, session: null }, error: { status: 429 } })
      .mockResolvedValueOnce({ data: { user: USER, session: {} }, error: null });
    const client = authClient({ signInWithPassword });

    const result = await signInWithPasswordResilient(client, CREDS);

    expect(result.error).toBeNull();
    expect(result.data.user).toBe(USER);
    expect(signInWithPassword).toHaveBeenCalledTimes(3);
  });

  it('gives up after the attempt budget and surfaces the last transient error', async () => {
    const signInWithPassword = vi
      .fn()
      .mockResolvedValue({ data: { user: null, session: null }, error: { status: 429 } });
    const client = authClient({ signInWithPassword });

    const result = await signInWithPasswordResilient(client, CREDS);

    expect(result.error).toEqual({ status: 429 });
    expect(signInWithPassword).toHaveBeenCalledTimes(3);
  });
});
