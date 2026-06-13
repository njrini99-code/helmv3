/**
 * Plain (non-'use server') constants for the team switcher.
 *
 * A 'use server' module may only export async functions, so the cookie name and
 * max-age live here and are imported by team-switcher.ts (the server actions) and
 * resolve-team-server.ts (the cookie reader).
 */

/** Cookie name — keep in sync with the layout reader. */
export const ACTIVE_TEAM_COOKIE = 'golf_active_team';

/** Max-age in seconds — 90 days. */
export const ACTIVE_TEAM_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;
