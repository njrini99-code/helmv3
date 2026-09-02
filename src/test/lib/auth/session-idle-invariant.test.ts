import { describe, it, expect } from 'vitest';
import {
  SESSION_IDLE_TIMEOUT_MS,
  DEMO_SESSION_IDLE_TIMEOUT_MS,
  NATIVE_APP_SESSION_IDLE_TIMEOUT_MS,
  SESSION_IDLE_COOKIE_MAX_AGE_S,
  isSessionIdleExpired,
} from '@/lib/auth/session-idle-shared';

/**
 * THE INVARIANT: the activity-marker cookie must OUTLIVE every idle window.
 *
 * Idleness is detected by reading a marker and finding it stale. A marker that
 * has expired is indistinguishable from one that was never written, and
 * `isSessionIdleExpired(null, ...)` returns FALSE by design — a freshly
 * authenticated request has no marker yet and must not be bounced.
 *
 * So if the cookie's lifetime is <= the idle window, the marker dies at the
 * exact moment it is needed and the window silently stops existing. Not a
 * weakened boundary: an ABSENT one.
 *
 * This is not hypothetical. NATIVE_APP_SESSION_IDLE_TIMEOUT_MS shipped on
 * 2026-08-19 at 30 days while SESSION_IDLE_COOKIE_MAX_AGE_S was also 30 days,
 * and the comment justifying it called them "matching" — reasoning that a
 * window longer than the marker's lifetime is meaningless (true) and concluding
 * that equal is therefore fine (false). An abandoned native session would never
 * have been asked to re-authenticate.
 *
 * The arithmetic assertion below is the guard. It is deliberately written over
 * an explicit list of every exported window, so adding a new one means adding
 * it here — and a new window longer than the cookie fails the build.
 */

const COOKIE_LIFETIME_MS = SESSION_IDLE_COOKIE_MAX_AGE_S * 1000;

const WINDOWS: ReadonlyArray<readonly [string, number]> = [
  ['SESSION_IDLE_TIMEOUT_MS (web)', SESSION_IDLE_TIMEOUT_MS],
  ['DEMO_SESSION_IDLE_TIMEOUT_MS', DEMO_SESSION_IDLE_TIMEOUT_MS],
  ['NATIVE_APP_SESSION_IDLE_TIMEOUT_MS', NATIVE_APP_SESSION_IDLE_TIMEOUT_MS],
];

describe('the activity marker must outlive every idle window', () => {
  it.each(WINDOWS)('cookie strictly outlives %s', (_name, windowMs) => {
    // STRICTLY greater. Equality is the bug, not the boundary condition.
    expect(COOKIE_LIFETIME_MS).toBeGreaterThan(windowMs);
  });

  it('an absent marker fails OPEN — which is why the lifetime gap matters', () => {
    // Documenting the mechanism the invariant protects. This behaviour is
    // correct and intentional (a just-authenticated request has no marker yet);
    // it is only dangerous when the marker can expire inside a live window.
    expect(isSessionIdleExpired(null, Date.now(), NATIVE_APP_SESSION_IDLE_TIMEOUT_MS)).toBe(false);
  });

  it('a native session idle past its window IS expired while the marker survives', () => {
    const now = Date.now();
    const lastActivity = now - NATIVE_APP_SESSION_IDLE_TIMEOUT_MS - 1;

    // The marker must still be readable at this moment, or the assertion below
    // is unreachable in production no matter what it says here.
    expect(now - lastActivity).toBeLessThan(COOKIE_LIFETIME_MS);
    expect(isSessionIdleExpired(lastActivity, now, NATIVE_APP_SESSION_IDLE_TIMEOUT_MS)).toBe(true);
  });

  it('a native session inside its window is NOT expired', () => {
    const now = Date.now();
    const lastActivity = now - (NATIVE_APP_SESSION_IDLE_TIMEOUT_MS - 60_000);

    // Without this the "fix" could be any absurdly large cookie lifetime paired
    // with a broken window, and the three assertions above would still pass.
    expect(isSessionIdleExpired(lastActivity, now, NATIVE_APP_SESSION_IDLE_TIMEOUT_MS)).toBe(false);
  });
});
