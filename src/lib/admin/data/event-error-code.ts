import { extractErrorCode } from '@/lib/admin/incident-report';

/**
 * The error code an `admin_events` row actually carries, wherever the logger
 * put it.
 *
 * `server-error-logger.ts`'s `normalizeContext` persists TWO places a code can
 * land:
 *   - `metadata.errorCode`       — from `RoundErrorContext.errorCode`
 *   - `metadata.extra.errorCode` — from `RoundErrorContext.extra`, which call
 *     sites such as `coachhelm-analytics.ts` use
 *     (`logServerError(..., { extra: { teamId, errorCode: error.code } })`)
 *
 * `extractErrorCode` reads only the first, so a code a caller did capture via
 * `extra` never reached the incident. The Incidents tab then showed
 * "signature unavailable" for a row that carried a real code. Top-level still
 * wins, so no existing reading changes. `extra` is only a fallback.
 *
 * Honest by construction: this returns a string the row really holds, or
 * null. It never parses a code out of the free-text message.
 *
 * Deliberately kept out of `incident-report.ts`'s `extractErrorCode`, which
 * `auto-resolve.ts` also consumes. Folding the fallback into it there is the
 * natural follow-up once that consumer's behavior is reviewed.
 */
export function extractEventErrorCode(metadata: unknown): string | null {
  const topLevel = extractErrorCode(metadata);
  if (topLevel !== null) return topLevel;
  if (metadata && typeof metadata === 'object') {
    const extra = (metadata as { extra?: unknown }).extra;
    if (extra && typeof extra === 'object') {
      const code = (extra as { errorCode?: unknown }).errorCode;
      if (typeof code === 'string' && code.length > 0) return code;
    }
  }
  return null;
}
