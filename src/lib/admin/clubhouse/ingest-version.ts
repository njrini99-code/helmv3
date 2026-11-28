/**
 * Which ingest function the signal route sends to (Bridge plan §4.5).
 *
 * `clubhouse_ingest_signals_v2` (held migration 20261128090000) keeps the screen each hourly row fired on; the first
 * function does not. Until v2 exists, PostgREST answers PGRST202 for it: the route then marks it missing here, sends the
 * same batch without screens to the first function, and tries v2 again after V2_RETRY_MS. One answer per instance, so
 * a held migration costs one failed call every ten minutes, not one per batch.
 */

/** How long an instance sends to the first function after finding v2 missing. */
export const V2_RETRY_MS = 10 * 60_000;

export const INGEST_V1 = 'clubhouse_ingest_signals';
export const INGEST_V2 = 'clubhouse_ingest_signals_v2';

let v2MissingUntil = 0;

/** Whether to try v2 (and split the hourly rows by screen) at `now`. */
export function tryRoutesAt(now: number): boolean {
  return now >= v2MissingUntil;
}

/** v2 answered "no such function": send to the first one until `now + V2_RETRY_MS`. */
export function noteV2Missing(now: number): void {
  v2MissingUntil = now + V2_RETRY_MS;
}

/** Test seam: forget that v2 was found missing. */
export function resetIngestVersionForTests(): void {
  v2MissingUntil = 0;
}
