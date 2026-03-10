import { Redis } from '@upstash/redis';

// Initialize Redis client (lazy - only when env vars are set)
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

// Cache TTLs in seconds
const TTL = {
  SHORT: 60,        // 1 minute - frequently changing data
  MEDIUM: 300,      // 5 minutes - moderately changing data
  LONG: 900,        // 15 minutes - stable data
  VERY_LONG: 3600,  // 1 hour - rarely changing data
} as const;

type CacheOptions = {
  ttl?: number;
  tags?: string[];
};

/**
 * Generic cache wrapper with automatic serialization
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { ttl = TTL.MEDIUM } = options;
  const client = getRedis();

  if (client) {
    try {
      // Try to get from cache
      const cachedData = await client.get<T>(key);
      if (cachedData !== null) {
        return cachedData;
      }
    } catch {
      // Cache miss or error - continue to fetch
    }
  }

  // Fetch fresh data
  const data = await fetcher();

  // Store in cache (fire and forget)
  if (client) {
    try {
      await client.set(key, data, { ex: ttl });
    } catch {
      // Cache set failed - silently continue
    }
  }

  return data;
}

/**
 * Invalidate cache by key
 */
async function invalidate(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.del(key);
  } catch {
    // Invalidation failed - silently continue
  }
}

/**
 * Invalidate multiple keys by pattern
 */
async function invalidatePattern(pattern: string): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch {
    // Pattern invalidation failed - silently continue
  }
}

// ============================================================================
// GOLF CACHE HELPERS
// ============================================================================

export const golfCache = {
  // Qualifier leaderboard - changes with each round submission
  leaderboard: {
    key: (qualifierId: string) => `golf:leaderboard:${qualifierId}`,
    ttl: TTL.SHORT, // 1 min - updates frequently during qualifiers
  },

  // Team roster - changes infrequently
  roster: {
    key: (teamId: string) => `golf:roster:${teamId}`,
    ttl: TTL.LONG, // 15 min
  },

  // Player stats - aggregated data
  playerStats: {
    key: (playerId: string) => `golf:player:${playerId}:stats`,
    ttl: TTL.MEDIUM, // 5 min
  },

  // Team events - calendar data
  events: {
    key: (teamId: string, month?: string) =>
      month ? `golf:events:${teamId}:${month}` : `golf:events:${teamId}`,
    ttl: TTL.MEDIUM, // 5 min
  },

  // Course data - rarely changes
  course: {
    key: (courseId: string) => `golf:course:${courseId}`,
    ttl: TTL.VERY_LONG, // 1 hour
  },

  // Team settings - rarely changes
  teamSettings: {
    key: (teamId: string) => `golf:team:${teamId}:settings`,
    ttl: TTL.VERY_LONG, // 1 hour
  },
};

// ============================================================================
// BASEBALL CACHE HELPERS
// ============================================================================

const baseballCache = {
  // Player discovery - filtered results
  discover: {
    key: (filters: string) => `baseball:discover:${filters}`,
    ttl: TTL.MEDIUM, // 5 min
  },

  // Watchlist - changes with user actions
  watchlist: {
    key: (coachId: string) => `baseball:watchlist:${coachId}`,
    ttl: TTL.SHORT, // 1 min
  },

  // Player profile - public data
  playerProfile: {
    key: (playerId: string) => `baseball:player:${playerId}`,
    ttl: TTL.MEDIUM, // 5 min
  },

  // Organization/school data
  organization: {
    key: (orgId: string) => `baseball:org:${orgId}`,
    ttl: TTL.VERY_LONG, // 1 hour
  },

  // Colleges list - static reference data
  colleges: {
    key: () => `baseball:colleges`,
    ttl: TTL.VERY_LONG, // 1 hour
  },

  // High schools by state
  highSchools: {
    key: (state: string) => `baseball:highschools:${state}`,
    ttl: TTL.VERY_LONG, // 1 hour
  },
};

// ============================================================================
// CACHE INVALIDATION HELPERS
// ============================================================================

export const invalidateGolf = {
  leaderboard: (qualifierId: string) =>
    invalidate(golfCache.leaderboard.key(qualifierId)),

  roster: (teamId: string) =>
    invalidate(golfCache.roster.key(teamId)),

  playerStats: (playerId: string) =>
    invalidate(golfCache.playerStats.key(playerId)),

  teamEvents: (teamId: string) =>
    invalidatePattern(`golf:events:${teamId}:*`),

  allTeamData: (teamId: string) =>
    invalidatePattern(`golf:*:${teamId}*`),
};

const invalidateBaseball = {
  watchlist: (coachId: string) =>
    invalidate(baseballCache.watchlist.key(coachId)),

  playerProfile: (playerId: string) =>
    invalidate(baseballCache.playerProfile.key(playerId)),

  discover: () =>
    invalidatePattern(`baseball:discover:*`),
};

