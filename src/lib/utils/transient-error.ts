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
 *   - `err.name` for `AbortError` / `TimeoutError` / `FetchError`
 *   - `err.code` and `err.cause.code` for the Node/undici codes that
 *     surface as transport errors (UND_ERR_*, ECONNRESET, ETIMEDOUT,
 *     ABORT_ERR)
 *   - the error's message (case-insensitive) for the substrings the
 *     underlying fetch raises before it has a typed code: 'fetch failed',
 *     'econnreset', 'etimedout', 'socket hang up', 'network',
 *     '502', '503', '504', 'gateway timeout', 'service unavailable',
 *     plus the abort/timeout phrasings below
 *
 * TWO SHAPES, NOT ONE. The server Supabase client sets a 10s HTTP abort
 * (`AbortSignal.timeout` in src/lib/supabase/server.ts), so the abort it is
 * configured to produce is this helper's single most important input — and it
 * arrives in a shape the original implementation could not read:
 *
 *   1. THROWN, as a DOMException: `name` is `'TimeoutError'` (NOT
 *      `'AbortError'` — that name belongs to an explicit
 *      `AbortController.abort()`), message "The operation was aborted due to
 *      timeout".
 *   2. RETURNED, as a plain object: supabase-js catches the fetch rejection
 *      and resolves with `{ message, details, hint: '', code: '' }` (see
 *      postgrest-js PostgrestBuilder). It is NOT an Error, carries no `name`,
 *      and its `code` is the empty string — so every name/code branch misses
 *      it, and the message fallback's `String(err)` yields the useless
 *      `'[object Object]'` rather than the message. Read `.message` off plain
 *      objects so this shape is classified on its text.
 *
 * Server-side only. For client rendering errors, see RouteErrorBoundary.
 */
export function isTransientFetchError(err: unknown): boolean {
  if (!err) return false;

  // Name-based: AbortController wraps aborts as `AbortError`,
  // `AbortSignal.timeout` as `TimeoutError`, node-fetch surfaces transport
  // failures as `FetchError`.
  if (typeof err === 'object') {
    const e = err as { name?: unknown; code?: unknown; cause?: unknown };

    if (typeof e.name === 'string') {
      if (e.name === 'AbortError' || e.name === 'TimeoutError' || e.name === 'FetchError') {
        return true;
      }
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
  const lower = transportMessage(err).toLowerCase();
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
    lower.includes('service unavailable') ||
    // Abort/timeout phrasings. `AbortSignal.timeout` → "The operation was
    // aborted due to timeout"; `AbortController.abort()` → "This operation
    // was aborted"; undici/DOM also use "The user aborted a request".
    lower.includes('operation was aborted') ||
    lower.includes('aborted due to timeout') ||
    lower.includes('aborted a request')
  );
}

/**
 * The message to classify on.
 *
 * `String(err)` is right for primitives and Errors but returns
 * `'[object Object]'` for the plain `{ message, details, hint, code }` object
 * supabase-js resolves with after a failed fetch — the shape that carries the
 * 10s-abort text. Prefer an own `message` string when present.
 */
function transportMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(err);
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
