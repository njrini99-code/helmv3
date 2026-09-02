// ============================================================================
// GOOGLE OAUTH `state` — signer / verifier
// ============================================================================
//
// The Google Calendar connect flow used an UNSIGNED state:
//
//   base64(JSON.stringify({ userId, timestamp }))
//
// and both consumers checked `decodedState.userId === session user id`. That
// blocks a MISMATCH; it does not block FORGERY, because the attacker writes the
// state. Given a victim's user UUID, an attacker could obtain an authorization
// code for a Google account they control, mint a state naming the victim, and
// have the victim's authenticated browser complete the callback. The exchange
// then persisted the ATTACKER's access + refresh tokens as the victim's
// calendar credentials — classic OAuth account-linking, and the reason RFC 6749
// §10.12 wants state to be unguessable rather than merely present.
//
// The fix is an HMAC over the same payload, verified in constant time, with the
// expiry enforced on BOTH consumers (the callback previously checked identity
// but not age, so a captured state stayed valid indefinitely).
//
// KEY CHOICE, deliberate: the secret is derived from GOOGLE_CLIENT_SECRET
// rather than a new env var. A fresh `GOOGLE_OAUTH_STATE_SECRET` would be unset
// in production on the day this ships, and an unset secret is exactly how this
// repo has broken things before (see the CRM_UNSUB_SECRET fallback found
// 2026-08-01). GOOGLE_CLIENT_SECRET is already REQUIRED for this flow — both
// routes refuse to run without it — so keying off it adds no new way to be
// misconfigured, and the domain separator below keeps the derived key from
// colliding with any other use of that secret.
//
// Node-runtime only (node:crypto). Import from API routes / server code.
// ============================================================================
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Domain separator, so this key cannot collide with another use of the same secret. */
const KEY_CONTEXT = 'helm:google-calendar:oauth-state:v1';

/** How long a state stays valid. Matches the 5 minutes the POST route already enforced. */
export const OAUTH_STATE_MAX_AGE_MS = 5 * 60 * 1000;

export interface OAuthStatePayload {
  userId: string;
  timestamp: number;
}

function requireStateSecret(): string {
  const value = process.env.GOOGLE_CLIENT_SECRET;
  if (!value) {
    // Fail closed on SIGNING, mirroring signUnsubToken(). Callers reach this
    // only after their own GOOGLE_CLIENT_SECRET check, so in practice it is
    // unreachable — it exists so a future caller cannot sign with `undefined`.
    throw new Error('GOOGLE_CLIENT_SECRET is not set — refusing to sign an OAuth state.');
  }
  return `${KEY_CONTEXT}:${value}`;
}

function macFor(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function constantTimeMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Produce a signed state for the given user.
 *
 * Shape is `<base64url(payload)>.<base64url(hmac)>` — a dot, because the old
 * unsigned value was plain base64 and never contained one. Anything without a
 * dot is therefore recognisably a pre-fix state and is rejected, rather than
 * being parsed as JSON and quietly trusted.
 */
export function signOAuthState(userId: string, now: number = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ userId, timestamp: now })).toString('base64url');
  return `${body}.${macFor(body, requireStateSecret())}`;
}

/**
 * Verify a state against the session user.
 *
 * Returns the decoded payload only when the signature is valid, the payload
 * names this user, and the state is within OAUTH_STATE_MAX_AGE_MS. Never
 * throws: a missing secret, malformed input or bad signature all return null,
 * because an OAuth callback must render an error page rather than a 500.
 */
export function verifyOAuthState(
  state: string | null | undefined,
  userId: string,
  now: number = Date.now(),
): OAuthStatePayload | null {
  if (!state || !userId) return null;

  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) return null;

  const dot = state.lastIndexOf('.');
  if (dot <= 0 || dot === state.length - 1) return null;

  const body = state.slice(0, dot);
  const mac = state.slice(dot + 1);
  if (!constantTimeMatch(mac, macFor(body, `${KEY_CONTEXT}:${secret}`))) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as OAuthStatePayload;
  } catch {
    return null;
  }

  if (typeof payload?.userId !== 'string' || typeof payload?.timestamp !== 'number') return null;
  if (payload.userId !== userId) return null;
  // Enforced on BOTH consumers now. The callback checked identity and not age,
  // so a captured state was replayable for as long as the attacker liked.
  if (now - payload.timestamp > OAUTH_STATE_MAX_AGE_MS) return null;
  // A clock-skew allowance in the other direction: a state stamped in the
  // future is not something an honest client produces.
  if (payload.timestamp - now > OAUTH_STATE_MAX_AGE_MS) return null;

  return payload;
}
