/**
 * Plain constants for the team switcher cookie.
 *
 * Lives in src/lib so resolve-team-server.ts can read the cookie without
 * importing from src/app. Imported by team-switcher.ts server actions.
 */

/** Cookie name — keep in sync with the layout reader. */
export const ACTIVE_TEAM_COOKIE = 'golf_active_team';

/** Max-age in seconds — 90 days. */
export const ACTIVE_TEAM_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;
