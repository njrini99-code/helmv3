import { logServerError, logServerEvent } from '@/lib/server-error-logger';

type LogContext = Parameters<typeof logServerEvent>[1];

/**
 * A best-effort read that tripped its own abort budget (our AbortController,
 * `AbortSignal.timeout`, or Postgres `statement_timeout`). Anything else is a
 * real failure on that path and must stay visible.
 */
const BUDGET_ABORT_PATTERNS: readonly RegExp[] = [
  /\bAbortError\b/i,
  /\bTimeoutError\b/i,
  /\boperation was aborted\b/i,
  /\bcanceling statement due to statement timeout\b/i,
];

export const isBudgetAbort = (message: string): boolean =>
  BUDGET_ABORT_PATTERNS.some((pattern) => pattern.test(message));

/**
 * Log a handled miss on a best-effort enrichment.
 *
 * A budget abort is the designed degrade path, so it is 'info' telemetry with
 * durableCollapse (a burst folds into one row with a count) — it stays in the
 * admin feed without asking anyone to triage it. Logged at 'warning' it put
 * /admin/errors/8ff00f0e and /admin/errors/20ed2ddd on the triage queue, where
 * each NOT A DEFECT close was reopened as REGRESSED by the next abort.
 *
 * Any other failure stays a 'warning' so a real regression on the same path
 * still reaches triage. Both skip Sentry: neither is a page.
 */
export async function logBestEffortMiss(
  prefix: string,
  errorMessage: string,
  context: LogContext,
): Promise<void> {
  const message = `${prefix}: ${errorMessage}`;
  if (isBudgetAbort(errorMessage)) {
    await logServerEvent(message, { ...context, skipSentry: true, durableCollapse: true }, 'info');
    return;
  }
  await logServerError(message, { ...context, skipSentry: true }, 'warning');
}
