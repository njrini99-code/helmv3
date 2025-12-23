/**
 * Simple in-memory rate limiting for auth endpoints
 * For production, consider using Redis or Upstash for distributed rate limiting
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the window
   */
  maxRequests: number;
  /**
   * Time window in seconds
   */
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (e.g., IP address, user ID, email)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const entry = rateLimitMap.get(identifier);

  // No entry or expired entry - create new one
  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    rateLimitMap.set(identifier, { count: 1, resetAt });
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetAt,
    };
  }

  // Entry exists and not expired
  if (entry.count >= config.maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Increment count
  entry.count++;
  rateLimitMap.set(identifier, entry);

  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get client identifier from request headers
 * Uses x-forwarded-for or x-real-ip if behind proxy, otherwise direct IP
 */
export function getClientIdentifier(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to a default identifier
  return 'unknown';
}

/**
 * Predefined rate limit configs for common use cases
 */
export const RATE_LIMITS = {
  /**
   * Auth endpoints (login, signup, password reset)
   * 5 requests per 15 minutes
   */
  AUTH: { maxRequests: 5, windowSeconds: 15 * 60 },

  /**
   * Email sending (password reset, verification)
   * 3 requests per hour
   */
  EMAIL: { maxRequests: 3, windowSeconds: 60 * 60 },

  /**
   * API mutations (create, update, delete)
   * 30 requests per minute
   */
  API_WRITE: { maxRequests: 30, windowSeconds: 60 },

  /**
   * API queries (read operations)
   * 100 requests per minute
   */
  API_READ: { maxRequests: 100, windowSeconds: 60 },
} as const;
