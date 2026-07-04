// =============================================================================
// Canonical BaseballHelm stats routes.
//
// Policy: `/stats/games/create` is canonical. The old `/stats/games/new`
// redirect alias was removed after app/e2e references were migrated.
// =============================================================================

export const BASEBALL_STATS_GAME_CREATE_PATH =
  '/baseball/dashboard/stats/games/create' as const;

export function getBaseballStatsGameCreateHref(): string {
  return BASEBALL_STATS_GAME_CREATE_PATH;
}
