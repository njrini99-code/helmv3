import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/keys.mjs', () => ({ getPublishableKey: () => 'test-publishable-key' }));

// NO mock of @supabase/ssr here — that is the entire point of this file. The
// sibling suite proves the wiring with a stubbed client; this one drives the
// REAL cookie decoder, so it is the only test that can fail when the cookie
// shape this module assumes stops matching the shape Supabase actually writes.
import { observedUserFromHeaders } from '@/lib/observability/observed-user-from-request';

const REF = 'abcdefgh';
const COOKIE = `sb-${REF}-auth-token`;

function sessionCookieValue(expiresInSeconds: number) {
  const session = {
    access_token: 'header.payload.signature',
    refresh_token: 'refresh-token-value',
    token_type: 'bearer',
    expires_in: expiresInSeconds,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    user: { id: '11111111-2222-3333-4444-555555555555', email: 'player@example.com' },
  };
  // Exactly what @supabase/ssr writes: the `base64-` envelope over base64url.
  const base64url = Buffer.from(JSON.stringify(session), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `base64-${base64url}`;
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${REF}.supabase.co`;
  // Any outbound call from the error path is the defect this guards.
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('observedUserFromHeaders against the real Supabase cookie decoder', () => {
  it('names the signed-in user from a cookie in the format Supabase writes', async () => {
    const result = await observedUserFromHeaders({
      cookie: `theme=dark; ${COOKIE}=${sessionCookieValue(3600)}`,
    });

    expect(result).toEqual({
      userId: '11111111-2222-3333-4444-555555555555',
      userEmail: 'player@example.com',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reassembles a chunked cookie, which is how a real session arrives', async () => {
    // Past a size threshold Supabase splits the value across `.0`/`.1`. A
    // reader that only knows the unchunked name silently sees no session and
    // reports "nobody" — the exact failure this module exists to end.
    const value = sessionCookieValue(3600);
    const half = Math.ceil(value.length / 2);

    const result = await observedUserFromHeaders({
      cookie: `${COOKIE}.0=${value.slice(0, half)}; ${COOKIE}.1=${value.slice(half)}`,
    });

    expect(result.userId).toBe('11111111-2222-3333-4444-555555555555');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does NOT dial the auth server for a session inside the refresh margin', async () => {
    // auth-js treats a session within EXPIRY_MARGIN_MS as expired and calls
    // `_callRefreshToken`; `autoRefreshToken: false` does not gate that path.
    // Without the refusing fetch this adds a network round trip to every
    // server-render failure. The access token has not actually expired, so
    // auth-js's own fallback still hands back the session — we keep the name
    // AND stay off the network.
    const result = await observedUserFromHeaders({
      cookie: `${COOKIE}=${sessionCookieValue(30)}`,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.userId).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('reports nobody for a genuinely expired session rather than refreshing it', async () => {
    const result = await observedUserFromHeaders({
      cookie: `${COOKIE}=${sessionCookieValue(-3600)}`,
    });

    expect(result).toEqual({ userId: null, userEmail: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports nobody for a corrupt cookie instead of throwing into the capture', async () => {
    const result = await observedUserFromHeaders({ cookie: `${COOKIE}=base64-not-valid-@@@` });

    expect(result).toEqual({ userId: null, userEmail: null });
  });
});
