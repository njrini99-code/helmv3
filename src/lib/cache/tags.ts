/**
 * Cache tags for Next.js unstable_cache + updateTag() invalidation.
 * Used by dashboard data caching and mutation action files.
 */
export const CACHE_TAGS = {
    DASHBOARD: 'dashboard',
    STATS: 'stats',
    ROUNDS: 'rounds',
    TEAM: 'team',
    PLAYER: 'player',
    CALENDAR: 'calendar',
    ROSTER: 'roster',
} as const;
