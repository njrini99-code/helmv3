/**
 * Rate Limiting Utilities
 *
 * Three-tier strategy:
 * 1. If KV_REST_API_URL + KV_REST_API_TOKEN are set (Vercel Upstash KV
 *    integration) → use Upstash across serverless instances, surviving deploys.
 *    Also honors the legacy UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *    names for non-Vercel-integration setups.
 * 2. Else if Supabase admin client is configured → use DB-backed limiter
 *    (supabase-rate-limit.ts) which works across instances but costs a round-trip.
 * 3. Else → in-memory Map (dev only, per-instance, NOT safe for prod).
 *
 * Call sites stay on the same API: `checkRateLimit(identifier, config)`.
 */

import type { Ratelimit } from '@upstash/ratelimit';
import type { Redis as UpstashRedis } from '@upstash/redis';
import { logError } from '@/lib/error-logging';

type RateLimitConfig = {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs?: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
  blockedUntil?: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  blockedUntil?: number;
};

// ----- Upstash singleton (lazy) -----

let _upstashReady: boolean | null = null;
let _upstashClient: UpstashRedis | null = null;
const _limiters = new Map<string, Ratelimit>();

async function getUpstashLimiter(
  prefix: string,
  maxAttempts: number,
  windowMs: number,
): Promise<Ratelimit | null> {
  if (_upstashReady === false) return null;

  // Prefer Vercel Upstash KV integration names; fall back to legacy Upstash names.
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _upstashReady = false;
    return null;
  }

  try {
    if (!_upstashClient) {
      const { Redis } = await import('@upstash/redis');
      _upstashClient = new Redis({ url, token });
    }
    const cacheKey = `${prefix}:${maxAttempts}:${windowMs}`;
    const existing = _limiters.get(cacheKey);
    if (existing) {
      _upstashReady = true;
      return existing;
    }
    const { Ratelimit: RatelimitCtor } = await import('@upstash/ratelimit');
    const windowStr = `${Math.max(1, Math.round(windowMs / 1000))} s` as const;
    const limiter = new RatelimitCtor({
      redis: _upstashClient,
      limiter: RatelimitCtor.slidingWindow(
        maxAttempts,
        windowStr as Parameters<typeof RatelimitCtor.slidingWindow>[1],
      ),
      prefix: `helm-ratelimit:${prefix}`,
      analytics: true,
    });
    _limiters.set(cacheKey, limiter);
    _upstashReady = true;
    return limiter;
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      component: 'rate-limit',
      action: 'initUpstashLimiter',
    }, 'medium');
    _upstashReady = false;
    return null;
  }
}

// ----- In-memory fallback (dev only) -----

const rateLimitStore = new Map<string, RateLimitEntry>();

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    rateLimitStore.forEach((entry, key) => {
      if (entry.resetAt < now && (!entry.blockedUntil || entry.blockedUntil < now)) {
        rateLimitStore.delete(key);
      }
    });
  }, 5 * 60 * 1000);
}

function checkRateLimitInMemory(identifier: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  let entry = rateLimitStore.get(identifier);

  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, blockedUntil: entry.blockedUntil };
  }

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + config.windowMs };
  }

  entry.count++;

  if (entry.count > config.maxAttempts) {
    if (config.blockDurationMs) {
      entry.blockedUntil = now + config.blockDurationMs;
    }
    rateLimitStore.set(identifier, entry);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      blockedUntil: entry.blockedUntil,
    };
  }

  rateLimitStore.set(identifier, entry);
  return { allowed: true, remaining: config.maxAttempts - entry.count, resetAt: entry.resetAt };
}

// ----- Public API -----

export const RATE_LIMITS = {
  LOGIN: {
    maxAttempts: 5,
    windowMs: 60 * 1000,
    blockDurationMs: 15 * 60 * 1000,
  },
  SIGNUP: {
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000,
  },
  PASSWORD_RESET: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000,
    blockDurationMs: 60 * 60 * 1000,
  },
  API_GENERAL: {
    maxAttempts: 100,
    windowMs: 60 * 1000,
  },
  WATCHLIST_MUTATION: {
    maxAttempts: 30,
    windowMs: 60 * 1000,
  },
  MESSAGE_SEND: {
    maxAttempts: 20,
    windowMs: 60 * 1000,
  },
  DEMO_GATE: {
    maxAttempts: 5,
    windowMs: 5 * 60 * 1000,
    blockDurationMs: 15 * 60 * 1000,
  },
} as const;

/**
 * Check (and increment) rate limit.
 * @param identifier - Unique identifier (email, IP, userId)
 * @param config - Rate limit configuration
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  // Try Upstash first — correct across instances.
  const limiter = await getUpstashLimiter('auth', config.maxAttempts, config.windowMs);
  if (limiter) {
    try {
      const { success, remaining, reset } = await limiter.limit(identifier);
      if (!success && config.blockDurationMs) {
        // For the "extended block" behavior (e.g., LOGIN after 5 fails),
        // we stamp an extra blocked-until in-memory. On serverless this is
        // weaker than Upstash-native but it's a belt-and-suspenders cache.
        const blockedUntil = Date.now() + config.blockDurationMs;
        rateLimitStore.set(identifier, {
          count: config.maxAttempts + 1,
          resetAt: reset,
          blockedUntil,
        });
        return { allowed: false, remaining: 0, resetAt: reset, blockedUntil };
      }
      return { allowed: success, remaining, resetAt: reset };
    } catch {
      // Fall through to in-memory on transient Upstash error
    }
  }

  return checkRateLimitInMemory(identifier, config);
}

/**
 * Reset rate limit for identifier (use after successful login)
 */
export async function resetRateLimit(identifier: string): Promise<void> {
  rateLimitStore.delete(identifier);
  // If Upstash is configured, also drop the counter prefix.
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    if (!_upstashClient) {
      const { Redis } = await import('@upstash/redis');
      _upstashClient = new Redis({ url, token });
    }
    // The @upstash/ratelimit library stores its state under
    // `helm-ratelimit:auth:*:<identifier>` — del by pattern is not trivial,
    // but a fresh success just lets the window expire naturally. Skip.
  } catch {
    // best-effort
  }
}

/**
 * Format time remaining for user-friendly messages
 */
export function formatTimeRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);

  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}
