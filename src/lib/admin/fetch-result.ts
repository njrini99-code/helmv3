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
}

export function unconfigured<T>(what: string): AdminFetchResult<T> {
  return { status: 'unconfigured', data: null, fetchedAt: null, error: `${what} not configured` };
}

export function failed<T>(error: string): AdminFetchResult<T> {
  return { status: 'error', data: null, fetchedAt: null, error };
}

export function ok<T>(data: T): AdminFetchResult<T> {
  return { status: 'ok', data, fetchedAt: new Date().toISOString() };
}
