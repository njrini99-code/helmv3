/**
 * Helm Bridge — shared fail-soft fetch envelope. Plain types/helpers,
 * importable anywhere (no 'server-only' — this file holds no secrets).
 */

export type AdminFetchStatus = 'ok' | 'unconfigured' | 'error';

export interface AdminFetchResult<T> {
  status: AdminFetchStatus;
  data: T | null;
  fetchedAt: string | null; // ISO — feeds the freshness chips / watch-the-watcher
  error?: string;
  /** Optional: set true when `data` stopped short of the true total because
   *  a bounded page ceiling was hit (not because the source ran dry). Callers
   *  that never set this can ignore it — always undefined, never a false claim. */
  truncated?: boolean;
  /** Optional: set true when the failure is a rate limit that survived one
   *  honoured Retry-After retry. Distinct from a generic failure because it
   *  usually clears on its own — a caller's reliability-source mapping (e.g.
   *  `SourceStatus`) can report this as 'degraded' rather than fully 'blind'.
   *  Callers that never set this can ignore it — always undefined. */
  degraded?: boolean;
}

export function unconfigured<T>(what: string): AdminFetchResult<T> {
  return { status: 'unconfigured', data: null, fetchedAt: null, error: `${what} not configured` };
}

export function failed<T>(error: string, opts?: { degraded?: boolean }): AdminFetchResult<T> {
  return {
    status: 'error',
    data: null,
    fetchedAt: null,
    error,
    ...(opts?.degraded ? { degraded: true } : {}),
  };
}

export function ok<T>(data: T): AdminFetchResult<T> {
  return { status: 'ok', data, fetchedAt: new Date().toISOString() };
}
