// =============================================================================
// Canonical BaseballHelm stats routes and temporary redirect aliases (#378).
//
// Policy: `/stats/games/create` is canonical. `/stats/games/new` redirects until
// bookmarks and external docs fully migrate (see BASEBALL_STATS_ROUTE_ALIASES).
// =============================================================================

export const BASEBALL_STATS_GAME_CREATE_PATH =
  '/baseball/dashboard/stats/games/create' as const;

/** Legacy path — kept as a redirect alias only; do not link in app UI. */
export const BASEBALL_STATS_GAME_CREATE_LEGACY_PATH =
  '/baseball/dashboard/stats/games/new' as const;

/**
 * Redirect aliases: legacy → canonical. App code must use canonical paths only.
 */
export const BASEBALL_STATS_ROUTE_ALIASES = {
  [BASEBALL_STATS_GAME_CREATE_LEGACY_PATH]: BASEBALL_STATS_GAME_CREATE_PATH,
} as const;

export type BaseballStatsLegacyRoute = keyof typeof BASEBALL_STATS_ROUTE_ALIASES;



export function getBaseballStatsGameCreateHref(): string {
  return BASEBALL_STATS_GAME_CREATE_PATH;
}
