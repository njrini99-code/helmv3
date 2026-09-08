import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createServerClient = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}));
vi.mock('@/lib/supabase/keys.mjs', () => ({ getPublishableKey: () => 'test-publishable-key' }));

import {
  observedUserFromHeaders,
  parseCookieHeader,
} from '@/lib/observability/observed-user-from-request';

const SESSION_COOKIE = 'sb-abcdefgh-auth-token';

function clientReturning(session: unknown) {
  return { auth: { getSession: vi.fn(async () => ({ data: { session }, error: null })) } };
}

beforeEach(() => {
  createServerClient.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefgh.supabase.co';
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseCookieHeader', () => {
  it('splits pairs without truncating a base64 value at its padding', () => {
    // The failure this guards: splitting on EVERY '=' cuts a base64 session
    // cookie at its padding, and a truncated session decodes to nothing —
    // which would read as "nobody was signed in" rather than as a parse bug.
    expect(parseCookieHeader('a=1; sb-x-auth-token=base64-eyJhIjoxfQ==; b=2')).toEqual([
      { name: 'a', value: '1' },
      { name: 'sb-x-auth-token', value: 'base64-eyJhIjoxfQ==' },
      { name: 'b', value: '2' },
    ]);
  });

  it('tolerates empty segments and valueless entries', () => {
    expect(parseCookieHeader('; a=1;; =oops; b=')).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: '' },
    ]);
  });
});

describe('observedUserFromHeaders', () => {
  it('returns the signed-in user for a request carrying an auth cookie', async () => {
    createServerClient.mockReturnValue(
      clientReturning({ user: { id: 'user-1', email: 'a@example.com' } }),
    );

    await expect(observedUserFromHeaders({ cookie: `${SESSION_COOKIE}=abc` })).resolves.toEqual({
      userId: 'user-1',
      userEmail: 'a@example.com',
    });
  });

  it('reads the cookie header case-insensitively and joins a repeated one', async () => {
    createServerClient.mockReturnValue(clientReturning({ user: { id: 'user-2', email: null } }));

    await expect(
      observedUserFromHeaders({ Cookie: ['other=1', `${SESSION_COOKIE}=abc`] }),
    ).resolves.toEqual({ userId: 'user-2', userEmail: null });
  });

  it('never constructs a client when no auth cookie is present', async () => {
    // The common anonymous-500 case. Touching the auth machinery to answer a
    // question whose answer is "nobody" is pure cost on an error path.
    await expect(observedUserFromHeaders({ cookie: 'theme=dark' })).resolves.toEqual({
      userId: null,
      userEmail: null,
    });
    await expect(observedUserFromHeaders({})).resolves.toEqual({
      userId: null,
      userEmail: null,
    });
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('degrades to nobody when the session read fails, rather than throwing', async () => {
    // Losing an identity must never cost the error row it was going to label.
    createServerClient.mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: new Error('nope') })),
      },
    });

    await expect(observedUserFromHeaders({ cookie: `${SESSION_COOKIE}=abc` })).resolves.toEqual({
      userId: null,
      userEmail: null,
    });
  });

  it('degrades to nobody when client construction throws', async () => {
    createServerClient.mockImplementation(() => {
      throw new Error('boom');
    });

    await expect(observedUserFromHeaders({ cookie: `${SESSION_COOKIE}=abc` })).resolves.toEqual({
      userId: null,
      userEmail: null,
    });
  });

  it('refuses a placeholder Supabase URL instead of dialling it', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';

    await expect(observedUserFromHeaders({ cookie: `${SESSION_COOKIE}=abc` })).resolves.toEqual({
      userId: null,
      userEmail: null,
    });
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('passes a no-op setAll — a refreshed token has nowhere to go from here', async () => {
    createServerClient.mockReturnValue(clientReturning({ user: { id: 'u', email: null } }));

    await observedUserFromHeaders({ cookie: `${SESSION_COOKIE}=abc` });

    const options = createServerClient.mock.calls[0]![2] as {
      cookies: { getAll: () => unknown; setAll: (v: unknown) => void };
    };
    expect(options.cookies.getAll()).toEqual([{ name: SESSION_COOKIE, value: 'abc' }]);
    expect(() => options.cookies.setAll([{ name: 'x', value: 'y', options: {} }])).not.toThrow();
  });
});
