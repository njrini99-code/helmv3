import 'server-only';

import { cookies } from 'next/headers';
import {
  SESSION_IDLE_COOKIE,
  SESSION_IDLE_COOKIE_MAX_AGE_S,
} from '@/lib/auth/session-idle-shared';

/**
 * Start a fresh idle window after authentication succeeds.
 *
 * The marker deliberately outlives the auth session so middleware can detect
 * a stale reopen. That also means a previous session's stale value is still
 * present at the next login unless the login response replaces it. Without
 * this reset, middleware immediately signs out the newly-authenticated user,
 * producing the "sign in twice" loop.
 */
export async function resetSessionIdleMarker(now: number = Date.now()): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_IDLE_COOKIE, String(now), {
    path: '/',
    maxAge: SESSION_IDLE_COOKIE_MAX_AGE_S,
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  });
}
