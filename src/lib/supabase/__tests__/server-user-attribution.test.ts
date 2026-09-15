/**
 * The Bridge's user attribution is captured once, in `createClient()`, because
 * `auth.getUser()` has 583 call sites in `src/`. These tests pin the two
 * properties that make that safe: the auth answer is unchanged, and the
 * expired-session path performs NO network call and NO cookie write.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookieRows: [] as Array<{ name: string; value: string }>,
  setCalls: [] as unknown[],
  getUser: vi.fn(),
  getSession: vi.fn(async () => {
    throw new Error('getSession must not be called — it refreshes and rotates the refresh token');
  }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => mocks.cookieRows,
    set: (...args: unknown[]) => { mocks.setCalls.push(args); },
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser, getSession: mocks.getSession } }),
}));

vi.mock('@sentry/nextjs', () => ({ instrumentSupabaseClient: () => {} }));
vi.mock('@supabase/supabase-js/tracing', () => ({}));
vi.mock('@/lib/supabase/keys.mjs', () => ({ getPublishableKey: () => 'test-key' }));

import { createClient } from '@/lib/supabase/server';
import { __runWithRequestContextForTests, getRequestUserId, isRequestUserIdUnverified } from '@/lib/admin/request-context';

/** A session cookie in @supabase/ssr's format, holding a JWT with this sub. */
function sessionCookie(sub: string, { base64 = true, chunks = 1 } = {}) {
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub })).toString('base64url'),
    'not-a-real-signature',
  ].join('.');
  const json = JSON.stringify({ access_token: jwt });
  const value = base64 ? `base64-${Buffer.from(json).toString('base64')}` : json;
  if (chunks === 1) return [{ name: 'sb-proj-auth-token', value }];
  const size = Math.ceil(value.length / chunks);
  return Array.from({ length: chunks }, (_, i) => ({
    name: `sb-proj-auth-token.${i}`,
    value: value.slice(i * size, (i + 1) * size),
  }));
}

describe('createClient user attribution', () => {
  beforeEach(() => {
    mocks.cookieRows = [];
    mocks.setCalls.length = 0;
    mocks.getUser.mockReset();
    mocks.getSession.mockClear();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
  });

  it('records the verified user id when getUser resolves one', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'verified-1' } }, error: null });
    await __runWithRequestContextForTests({ requestId: 'r', action: 'a' }, async () => {
      const client = await createClient();
      await client.auth.getUser();
      expect(getRequestUserId()).toBe('verified-1');
      expect(isRequestUserIdUnverified()).toBe(false);
    });
  });

  it('returns the original getUser result untouched (auth behaviour unchanged)', async () => {
    const answer = { data: { user: null }, error: { status: 401, message: 'bad jwt' } };
    mocks.getUser.mockResolvedValue(answer);
    await __runWithRequestContextForTests({ requestId: 'r', action: 'a' }, async () => {
      const client = await createClient();
      expect(await client.auth.getUser()).toBe(answer);
    });
  });

  it('attributes an expired session from the cookie WITHOUT calling getSession', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    mocks.cookieRows = sessionCookie('expired-user-9');
    await __runWithRequestContextForTests({ requestId: 'r', action: 'savePartialRound' }, async () => {
      const client = await createClient();
      await client.auth.getUser();
      expect(getRequestUserId()).toBe('expired-user-9');
      expect(isRequestUserIdUnverified()).toBe(true);
    });
    // The whole reason this decodes the cookie by hand.
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.setCalls).toHaveLength(0);
  });

  it('reassembles a chunked cookie in order', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    mocks.cookieRows = sessionCookie('chunked-user', { chunks: 3 });
    await __runWithRequestContextForTests({ requestId: 'r', action: 'a' }, async () => {
      const client = await createClient();
      await client.auth.getUser();
      expect(getRequestUserId()).toBe('chunked-user');
    });
  });

  it('reads an unencoded (non base64-) cookie too', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    mocks.cookieRows = sessionCookie('plain-user', { base64: false });
    await __runWithRequestContextForTests({ requestId: 'r', action: 'a' }, async () => {
      const client = await createClient();
      await client.auth.getUser();
      expect(getRequestUserId()).toBe('plain-user');
    });
  });

  it('stays silent on an unrecognised cookie shape rather than throwing', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    mocks.cookieRows = [{ name: 'sb-proj-auth-token', value: 'base64-@@not-json@@' }];
    await __runWithRequestContextForTests({ requestId: 'r', action: 'a' }, async () => {
      const client = await createClient();
      await expect(client.auth.getUser()).resolves.toBeDefined();
      expect(getRequestUserId()).toBeNull();
    });
  });
});
