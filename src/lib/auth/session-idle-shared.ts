/**
 * Shared session idle-timeout config + helpers.
 *
 * Imported by BOTH the server middleware (`updateSession`) and the client
 * activity hook (`useSessionActivity`) so they agree on the cookie name, the
 * idle window, and the "is this session stale?" decision. Plain module — no
 * `'use client'`, no `server-only` — safe to import from either side.
 *
 * Requirement: a user who has been away for the idle window must sign in again
 * instead of being silently auto-loaded back into the app.
 */

/** Cookie holding the epoch-ms timestamp of the last real user activity. */
export const SESSION_IDLE_COOKIE = 'sb_last_activity';

/**
 * Idle window for authenticated staff sessions.
 *
 * Five minutes was far too aggressive for a coaching product: reviewing a
 * round, watching film, or working in another tab could leave a fully rendered
 * dashboard on screen whose next click was intercepted by middleware and sent
 * to login. Keep the security boundary, but make it a work-session boundary.
 */
export const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Idle window for SHARED DEMO sessions (golf/baseball demo gate visitors).
 *
 * Demo visitors are prospects mid-evaluation: they read the invite email, poke
 * the app, switch to another tab or their inbox, and come back. Bouncing them
 * to the gate form after 5 quiet minutes reads as "the demo logged me out"
 * (the June 2026 mass-send failure mode) and loses the prospect. The demo
 * account holds no real user data — a longer window costs nothing.
 */
export const DEMO_SESSION_IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Idle window for the NATIVE iOS/Android app.
 *
 * The 8-hour staff window above is a SHARED-BROWSER boundary: it protects a
 * coach who leaves a dashboard open on a team laptop or a library machine.
 * The native app has a different threat model and a different usage shape —
 * it is installed on one person's device, behind that device's own passcode
 * or Face ID, and "close the app" is its normal, constant gesture rather than
 * "walk away from a terminal".
 *
 * With the 8-hour window applied to it, a coach who used the app on Monday
 * evening and opened it again Tuesday morning crossed the window while doing
 * nothing wrong, and the reopen bounced them to /login?message=session_expired
 * every single time. Reported 2026-08-18 by a customer whose whole staff hit
 * it daily ("my guys still get logged out every time you close the app") — it
 * reads as the app being broken, not as a security feature.
 *
 * The marker cookie MUST OUTLIVE this window — see
 * {@link SESSION_IDLE_COOKIE_MAX_AGE_S}, which is deliberately longer.
 *
 * This comment previously said 30 days "matches" the cookie's max-age, and had
 * the invariant backwards. It is true that a window longer than the marker's
 * lifetime is meaningless; the error was concluding that EQUAL is therefore
 * correct. Equal is exactly as broken as longer: the marker expires at the same
 * instant the window is crossed, so the one request that needs to read a stale
 * marker finds none, and `isSessionIdleExpired(null, ...)` fails open to "not
 * idle". The native idle boundary silently did not exist — an abandoned app
 * session would never be asked to re-authenticate, no matter how long it sat.
 */
export const NATIVE_APP_SESSION_IDLE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * UA marker appended by the Capacitor shell on BOTH platforms (see the
 * `appendUserAgent` entries in capacitor.config.ts). `src/proxy.ts` and the
 * auth middleware already key native-app behaviour off this same literal.
 */
export const NATIVE_APP_UA_MARKER = 'HelmSportsLabsApp';

/**
 * True when a request/browser is the native app shell.
 *
 * Deliberately usable from BOTH sides: the server passes the request's
 * `user-agent` header, the client passes `navigator.userAgent` (Capacitor's
 * `appendUserAgent` puts the marker on the WebView UA, so page JS sees it
 * too). One definition keeps the middleware and the client hook from
 * disagreeing about whether a session is idle — a disagreement would mean the
 * client signs the user out while the server considers them active, which is
 * the exact bug this fixes, just relocated.
 */
export function isNativeAppUserAgent(ua: string | null | undefined): boolean {
  return typeof ua === 'string' && ua.includes(NATIVE_APP_UA_MARKER);
}

/**
 * While the tab is visible, refresh the activity marker on this interval so
 * reading a dashboard (no mouse/keyboard) does not trip the idle window.
 * Must stay well below {@link SESSION_IDLE_TIMEOUT_MS}.
 */
export const SESSION_VISIBLE_HEARTBEAT_MS = 60 * 1000; // 1 minute

/**
 * Cookie lifetime — deliberately MUCH longer than the timeout.
 *
 * If the cookie expired *at* the timeout it would vanish exactly when we need to
 * read it to detect staleness (a fail-open bug: a missing marker would look like
 * "just active"). A long-lived marker guarantees that a genuine reopen after the
 * idle window is always "present + stale", never "absent".
 *
 * So this MUST be strictly greater than the LONGEST idle window, which is
 * {@link NATIVE_APP_SESSION_IDLE_TIMEOUT_MS} at 30 days. It sat at exactly 30
 * days, which met the letter of the paragraph above and broke its intent for
 * native sessions. 45 days restores the headroom for every window.
 *
 * `session-idle-invariant.test.ts` pins this against every exported window, so
 * adding a new one longer than 45 days fails the build rather than silently
 * re-opening the hole.
 */
export const SESSION_IDLE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 45; // 45 days

/** Parse a cookie value into epoch ms, or `null` when absent/malformed. */
export function parseLastActivity(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const ms = Number.parseInt(raw, 10);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * True when a session has been idle past the timeout.
 *
 * Fail-open on absent/malformed: a missing marker is treated as "not idle" so a
 * freshly-authenticated request (before the marker is written) is never bounced.
 * The long cookie lifetime is what makes the real reopen case "present + stale".
 *
 * `timeoutMs` defaults to the standard window; demo-session callers pass
 * {@link DEMO_SESSION_IDLE_TIMEOUT_MS}.
 */
export function isSessionIdleExpired(
  lastActivity: number | null,
  now: number,
  timeoutMs: number = SESSION_IDLE_TIMEOUT_MS,
): boolean {
  if (lastActivity === null) return false;
  return now - lastActivity >= timeoutMs;
}
