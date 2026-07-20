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

/** Idle window: sign the user out after this long without activity. */
export const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Idle window for SHARED DEMO sessions (golf/baseball demo gate visitors).
 *
 * Demo visitors are prospects mid-evaluation: they read the invite email, poke
 * the app, switch to another tab or their inbox, and come back. Bouncing them
 * to the gate form after 5 quiet minutes reads as "the demo logged me out"
 * (the June 2026 mass-send failure mode) and loses the prospect. The demo
 * account holds no real user data — a longer window costs nothing.
 */
export const DEMO_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

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
 */
export const SESSION_IDLE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

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
