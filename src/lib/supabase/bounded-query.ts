/**
 * Bounded fan-out and one-shot transient retry for database-heavy work.
 *
 * Why this exists: on 2026-09-24 01:00–01:23 UTC (#2061) the production
 * PostgREST pool ran out (PGRST003) and statements hit their timeout (57014).
 * The service-role traffic behind it was CoachHelm fanning out per player
 * with unbounded `Promise.all`: every player on a roster at once, and inside
 * each player all ~21 Tier-1 insight generators at once, each running its own
 * raw-table reads and `golf_coach_insights` upserts. Nothing in the repo
 * bounded that, and nothing retried a transient fault, so a brief saturation
 * turned straight into failed analyses.
 *
 * Plain module (not `'use server'`): safe to import from server actions,
 * routes, crons and library code alike.
 */

/**
 * Postgres / PostgREST codes that mean "the database was busy or briefly
 * unreachable", where the same request moments later is expected to work.
 *
 *  - 57014     statement timeout (query_canceled)
 *  - 40P01     deadlock detected
 *  - 55P03     lock not available
 *  - 53300     too many connections
 *  - 08xxx     connection exceptions
 *  - PGRST000  PostgREST could not connect to the database
 *  - PGRST001  PostgREST could not connect (internal)
 *  - PGRST002  could not query the database for the schema cache
 *  - PGRST003  timed out acquiring a connection from the pool
 */
const TRANSIENT_DB_CODES = new Set([
  '57014',
  '40P01',
  '55P03',
  '53300',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  'PGRST000',
  'PGRST001',
  'PGRST002',
  'PGRST003',
]);

/**
 * The same faults by message, for errors whose `.code` did not survive a
 * re-throw (`new Error('... failed: ' + error.message)` keeps the text only).
 */
const TRANSIENT_DB_MESSAGE =
  /deadlock|statement timeout|lock timeout|lock_not_available|canceling statement due to|could not query the database for the schema cache|timed out acquiring connection from connection pool|too many connections|connection terminated|connection reset|connection refused|econnreset|etimedout|timeout exceeded/i;

const MAX_CAUSE_DEPTH = 3;

function codeOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('code' in value)) return null;
  const code = (value as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

/**
 * True when `error` (an Error, a PostgREST `{ code, message }` object, or a
 * string) is a transient database fault worth one retry. Walks `cause` a few
 * levels, because callers wrap the Postgres error. Anything else — a unique
 * violation, an RLS denial, a bug — is not transient and is never retried.
 */
export function isTransientDbError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current != null; depth++) {
    const code = codeOf(current);
    if (code && TRANSIENT_DB_CODES.has(code)) return true;
    if (TRANSIENT_DB_MESSAGE.test(messageOf(current))) return true;
    current = typeof current === 'object' ? (current as { cause?: unknown }).cause : null;
  }
  return false;
}

/** Split `items` into consecutive slices of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`chunk size must be a positive integer, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return 1;
  return Math.floor(limit);
}

/**
 * `Promise.allSettled(items.map(fn))` with at most `limit` calls in flight.
 * Results keep input order. Every item runs; a rejection never stops the
 * others. The workers are started synchronously from the caller, so an
 * ambient AsyncLocalStorage context (e.g. the CoachHelm philosophy gate) is
 * inherited exactly as it would be by a plain `Promise.allSettled`.
 */
export async function mapSettledWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index]!, index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  const workers = Array.from({ length: Math.min(normalizeLimit(limit), items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * `Promise.all(items.map(fn))` with at most `limit` calls in flight. Results
 * keep input order. On the first rejection no further items start; the calls
 * already in flight finish, then that first rejection is thrown.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index]!, index);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
  };
  const workers = Array.from({ length: Math.min(normalizeLimit(limit), items.length) }, () => worker());
  await Promise.all(workers);
  if (failed) throw firstError;
  return results;
}

export interface RetryTransientOptions<T> {
  /**
   * For operations that report failure in their RESULT instead of throwing
   * (supabase-js `{ data, error }`, a generator receipt with
   * `status: 'failed'`). Return true when that result is a transient fault.
   */
  isTransientResult?: (result: T) => boolean;
  /** Base backoff before the single retry. Default 250ms. */
  baseDelayMs?: number;
  /** Random extra backoff, 0..jitterMs. Default 250ms. */
  jitterMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Called once, just before the retry. */
  onRetry?: (detail: { reason: unknown; delayMs: number }) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `operation`; if it fails with a transient database fault, wait a short
 * backoff and run it exactly ONE more time. The second attempt's outcome —
 * success, failure, or throw — is returned as is; there is never a third.
 *
 * Only wrap operations that are safe to repeat: reads, and writes that are
 * idempotent (an upsert with an `onConflict` target). Never a plain insert.
 */
export async function retryTransientOnce<T>(
  operation: () => Promise<T>,
  options: RetryTransientOptions<T> = {},
): Promise<T> {
  const { isTransientResult, baseDelayMs = 250, jitterMs = 250, sleep = defaultSleep, onRetry } = options;
  let reason: unknown;
  try {
    const first = await operation();
    if (!isTransientResult || !isTransientResult(first)) return first;
    reason = first;
  } catch (error) {
    if (!isTransientDbError(error)) throw error;
    reason = error;
  }
  const delayMs = Math.max(0, baseDelayMs) + Math.floor(Math.random() * Math.max(0, jitterMs));
  onRetry?.({ reason, delayMs });
  await sleep(delayMs);
  return operation();
}

/** `isTransientResult` for a supabase-js `{ data, error }` response. */
export function isTransientSupabaseResult(result: { error?: unknown } | null | undefined): boolean {
  return result?.error != null && isTransientDbError(result.error);
}
