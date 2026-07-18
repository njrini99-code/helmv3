/**
 * Demo gate — client-safe "am I already signed in" probe + demo-session
 * detection. #918.
 *
 * Both the GolfHelm and BaseballHelm demo gates (and the shared idle-timeout
 * flow) need to answer two questions without ever risking an infinite hang:
 *
 *   1. Is the visitor already signed in? (`probeSignedIn`)
 *   2. Is the CURRENT session a demo session? (`isDemoMetadataUser`)
 *
 * Both a stale/expired httpOnly Supabase auth cookie and a network blip can
 * leave `supabase.auth.getUser()`'s internal refresh-token exchange hanging
 * indefinitely — the browser `fetch` GoTrue issues internally has no timeout
 * of its own, so the returned promise may simply never settle. `probeSignedIn`
 * races the real check against a hard deadline and treats ANY failure —
 * timeout, thrown error, or a refresh-token/network error surfaced through
 * `getUser()`'s own `error` field — as "signed out", so a caller built on top
 * of it always resolves and never hangs on a spinner forever.
 *
 * No `'use server'` / `'use client'` directive — this is a plain module safe
 * to import from client components (demo gate pages, the session-activity
 * hook) AND from the Edge-runtime middleware.
 */

/** Hard deadline for the demo gate's "already signed in" probe. */
export const DEMO_AUTH_PROBE_TIMEOUT_MS = 4000;

export class DemoAuthProbeTimeoutError extends Error {
  constructor() {
    super('demo-gate-auth-probe-timeout');
    this.name = 'DemoAuthProbeTimeoutError';
  }
}

/**
 * Races `promise` against a hard deadline. Rejects with a
 * {@link DemoAuthProbeTimeoutError} if `timeoutMs` elapses first. Clears the
 * timer either way so a fast-resolving promise never leaks a pending timeout.
 */
export function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEMO_AUTH_PROBE_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DemoAuthProbeTimeoutError()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Minimal user shape both probe callers care about. */
export interface ProbedUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/** The minimal shape of a Supabase client's `auth.getUser()` this module needs. */
export interface AuthProbeClient {
  auth: {
    getUser: () => Promise<{ data: { user: ProbedUser | null }; error: unknown }>;
  };
}

/**
 * "Am I already signed in?" probe. Treats ANY failure — hard timeout, a
 * thrown error, or a refresh-token/network error surfaced through
 * `getUser()`'s `error` field — as signed out (returns `null`), so a demo
 * gate built on top of this never gets stuck on "Checking sign-in status".
 */
export async function probeSignedIn(
  supabase: AuthProbeClient,
  timeoutMs: number = DEMO_AUTH_PROBE_TIMEOUT_MS,
): Promise<ProbedUser | null> {
  try {
    const { data, error } = await raceWithTimeout(supabase.auth.getUser(), timeoutMs);
    if (error) return null;
    return data.user ?? null;
  } catch {
    return null;
  }
}

/**
 * True when `user`'s metadata marks it as a demo session. Both `enterDemo`
 * (golf) and `enterBaseballDemo` (baseball) stamp `user_metadata.is_demo =
 * true` onto the shared demo account right after sign-in specifically so
 * this check works WITHOUT exposing the demo account's real email to client
 * code — unlike the email, "this is a demo session" carries no secret.
 *
 * Pure/sync — safe to call from the client, the server, and Edge middleware
 * alike on a `user` object already in hand (no extra network round-trip).
 */
export function isDemoMetadataUser(user: ProbedUser | null | undefined): boolean {
  return user?.user_metadata?.is_demo === true;
}
