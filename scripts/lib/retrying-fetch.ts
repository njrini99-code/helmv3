/**
 * ============================================================================
 * retryingFetch — transient-failure cover for seed/ops scripts
 * ----------------------------------------------------------------------------
 * Drop-in `fetch` replacement for `createClient(url, key, { global: { fetch } })`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/seed-baseball-demo.ts` runs as the `Seed BaseballHelm CI accounts`
 * step, immediately in front of the BaseballHelm authenticated smoke — which
 * feeds the `all` aggregate, one of main's three REQUIRED status checks. So a
 * single unretried request in that script is a direct path from "Supabase
 * hiccuped for ten seconds" to "nothing in the repository can merge".
 *
 * That is not hypothetical. On 2026-07-29 Supabase returned Cloudflare 522
 * ("Connection timed out" — the edge reached the origin, the origin never
 * finished) three times inside half an hour: 12:17 UTC on main, then 12:23 and
 * 12:41 UTC on a PR. Every run died on the first `createUser`, and because a
 * 522 body is Cloudflare's HTML rather than JSON, supabase-js surfaced an error
 * with no usable message — the log line was literally
 * `createUser failed for demo-coach@baseballhelmdemo.com: {}`. main went red and
 * stayed red over an outage that had already passed by the time anyone looked.
 *
 * Retrying at the FETCH layer rather than at individual call sites is
 * deliberate: one wrapper covers every request the client makes — auth admin,
 * PostgREST, storage — including any added later, and it cannot be forgotten at
 * a new call site.
 *
 * WHAT IS NOT RETRIED: anything outside `TRANSIENT_HTTP`. A 4xx is a real
 * answer — "already registered", a bad service key, a schema violation — and
 * retrying it would only make a genuine failure take four times as long to
 * surface. Callers that POST must still be idempotent, because a 522 fails the
 * RESPONSE and not necessarily the write: see `ensureAuthUser`, which treats an
 * "already registered" reply to a replayed create as success.
 * ========================================================================== */

/** Statuses meaning "try again", including the Cloudflare 52x family. */
export const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

export interface RetryingFetchOptions {
  /** Total attempts, including the first. */
  attempts?: number;
  /** First backoff step in ms; doubles each attempt. */
  baseDelayMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests — real sleeps would make the suite take ~11s. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Where retry notices go. */
  onRetry?: (message: string) => void;
}

const DEFAULT_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 750; // 750 → 1.5s → 3s → 6s, ~11s of cover

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Best-effort readable form of an error. supabase-js hands back `{}` for a
 * Cloudflare 5xx, which is what made the original failure undiagnosable.
 */
export function describeFetchError(error: unknown): string {
  if (!error) return 'unknown error';
  const e = error as { message?: string; status?: number; name?: string };
  if (e.message) return e.status ? `${e.message} (HTTP ${e.status})` : e.message;
  try {
    const json = JSON.stringify(error);
    if (json && json !== '{}') return json;
  } catch {
    /* circular or otherwise unserialisable — fall through */
  }
  return `${e.name ?? 'Error'} with no message${e.status ? ` (HTTP ${e.status})` : ''}`;
}

export function createRetryingFetch(options: RetryingFetchOptions = {}): typeof fetch {
  const {
    attempts = DEFAULT_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
    onRetry = (message: string) => console.warn(message),
  } = options;

  return async function retryingFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetchImpl(input, init);
        // Non-transient status — including every 4xx — is the real answer.
        if (!TRANSIENT_HTTP.has(response.status)) return response;
        // Out of attempts: hand the transient response back so the caller
        // reports the true status rather than a synthetic error.
        if (attempt === attempts) return response;
        lastError = new Error(`HTTP ${response.status}`);
      } catch (err) {
        // Network-level failure: DNS, connection reset, socket hang-up, abort.
        lastError = err;
        if (attempt === attempts) throw err;
      }

      const delay = baseDelayMs * 2 ** (attempt - 1);
      onRetry(
        `  ⚠ Supabase request failed (${describeFetchError(lastError)}) — attempt ${attempt}/${attempts}, retrying in ${delay}ms`,
      );
      await sleepImpl(delay);
    }

    // Unreachable: the loop either returns or throws on its final attempt.
    throw lastError;
  } as typeof fetch;
}
