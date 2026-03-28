/**
 * Retry utility for server-side data fetching.
 *
 * Wraps async operations (Supabase queries, server actions, etc.) with
 * automatic retry logic for transient failures like network timeouts,
 * "Load failed" (Safari), and "Failed to fetch" (Chrome).
 */

/** Check if an error is retryable (transient network / timeout) */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message?.toLowerCase() || '';
  return (
    msg === 'load failed' ||
    msg === 'failed to fetch' ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('connection') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('socket hang up') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('unavailable') ||
    msg.includes('temporarily') ||
    msg.includes('abort')
  );
}

interface RetryOptions {
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Base delay in ms between retries — doubles each attempt (default: 500) */
  baseDelay?: number;
  /** Optional label for logging (e.g. "calendar-events-fetch") */
  label?: string;
}

/**
 * Execute an async function with retry logic for transient failures.
 *
 * @example
 * ```ts
 * const data = await withRetry(
 *   () => supabase.from('golf_events').select('*').eq('team_id', teamId),
 *   { label: 'calendar-events', maxRetries: 2 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 2, baseDelay = 500, label } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Only retry on transient errors
      if (!isRetryableError(error) || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: 500ms, 1000ms, 2000ms...
      const delay = baseDelay * Math.pow(2, attempt);
      if (label) {
        console.warn(
          `[withRetry] ${label}: attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms`,
          error instanceof Error ? error.message : error,
        );
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but just in case
  throw lastError;
}

/**
 * Execute an async function, returning a fallback value on failure instead of throwing.
 * Includes retry logic for transient errors before falling back.
 *
 * @example
 * ```ts
 * const events = await withFallback(
 *   () => fetchEvents(teamId),
 *   [],
 *   { label: 'calendar-events' }
 * );
 * ```
 */
export async function withFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  options: RetryOptions & { /** Suppress console.error logging */ silent?: boolean } = {},
): Promise<T> {
  const { silent, ...retryOpts } = options;
  try {
    return await withRetry(fn, retryOpts);
  } catch (error) {
    if (!silent) {
      console.error(
        `[withFallback]${retryOpts.label ? ` ${retryOpts.label}:` : ''} all retries exhausted, using fallback`,
        error instanceof Error ? error.message : error,
      );
    }
    return fallback;
  }
}
