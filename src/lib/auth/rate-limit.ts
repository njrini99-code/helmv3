/**
 * Rate Limiting Utilities
 *
 * In-memory rate limiting for authentication endpoints.
 * For production, consider Redis-backed rate limiting for multi-instance deployments.
 */

type RateLimitConfig = {
  maxAttempts: number;
  windowMs: number; // Time window in milliseconds
  blockDurationMs?: number; // Optional block duration after exceeding limit
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
  blockedUntil?: number;
};

// In-memory store (use Redis in production for horizontal scaling)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  rateLimitStore.forEach((entry, key) => {
    if (entry.resetAt < now && (!entry.blockedUntil || entry.blockedUntil < now)) {
      rateLimitStore.delete(key);
    }
  });
}, 5 * 60 * 1000);

/**
 * Rate limit configurations by endpoint
 */
export const RATE_LIMITS = {
  LOGIN: {
    maxAttempts: 5,
    windowMs: 60 * 1000, // 1 minute
    blockDurationMs: 15 * 60 * 1000, // 15 minutes after 5 failed attempts
  },
  SIGNUP: {
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  PASSWORD_RESET: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    blockDurationMs: 60 * 60 * 1000, // 1 hour block
  },
  API_GENERAL: {
    maxAttempts: 100,
    windowMs: 60 * 1000, // 1 minute
  },
  WATCHLIST_MUTATION: {
    maxAttempts: 30,
    windowMs: 60 * 1000, // 1 minute
  },
  MESSAGE_SEND: {
    maxAttempts: 20,
    windowMs: 60 * 1000, // 1 minute
  },
} as const;

/**
 * Check if request is rate limited
 *
 * @param identifier - Unique identifier (email, IP, userId)
 * @param config - Rate limit configuration
 * @returns { allowed: boolean, remaining: number, resetAt: number, blockedUntil?: number }
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  blockedUntil?: number;
} {
  const now = Date.now();
  const key = identifier;

  let entry = rateLimitStore.get(key);

  // Check if currently blocked
  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      blockedUntil: entry.blockedUntil,
    };
  }

  // Reset if window expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    };
  }

  // Increment count
  entry.count++;

  // Check if limit exceeded
  if (entry.count > config.maxAttempts) {
    if (config.blockDurationMs) {
      entry.blockedUntil = now + config.blockDurationMs;
    }

    rateLimitStore.set(key, entry);

    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      blockedUntil: entry.blockedUntil,
    };
  }

  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: config.maxAttempts - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Reset rate limit for identifier (use after successful login)
 */
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Get rate limit status without incrementing
 */
function getRateLimitStatus(
  identifier: string,
  config: RateLimitConfig
): {
  count: number;
  remaining: number;
  resetAt: number;
  blockedUntil?: number;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || entry.resetAt < now) {
    return {
      count: 0,
      remaining: config.maxAttempts,
      resetAt: now + config.windowMs,
    };
  }

  return {
    count: entry.count,
    remaining: Math.max(0, config.maxAttempts - entry.count),
    resetAt: entry.resetAt,
    blockedUntil: entry.blockedUntil,
  };
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
