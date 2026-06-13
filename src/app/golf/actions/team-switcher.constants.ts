/**
 * Plain (non-`'use server'`) constants for the team-switcher.
 *
 * A `'use server'` module may ONLY export async functions — Next.js rejects
 * the build otherwise. The active-team cookie name is a plain value, so it
 * lives here and is imported by both the server-action module and the
 * server-side resolver that reads the cookie.
 */

/** Cookie name — keep in sync with every reader/writer of the active team. */
export const ACTIVE_TEAM_COOKIE = 'golf_active_team';

/** Max-age in seconds — 90 days. */
export const ACTIVE_TEAM_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;
