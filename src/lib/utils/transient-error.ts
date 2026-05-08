/**
 * Transient transport-error detection + retry-spacing helper.
 *
 * Consolidates the previously triplicated "is this fetch error retryable?"
 * heuristics that lived inside `putt-analytics.ts` and `insight-delivery.ts`.
 * The third copy in `RouteErrorBoundary.tsx` is intentionally NOT consumed
 * here — it covers client-side rendering errors (chunk loads, stale
 * deployments, user-facing copy triggers) and has a legitimately broader
 * match list. Keep the two domains separate.
 *
 * Server-side only.
 */

/**
 * Heuristic: did this error come from a transient transport-layer issue
 * (network blip, regional brownout, gateway 5xx)? Use to gate at-most-once
 * retry on Supabase / fetch-based calls.
 *
 * Inspects (in order):
 *   - `err.name` for `AbortError` / `FetchError`
 *   - `err.code` and `err.cause.code` for the Node/undici codes that
 *     surface as transport errors (UND_ERR_*, ECONNRESET, ETIMEDOUT,
 *     ABORT_ERR)
 *   - `err.message` (case-insensitive) for the substrings the underlying
 *     fetch raises before it has a typed code: 'fetch failed',
 *     'econnreset', 'etimedout', 'socket hang up', 'network',
 *     '502', '503', '504', 'gateway timeout', 'service unavailable'
 *
 * Server-side only. For client rendering errors, see RouteErrorBoundary.
 */
export function isTransientFetchError(err: unknown): boolean {
  if (!err) return false;

  // Name-based: AbortController/undici wrap aborts as `AbortError`,
  // node-fetch surfaces transport failures as `FetchError`.
  if (typeof err === 'object') {
    const e = err as { name?: unknown; code?: unknown; cause?: unknown };

    if (typeof e.name === 'string') {
      if (e.name === 'AbortError' || e.name === 'FetchError') return true;
    }

    // Code-based: check both `err.code` and `err.cause.code`. undici nests
    // its socket errors under `cause` when wrapped by `fetch`.
    const codeCandidates: unknown[] = [e.code];
    if (e.cause && typeof e.cause === 'object') {
      codeCandidates.push((e.cause as { code?: unknown }).code);
    }
    for (const c of codeCandidates) {
      if (typeof c === 'string' && isTransientCode(c)) return true;
    }
  }

  // Message-based fallback. Many transport errors only carry the failure
  // mode in the message string (e.g. bare "TypeError: fetch failed").
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('socket hang up') ||
    lower.includes('network') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('gateway timeout') ||
    lower.includes('service unavailable')
  );
}

function isTransientCode(code: string): boolean {
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ABORT_ERR') {
    return true;
  }
  // undici codes — UND_ERR_ABORTED, UND_ERR_SOCKET, UND_ERR_SOCKET_TIMEOUT,
  // UND_ERR_HEADERS_TIMEOUT, UND_ERR_BODY_TIMEOUT, etc. Treat the whole
  // family as transient.
  if (code.startsWith('UND_ERR_')) return true;
  return false;
}

/** Promise-based delay, used between retry attempts. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
