/**
 * Supabase Edge Function invocation error classification — brief §13.
 *
 * supabase-js's `functions.invoke()` throws exactly one of three classes on
 * failure (`@supabase/functions-js/src/lib/common/errors.ts` —
 * `node_modules/@supabase/functions-js/dist/module/types.d.ts`, read
 * directly, not assumed):
 *
 *   FunctionsHttpError    the function EXECUTED and returned a non-2xx
 *                         status — `error.context` is the raw `Response`.
 *   FunctionsRelayError   the Supabase relay could not REACH the function.
 *   FunctionsFetchError   the network request to invoke it failed outright
 *                         (DNS, connection refused, aborted).
 *
 * Each subclass sets `error.name` in its constructor to its own class name
 * (`'FunctionsHttpError'` etc.) — that string IS the stable "code" this file
 * keys on, the same way `classify-auth.ts` keys on `AuthApiError.code`.
 * `push.ts`'s own error-handling already duck-types on this same shape
 * (`(invokeError as { context?: Response }).context`) rather than importing
 * the classes — this file follows that established convention.
 */
import type { Expectedness, Retryability, Severity } from './envelope';

export interface MinimalEdgeError {
  name?: string | null;
  message?: string | null;
  /** A `Response` for `FunctionsHttpError`; an opaque context object for the
   *  other two. Read defensively — never assumed to be a real `Response`. */
  context?: unknown;
}

export interface ClassifyEdgeContext {
  feature: string;
  action: string;
  functionName: string;
}

export interface EdgeClassificationResult {
  code: string;
  httpStatus: number | null;
  severity: Severity;
  expectedness: Expectedness;
  retryability: Retryability;
  normalizedMessage: string;
}

function readStatusFromContext(context: unknown): number | null {
  try {
    if (context && typeof context === 'object' && 'status' in context) {
      const status = (context as { status?: unknown }).status;
      return typeof status === 'number' ? status : null;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Classifies a `functions.invoke()` error. Keys on `error.name` (the stable
 * class identity) first; `httpStatus` (read from `FunctionsHttpError`'s
 * `context` Response, when readable) refines an HTTP-error's severity.
 * Never throws.
 */
export function classifyEdgeFunctionError(
  error: MinimalEdgeError,
  _ctx: ClassifyEdgeContext,
): EdgeClassificationResult {
  try {
    const name = (error.name ?? '').trim();
    const message = error.message ?? 'unknown_error';

    if (name === 'FunctionsHttpError') {
      const httpStatus = readStatusFromContext(error.context);
      if (httpStatus !== null && httpStatus >= 500) {
        return {
          code: 'http_error',
          httpStatus,
          severity: 'critical',
          expectedness: 'unexpected',
          retryability: 'conditional',
          normalizedMessage: message,
        };
      }
      // A 4xx (or an unreadable status) means the function itself rejected
      // the request — worth seeing, not an infrastructure incident.
      return {
        code: 'http_error',
        httpStatus,
        severity: 'warning',
        expectedness: 'unexpected',
        retryability: 'no',
        normalizedMessage: message,
      };
    }

    if (name === 'FunctionsRelayError') {
      return {
        code: 'relay_error',
        httpStatus: null,
        severity: 'error',
        expectedness: 'unexpected',
        retryability: 'conditional',
        normalizedMessage: message,
      };
    }

    if (name === 'FunctionsFetchError') {
      return {
        code: 'fetch_error',
        httpStatus: null,
        severity: 'error',
        expectedness: 'unexpected',
        retryability: 'conditional',
        normalizedMessage: message,
      };
    }

    // An error that isn't one of the three documented classes (or has no
    // readable name) — unknown, never dropped.
    return {
      code: 'unknown',
      httpStatus: readStatusFromContext(error.context),
      severity: 'warning',
      expectedness: 'unknown',
      retryability: 'unknown',
      normalizedMessage: message,
    };
  } catch {
    return {
      code: 'classifier_failure',
      httpStatus: null,
      severity: 'warning',
      expectedness: 'unknown',
      retryability: 'unknown',
      normalizedMessage: 'classifier_failure',
    };
  }
}
