import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  signOAuthState,
  verifyOAuthState,
  OAUTH_STATE_MAX_AGE_MS,
} from '@/lib/crm/oauth-state';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SECRET = 'test-google-client-secret';

let previous: string | undefined;

beforeEach(() => {
  previous = process.env.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_CLIENT_SECRET = SECRET;
});

afterEach(() => {
  if (previous === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
  else process.env.GOOGLE_CLIENT_SECRET = previous;
});

describe('signOAuthState / verifyOAuthState', () => {
  it('round-trips a state for its own user', () => {
    const payload = verifyOAuthState(signOAuthState(USER), USER);
    expect(payload?.userId).toBe(USER);
  });

  it('rejects a state issued for a different user', () => {
    expect(verifyOAuthState(signOAuthState(OTHER), USER)).toBeNull();
  });

  it('rejects the FORGED state the old format allowed', () => {
    // This is the whole attack: before signing, an attacker who knew a
    // victim's uuid could mint exactly this and the callback accepted it,
    // pairing the attacker's Google authorization code with the victim's
    // session.
    const forged = Buffer.from(
      JSON.stringify({ userId: USER, timestamp: Date.now() }),
    ).toString('base64');
    expect(verifyOAuthState(forged, USER)).toBeNull();
  });

  it('rejects a tampered payload that keeps a valid-looking signature', () => {
    const good = signOAuthState(OTHER);
    const [, mac] = good.split('.');
    const swapped = Buffer.from(
      JSON.stringify({ userId: USER, timestamp: Date.now() }),
    ).toString('base64url');
    expect(verifyOAuthState(`${swapped}.${mac}`, USER)).toBeNull();
  });

  it('rejects a state signed with a different secret', () => {
    const signed = signOAuthState(USER);
    process.env.GOOGLE_CLIENT_SECRET = 'a-different-secret';
    expect(verifyOAuthState(signed, USER)).toBeNull();
  });

  it('expires a state past the max age — the callback never checked this before', () => {
    const now = Date.now();
    const stale = signOAuthState(USER, now - OAUTH_STATE_MAX_AGE_MS - 1);
    expect(verifyOAuthState(stale, USER, now)).toBeNull();
  });

  it('accepts a state just inside the max age', () => {
    const now = Date.now();
    const fresh = signOAuthState(USER, now - OAUTH_STATE_MAX_AGE_MS + 1_000);
    expect(verifyOAuthState(fresh, USER, now)?.userId).toBe(USER);
  });

  it('rejects a state stamped in the future', () => {
    const now = Date.now();
    const ahead = signOAuthState(USER, now + OAUTH_STATE_MAX_AGE_MS + 1);
    expect(verifyOAuthState(ahead, USER, now)).toBeNull();
  });

  it('rejects empty, malformed and dot-less input without throwing', () => {
    expect(verifyOAuthState(null, USER)).toBeNull();
    expect(verifyOAuthState('', USER)).toBeNull();
    expect(verifyOAuthState('no-dot-here', USER)).toBeNull();
    expect(verifyOAuthState('.', USER)).toBeNull();
    expect(verifyOAuthState('body.', USER)).toBeNull();
    expect(verifyOAuthState('not base64.also not a mac', USER)).toBeNull();
  });

  it('returns null rather than throwing when the secret is unset', () => {
    const signed = signOAuthState(USER);
    delete process.env.GOOGLE_CLIENT_SECRET;
    // An OAuth callback must render an error page, never a 500.
    expect(verifyOAuthState(signed, USER)).toBeNull();
  });

  it('fails closed on SIGNING when the secret is unset', () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(() => signOAuthState(USER)).toThrow(/GOOGLE_CLIENT_SECRET/);
  });
});
