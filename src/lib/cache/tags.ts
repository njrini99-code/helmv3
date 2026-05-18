/**
 * Cache tags for Next.js Cache Components (`'use cache'` + `cacheTag` +
 * `updateTag`) invalidation. Used by dashboard data caching and mutation
 * action files.
 *
 * 2026-05-17 audit finding P-CRIT-1: these tags were write-only — 25+
 * `updateTag` call sites existed but zero readers wrapped a function in
 * `'use cache'`. The `getCachedXxx` function names in dashboard-data.ts
 * were misleading.
 *
 * Migration approach (Plan 06):
 *   1. Adopt `'use cache'` on read functions one at a time, starting
 *      with the heaviest dashboard reads.
 *   2. Each cached function calls `cacheTag(CACHE_TAGS.DASHBOARD)` AND
 *      `cacheTag(scopedTag('DASHBOARD', 'coach', coachId))` so per-entity
 *      writes don't invalidate everyone.
 *   3. Each write site updates BOTH tags via `updateTag`.
 *   4. The static-analysis test at
 *      `src/test/cache/cache-tag-discipline.test.ts` enforces tag
 *      coverage at CI time.
 *
 * To adopt `'use cache'` on a function:
 *   - Hoist `auth.getUser()` / `cookies()` OUT of the cached function
 *     (cached functions cannot use dynamic APIs).
 *   - Pass resolved ids in as arguments.
 *   - Use `createAdminClient` inside the cached function.
 *   - Tag with both global + scoped tag.
 */
export const CACHE_TAGS = {
    DASHBOARD: 'dashboard',
    STATS: 'stats',
    ROUNDS: 'rounds',
    TEAM: 'team',
    PLAYER: 'player',
    CALENDAR: 'calendar',
    ROSTER: 'roster',
    INSIGHTS: 'insights',
} as const;

export type CacheTagKey = keyof typeof CACHE_TAGS;

/**
 * Build a scoped tag for per-entity invalidation. Use alongside the
 * global tag so writes can target one player/team/coach without
 * busting everyone's cache.
 *
 *   cacheTag(CACHE_TAGS.DASHBOARD);
 *   cacheTag(scopedTag('DASHBOARD', 'coach', coachId));
 *
 *   updateTag(CACHE_TAGS.DASHBOARD);
 *   updateTag(scopedTag('DASHBOARD', 'coach', coachId));
 */
export function scopedTag(key: CacheTagKey, scope: 'coach' | 'player' | 'team', id: string): string {
    return `${CACHE_TAGS[key]}:${scope}:${id}`;
}

/**
 * Profiles for `cacheLife` once a function adopts `'use cache'`. Tune
 * here so every cached read agrees on the same stale/revalidate/expire
 * trade-off for its category.
 *
 * Reference: Next.js Cache Components docs.
 */
export const CACHE_LIFE = {
    // Dashboard reads — coach + player home pages.
    dashboard: {
        stale: 60 * 5,        // 5 min: serve stale while revalidating
        revalidate: 60 * 30,  // 30 min: redo computation in background
        expire: 60 * 60 * 4,  // 4 hr: force redo if no traffic
    },
    // CoachHelm insights — turn over faster than dashboards.
    insights: {
        stale: 60 * 2,
        revalidate: 60 * 10,
        expire: 60 * 60,
    },
    // Stats reads — same shape as dashboard.
    stats: {
        stale: 60 * 5,
        revalidate: 60 * 30,
        expire: 60 * 60 * 4,
    },
    // Roster — rare changes.
    roster: {
        stale: 60 * 30,
        revalidate: 60 * 60 * 2,
        expire: 60 * 60 * 24,
    },
} as const;
