/**
 * Supabase-backed Rate Limiting
 *
 * Replaces the in-memory Map-based rate limiter with a DB-backed solution
 * that works correctly across serverless instances and survives deploys.
 *
 * Uses the `auth_rate_limits` table via an untyped admin client
 * (table is not yet in generated types).
 */

import { createClient } from '@supabase/supabase-js';

type RateLimitConfig = {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs?: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  blockedUntil?: number;
};

type RateLimitRow = {
  key: string;
  count: number;
  window_start: string;
  blocked_until: string | null;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase admin credentials');
  }
  return createClient(url.trim(), serviceRoleKey.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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
 * Check and increment rate limit (DB-backed)
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();

  try {
    const supabase = getAdminClient();

    const { data: entry } = await supabase
      .from('auth_rate_limits')
      .select('key, count, window_start, blocked_until')
      .eq('key', identifier)
      .maybeSingle<RateLimitRow>();

    // Check if currently blocked
    if (entry?.blocked_until) {
      const blockedUntil = new Date(entry.blocked_until).getTime();
      if (blockedUntil > now) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(entry.window_start).getTime() + config.windowMs,
          blockedUntil,
        };
      }
    }

    // Check if window has expired — reset if so
    const windowStart = entry ? new Date(entry.window_start).getTime() : 0;
    const windowExpired = !entry || (windowStart + config.windowMs) < now;

    if (windowExpired) {
      // Start new window
      await supabase
        .from('auth_rate_limits')
        .upsert(
          {
            key: identifier,
            count: 1,
            window_start: new Date(now).toISOString(),
            blocked_until: null,
            updated_at: new Date(now).toISOString(),
          },
          { onConflict: 'key' }
        );

      return {
        allowed: true,
        remaining: config.maxAttempts - 1,
        resetAt: now + config.windowMs,
      };
    }

    // Window still active — increment
    const newCount = (entry?.count ?? 0) + 1;

    if (newCount > config.maxAttempts) {
      // Exceeded limit
      const blockedUntil = config.blockDurationMs
        ? new Date(now + config.blockDurationMs).toISOString()
        : null;

      await supabase
        .from('auth_rate_limits')
        .update({
          count: newCount,
          blocked_until: blockedUntil,
          updated_at: new Date(now).toISOString(),
        })
        .eq('key', identifier);

      return {
        allowed: false,
        remaining: 0,
        resetAt: windowStart + config.windowMs,
        blockedUntil: blockedUntil ? new Date(blockedUntil).getTime() : undefined,
      };
    }

    // Within limit — increment count
    await supabase
      .from('auth_rate_limits')
      .update({
        count: newCount,
        updated_at: new Date(now).toISOString(),
      })
      .eq('key', identifier);

    return {
      allowed: true,
      remaining: config.maxAttempts - newCount,
      resetAt: windowStart + config.windowMs,
    };
  } catch (error) {
    // Fail open on DB errors to prevent DoS via DB outage
    console.error('[RateLimit] DB error, failing open:', error);
    return {
      allowed: true,
      remaining: config.maxAttempts,
      resetAt: now + config.windowMs,
    };
  }
}

/**
 * Reset rate limit for identifier (e.g., after successful login)
 */
export async function resetRateLimit(identifier: string): Promise<void> {
  try {
    const supabase = getAdminClient();
    await supabase
      .from('auth_rate_limits')
      .delete()
      .eq('key', identifier);
  } catch (error) {
    console.error('[RateLimit] Failed to reset:', error);
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
