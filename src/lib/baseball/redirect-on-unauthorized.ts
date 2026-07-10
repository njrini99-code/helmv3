// =============================================================================
// src/lib/baseball/redirect-on-unauthorized.ts
//
// Shared guard for Server Component pages that call a `withBaseballAction`-
// wrapped getter directly. Those getters independently re-resolve auth
// (see src/lib/baseball/with-baseball-action.ts) and throw
// BaseballUnauthorizedError when the session has expired in the narrow window
// between the page's own bare `supabase.auth.getUser()` check and the getter
// call. Left uncaught, that raw-throws through the Server Component render
// straight to error.tsx and the error tracker (Sentry/Vercel) instead of the
// honest "please sign in again" redirect.
//
// Deliberately dependency-free (no import of with-baseball-action.ts, which
// pulls in Sentry + the Supabase server client) so every page importing it
// stays cheap to unit-test — callers pass their own `isUnauthorized`
// predicate, typically `(error) => error instanceof BaseballUnauthorizedError`.
// =============================================================================

import { redirect } from 'next/navigation';

/**
 * Runs `action`; if it throws an error `isUnauthorized` recognizes, redirects
 * to `/baseball/login` with `loginReturnTo` preserved as `returnTo` instead of
 * letting the error propagate. Any other thrown error (a genuine failure for
 * an authenticated, authorized caller) is rethrown unchanged so error.tsx
 * keeps handling real failures.
 */
export async function redirectOnUnauthorized<T>(
  action: () => Promise<T>,
  isUnauthorized: (error: unknown) => boolean,
  loginReturnTo: string,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isUnauthorized(error)) {
      redirect(`/baseball/login?returnTo=${encodeURIComponent(loginReturnTo)}`);
    }
    throw error;
  }
}
