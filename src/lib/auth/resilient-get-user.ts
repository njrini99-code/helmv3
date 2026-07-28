/**
 * Transient-error-tolerant getUser().
 *
 * `supabase.auth.getUser()` is a NETWORK call to the GoTrue auth server. Under
 * burst load (e.g. a mass demo-invite send — 229 entries in 34 minutes on
 * 2026-06-11) every request funnels through Vercel's shared egress IPs into
 * Supabase's per-IP auth rate limits. When the auth server throttles (429) or
 * hiccups (5xx / network), a plain `getUser()` returns `user: null` — and every
 * caller that treats null as "signed out" bounces a *validly signed-in* user to
 * the login page. That is a mass-logout bug, not an auth decision.
 *
 * This helper distinguishes "the auth server said this token is invalid"
 * (return null — a real sign-out) from "the auth server is unavailable"
 * (retry once, then fall back to the LOCAL session from the cookie — no
 * network). The fallback is safe: every actual data query still presents the
 * JWT to PostgREST, which verifies the signature and enforces RLS locally, so
 * a degraded `user` can never read data a forged token couldn't.
 */

import type { User } from '@supabase/supabase-js';

/** Minimal auth-error shape — works for AuthError and fetch failures alike. */
export interface AuthErrorLike {
  name?: string;
  status?: number;
  message?: string;
}

/**
 * True when the error means "auth server unavailable right now", not
 * "this session is invalid": HTTP 429 (rate limited), any 5xx, or
 * supabase-js's AuthRetryableFetchError (network/fetch failure).
 */
export function isTransientAuthError(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError' || error.name === 'TimeoutError') return true;
  return error.status === 429 || (typeof error.status === 'number' && error.status >= 500);
}

function normalizeThrownAuthError(error: unknown): AuthErrorLike {
  if (error && typeof error === 'object') {
    const value = error as { name?: unknown; status?: unknown; message?: unknown };
    return {
      name: typeof value.name === 'string' ? value.name : undefined,
      status: typeof value.status === 'number' ? value.status : undefined,
      message: typeof value.message === 'string' ? value.message : undefined,
    };
  }
  return { message: String(error) };
}

function isStaleRefreshTokenError(error: AuthErrorLike): boolean {
  return /refresh token/i.test(error.message ?? '');
}

async function readUser(supabase: AuthClientLike) {
  try {
    return await supabase.auth.getUser();
  } catch (error) {
    const normalized = normalizeThrownAuthError(error);
    if (isTransientAuthError(normalized) || isStaleRefreshTokenError(normalized)) {
      return { data: { user: null }, error: normalized };
    }
    throw error;
  }
}

/** Narrow structural client type so middleware + server clients both fit. */
export interface AuthClientLike {
  auth: {
    getUser(): Promise<{ data: { user: User | null }; error: AuthErrorLike | null }>;
    getSession(): Promise<{
      data: { session: { user: User; access_token?: string } | null };
    }>;
  };
}

/**
 * Cheap sanity check on a LOCAL (unverified) session before the degraded
 * fallback trusts it: the access token must be a well-formed, unexpired JWT
 * whose subject matches the session's user id. This blocks casually forged
 * cookies; a determined forger defeats it (we cannot verify an HS256
 * signature without Supabase's secret), which is why RLS remains the actual
 * enforcement layer — PostgREST verifies the signature on every data query,
 * so a forged degraded identity can never read anything a forged token
 * couldn't (i.e. nothing).
 */
function localSessionLooksAuthentic(
  session: { user: User; access_token?: string } | null,
): boolean {
  if (!session?.user?.id || !session.access_token) return false;
  const parts = session.access_token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payloadJson =
      typeof atob === 'function'
        ? atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'))
        : Buffer.from(parts[1]!, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as { sub?: string; exp?: number };
    if (payload.sub !== session.user.id) return false;
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

const RETRY_DELAY_MS = 250;

function jitteredDelay(): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, RETRY_DELAY_MS + Math.floor(Math.random() * RETRY_DELAY_MS)),
  );
}

export interface ResilientUserResult {
  user: User | null;
  /**
   * True when `user` came from the LOCAL session because the auth server was
   * unavailable after a retry. Callers may log this; they should still treat
   * `user` as signed-in (RLS remains the enforcement layer).
   */
  degraded: boolean;
}

/** Structural client type for the password sign-in retry helper below. */
export interface PasswordSignInClientLike {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): Promise<{
      data: { user: User | null; session: unknown };
      error: AuthErrorLike | null;
    }>;
  };
}

const SIGN_IN_BACKOFF_BASE_MS = 350;

/**
 * Per-attempt cap + total budget for the retry loop. The server client's
 * fetch override aborts at 10s — three of those plus backoff (~32s) is far
 * too long to hold a gate submission open. Each attempt is raced against a
 * shorter deadline (the underlying request keeps running; we just stop
 * waiting), and no new attempt starts once the total budget is spent.
 */
const SIGN_IN_ATTEMPT_TIMEOUT_MS = 5_000;
const SIGN_IN_TOTAL_BUDGET_MS = 12_000;

type SignInResult = {
  data: { user: User | null; session: unknown };
  error: AuthErrorLike | null;
};

const SIGN_IN_TIMEOUT_RESULT: SignInResult = {
  data: { user: null, session: null },
  // Shaped as a transient error so the retry loop treats a slow auth server
  // exactly like an unreachable one.
  error: { name: 'AuthRetryableFetchError' },
};

function raceAttempt(attempt: Promise<SignInResult>): Promise<SignInResult> {
  return Promise.race([
    attempt,
    new Promise<SignInResult>((resolve) =>
      setTimeout(() => resolve(SIGN_IN_TIMEOUT_RESULT), SIGN_IN_ATTEMPT_TIMEOUT_MS),
    ),
  ]);
}

/**
 * signInWithPassword() with retry on transient auth-server failures.
 *
 * The demo gates sign every visitor into a shared account SERVER-SIDE, so all
 * sign-ins reach Supabase from Vercel's shared egress IPs — a mass-send burst
 * can trip the per-IP sign-in rate limit even though each visitor only signed
 * in once. A 429/5xx/network failure here is congestion, not a wrong password:
 * retry up to `attempts` times with jittered exponential backoff before giving
 * up. Non-transient errors (bad credentials, disabled user) return immediately.
 */
export async function signInWithPasswordResilient(
  supabase: PasswordSignInClientLike,
  credentials: { email: string; password: string },
  attempts = 3,
): Promise<SignInResult> {
  const startedAt = Date.now();
  let last = await raceAttempt(supabase.auth.signInWithPassword(credentials));
  for (let attempt = 1; attempt < attempts; attempt++) {
    if (last.data.session || !isTransientAuthError(last.error)) return last;
    if (Date.now() - startedAt >= SIGN_IN_TOTAL_BUDGET_MS) return last;
    const backoff = SIGN_IN_BACKOFF_BASE_MS * 2 ** (attempt - 1);
    await new Promise((resolve) =>
      setTimeout(resolve, backoff + Math.floor(Math.random() * backoff)),
    );
    last = await raceAttempt(supabase.auth.signInWithPassword(credentials));
  }
  return last;
}

/**
 * getUser() that only returns `user: null` when the auth server actually
 * rejected the session (or there is no local session at all) — never because
 * the auth server was briefly unreachable.
 */
export async function getUserResilient(
  supabase: AuthClientLike,
  options: { retryTransient?: boolean } = {},
): Promise<ResilientUserResult> {
  const first = await readUser(supabase);
  if (first.data.user) return { user: first.data.user, degraded: false };
  if (!isTransientAuthError(first.error)) return { user: null, degraded: false };

  if (options.retryTransient !== false) {
    await jitteredDelay();

    const second = await readUser(supabase);
    if (second.data.user) return { user: second.data.user, degraded: false };
    if (!isTransientAuthError(second.error)) return { user: null, degraded: false };
  }

  // Auth server still unavailable — fall back to the locally-stored session.
  // getSession() reads the cookie without a verification round-trip; if there
  // is no session cookie the user really is signed out.
  //
  // Suppress auth-js's "could be insecure" console.warn for this DELIBERATE
  // unverified read (it would flood Vercel logs with red herrings during the
  // exact burst incidents this fallback exists to survive). Private flag —
  // guarded so a library upgrade that removes it just brings the warn back.
  try {
    (supabase.auth as { suppressGetSessionWarning?: boolean }).suppressGetSessionWarning = true;
  } catch {
    // Non-fatal: worst case the warn logs.
  }
  const { data: { session } } = await supabase.auth.getSession();
  const user = localSessionLooksAuthentic(session) ? session!.user : null;
  return { user, degraded: user !== null };
}
