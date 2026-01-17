/**
 * Retry utilities for Supabase queries
 *
 * Handles transient failures like:
 * - Connection timeouts
 * - Rate limiting (429)
 * - Service unavailable (503)
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  // Check for Supabase/Postgres error codes
  if (typeof error === 'object' && error !== null) {
    const err = error as { code?: string; status?: number; message?: string };

    // Connection/timeout errors
    if (err.code === 'PGRST301' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
      return true;
    }

    // HTTP status codes that are retryable
    if (err.status === 429 || err.status === 503 || err.status === 502 || err.status === 504) {
      return true;
    }

    // Check error message for common transient issues
    if (err.message) {
      const msg = err.message.toLowerCase();
      if (
        msg.includes('timeout') ||
        msg.includes('connection') ||
        msg.includes('unavailable') ||
        msg.includes('too many') ||
        msg.includes('rate limit')
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt or non-retryable errors
      if (attempt === opts.maxAttempts || !isRetryableError(error)) {
        throw error;
      }

      // Log retry attempt (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[Supabase Retry] Attempt ${attempt} failed, retrying in ${delay}ms...`, error);
      }

      // Wait before retrying
      await sleep(delay);

      // Increase delay for next attempt (exponential backoff with jitter)
      const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15 multiplier
      delay = Math.min(delay * opts.backoffMultiplier * jitter, opts.maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Wrapper for Supabase queries with built-in retry
 *
 * Usage:
 * const { data, error } = await retryQuery(() =>
 *   supabase.from('table').select('*').eq('id', id)
 * );
 */
export async function retryQuery<T>(
  queryFn: () => Promise<{ data: T; error: unknown }>,
  options: RetryOptions = {}
): Promise<{ data: T; error: unknown }> {
  try {
    const result = await withRetry(async () => {
      const { data, error } = await queryFn();

      // If there's a retryable error, throw it so withRetry can handle it
      if (error && isRetryableError(error)) {
        throw error;
      }

      return { data, error };
    }, options);

    return result;
  } catch (error) {
    // Return in standard Supabase format
    return { data: null as T, error };
  }
}

/**
 * Create a cached query function with retry
 * Useful for expensive queries that should be cached
 */
export function createCachedQuery<T, Args extends unknown[]>(
  queryFn: (...args: Args) => Promise<{ data: T; error: unknown }>,
  options: RetryOptions = {}
) {
  const cache = new Map<string, { data: T; timestamp: number }>();
  const CACHE_TTL = 30000; // 30 seconds

  return async (...args: Args): Promise<{ data: T; error: unknown }> => {
    const cacheKey = JSON.stringify(args);
    const cached = cache.get(cacheKey);

    // Return cached result if still valid
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return { data: cached.data, error: null };
    }

    const result = await retryQuery(() => queryFn(...args), options);

    // Cache successful results
    if (!result.error && result.data !== null) {
      cache.set(cacheKey, { data: result.data, timestamp: Date.now() });
    }

    return result;
  };
}
