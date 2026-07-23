/**
 * ============================================================================
 * Dashboard failure classifier — player CoachHelm dashboard error taxonomy
 * ----------------------------------------------------------------------------
 * `getPlayerCoachHelmDashboardImpl` (src/app/golf/actions/insights.ts) has an
 * outer catch that used to collapse EVERY failure (a transient Postgres
 * deadlock from ShotPatternMiner.savePatterns() racing a coachhelm-* cron, a
 * statement timeout, or a genuine bug) into the same generic
 * `{success:false, error:'An unexpected error occurred'}` — so the page could
 * never tell "retry me, I'll probably work" apart from "this is actually
 * broken" and always rendered the same hard dead-end ErrorState.
 *
 * This is a standalone, plain (non-'use server') module on purpose: it's a
 * pure classification function with no I/O, so it's trivially unit-testable
 * without spinning up the rest of insights.ts's dependency graph, and — since
 * a 'use server' file may only export async functions — a sync helper like
 * this couldn't be exported directly from insights.ts anyway.
 * ========================================================================== */

export type DashboardFailureCode = 'TRANSIENT_FAILURE' | 'UNKNOWN';

/** Postgres SQLSTATE codes worth an automatic retry. */
const RETRYABLE_PG_CODES = new Set([
  '40P01', // deadlock_detected
  '57014', // query_canceled (statement timeout)
  '55P03', // lock_not_available
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '08006', // connection_failure
]);

/**
 * Fallback substring match for when the retryable Postgres code didn't
 * survive re-throwing (e.g. `ShotPatternMiner.savePatterns` wraps the pg
 * error into `new Error('Failed to save CoachHelm shot patterns: ' +
 * error.message)`, which drops `.code` but keeps Postgres's own message
 * text — "deadlock detected", "canceling statement due to statement
 * timeout", etc.).
 */
const RETRYABLE_MESSAGE_PATTERNS = [
  'deadlock',
  'statement timeout',
  'lock timeout',
  'lock_not_available',
  'canceling statement due to',
  'connection terminated',
  'connection reset',
  'connection refused',
  'econnreset',
  'etimedout',
  'timeout exceeded',
];

/**
 * Classifies an unexpected `getPlayerCoachHelmDashboardImpl` failure so the
 * caller can decide whether it's worth an automatic retry.
 *
 * - `TRANSIENT_FAILURE` — a retryable DB error (deadlock, statement/lock
 *   timeout, connection blip). The most common live cause is
 *   `ShotPatternMiner.savePatterns()` racing a concurrently-running
 *   coachhelm-* cron writer on `golf_patterns_v2`. A retry a moment later
 *   is very likely to succeed.
 * - `UNKNOWN` — anything else. Not worth an automatic retry.
 *
 * (`COACHHELM_DISABLED` / `UNAUTHORIZED` / `NOT_FOUND` are explicit,
 * non-exceptional early returns in `getPlayerCoachHelmDashboardImpl` — they
 * never reach the catch block this classifier serves, so they're not
 * modeled here.)
 */
export function classifyDashboardFailure(error: unknown): DashboardFailureCode {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  if (code && RETRYABLE_PG_CODES.has(code)) {
    return 'TRANSIENT_FAILURE';
  }

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (RETRYABLE_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern))) {
    return 'TRANSIENT_FAILURE';
  }

  return 'UNKNOWN';
}
