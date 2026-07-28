import 'server-only';

import { isExpectedAuthNoise } from '@/lib/admin/data/triage';
import { drainCollapsedCount, shouldEmit } from '@/lib/admin/emit-throttle';
import { EXPECTED_EMPTY_STATE_CODES } from '@/lib/view-state/expected-empty-states';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';

export type ActionSoftFailureContext = NonNullable<Parameters<typeof logServerError>[1]> & {
  action: string;
};

/** User-facing control flow — logged as handled warnings, hidden from Sentry. */
const EXPECTED_SOFT_FAILURE_PATTERNS: readonly RegExp[] = [
  /^not authenticated$/i,
  /^unauthorized$/i,
  /^forbidden$/i,
  /^you must be signed in/i,
  /^invalid email or password/i,
  /^too many login attempts/i,
  /^account (?:is )?locked/i,
  /^coach or team not found$/i,
  /^player profile not found$/i,
  /^only coaches can/i,
  /^you do not have permission/i,
  /^this isn't available in the live demo/i,
  /^choose a valid/i,
  /^please (enter|select|provide)/i,
];

/**
 * Structural (code-based) counterpart to EXPECTED_SOFT_FAILURE_PATTERNS.
 * Prefer giving an action's `{ success: false }` envelope a stable `code`
 * over adding a new message regex above — codes survive copy edits to the
 * user-facing string, and don't require this shared module to know every
 * caller's exact wording. Same severity bucket as the message patterns
 * ('warning', skipSentry): still a soft failure, just an expected one.
 */
const EXPECTED_SOFT_FAILURE_CODES: ReadonlySet<string> = new Set([
  // Fire-and-forget / cron engine calls run without a user session by
  // design (triggerPlayerInsightsAfterRound's analyzePlayer() call uses a
  // user-scoped client that has nothing to scope to once the request that
  // spawned the background work has completed). Same class as the
  // "not authenticated" patterns above, just engine-side.
  'engine_session_expired',
  // The player isn't on a roster, so the CoachHelm engine has no team →
  // organisation → coach → philosophy chain to run against. A routine roster
  // state (never joined, left, or was removed — removal hard-deletes the
  // golf_team_members row), not a defect: there is no retry that would
  // succeed and no code for an operator to repair. Kept at 'warning' rather
  // than moved into EXPECTED_EMPTY_STATE_CODES because it is still a real
  // soft *failure* — that player's insights genuinely will not generate —
  // whereas the empty-state codes describe an outcome that was never a
  // failure at all.
  'engine_no_team_membership',
]);

/*
 * Genuinely empty, nothing-failed outcomes ('info', skipSentry — one tier
 * quieter than EXPECTED_SOFT_FAILURE_CODES: those are still benign soft
 * *failures*; these were never a failure to begin with) are classified via
 * EXPECTED_EMPTY_STATE_CODES imported from
 * src/lib/view-state/expected-empty-states.ts — ONE registry shared with the
 * UI empty-state surfaces, so user-facing copy and telemetry classification
 * key off the same codes and cannot drift apart. The global-classification
 * CONTRACT lives there too. Severity plumbing: incident-feed's default view
 * excludes only 'info'; overview KPIs count severity IN ('error','critical').
 */

export function extractActionSoftFailure(
  result: unknown,
): { message: string; code: string | null } | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;

  if (record.success === false) {
    const message =
      (typeof record.error === 'string' && record.error.trim()) ||
      (typeof record.message === 'string' && record.message.trim()) ||
      'Action returned success: false';
    const code = typeof record.code === 'string' ? record.code : null;
    return { message, code };
  }

  if (record.ok === false) {
    const message =
      (typeof record.error === 'string' && record.error.trim()) ||
      (typeof record.message === 'string' && record.message.trim()) ||
      'Action returned ok: false';
    const code = typeof record.code === 'string' ? record.code : null;
    return { message, code };
  }

  // { data: null, error: '...' } result envelopes without an explicit success flag.
  if (
    record.data === null &&
    typeof record.error === 'string' &&
    record.error.trim().length > 0
  ) {
    return { message: record.error.trim(), code: null };
  }

  return null;
}

export function isExpectedSoftFailureMessage(message: string, code?: string | null): boolean {
  if (code && EXPECTED_SOFT_FAILURE_CODES.has(code)) return true;
  if (isExpectedAuthNoise(message)) return true;
  return EXPECTED_SOFT_FAILURE_PATTERNS.some((pattern) => pattern.test(message.trim()));
}

/** True for a stable `code` marking a routine empty-state, not a failure. */
export function isExpectedEmptyStateCode(code: string | null): boolean {
  return code != null && EXPECTED_EMPTY_STATE_CODES.has(code);
}

type SoftFailureSeverity = 'info' | 'warning' | 'error';

function severityForSoftFailure(message: string, code: string | null): SoftFailureSeverity {
  if (isExpectedEmptyStateCode(code)) return 'info';
  return isExpectedSoftFailureMessage(message, code) ? 'warning' : 'error';
}

/**
 * The shared verdict for one soft-failure outcome, for consumers OUTSIDE this
 * module's own `observeActionSoftFailure` path.
 *
 * A single engine outcome is observed by several independent consumers — the
 * withAdminObserved wrapper below, `postRoundTrigger`, and the CoachHelm
 * safety-net cron. They must all reach the SAME severity for the same
 * `code`, or one routine outcome is logged as 'info' by one consumer and as
 * a live 'error' (plus a Sentry capture) by the next, which is how expected
 * roster/empty states kept surfacing as incidents. Exported from here — not
 * from any one consumer — so no consumer has to depend on another, and so
 * adding a code to the sets above updates every verdict at once.
 */
export function classifySoftFailure(
  message: string,
  code: string | null,
): { severity: SoftFailureSeverity; skipSentry: boolean } {
  const severity = severityForSoftFailure(message, code);
  // 'info' and 'warning' are both routine — never worth a Sentry capture.
  return { severity, skipSentry: severity !== 'error' };
}

/**
 * Helm Bridge capture class #3 — server actions that return `{ success: false }`
 * instead of throwing. Fire-and-forget; never changes the action result.
 */
export function observeActionSoftFailure(
  result: unknown,
  context: ActionSoftFailureContext,
): void {
  const failure = extractActionSoftFailure(result);
  if (!failure) return;

  const throttleKey = `soft:${context.action}:${failure.code ?? failure.message.slice(0, 120)}`;
  if (!shouldEmit(throttleKey)) return;

  const collapsedCount = drainCollapsedCount(throttleKey);
  const severity = severityForSoftFailure(failure.message, failure.code);
  // 'info' (expected empty-state) and 'warning' (expected soft failure) are
  // both routine — never worth a Sentry capture. Only real 'error' outcomes
  // get sent.
  const skipSentry = severity !== 'error';
  const logContext = {
    ...context,
    title: `[${context.action}] ${failure.message}`.slice(0, 500),
    handled: true,
    skipSentry,
    errorCode: failure.code ?? undefined,
    fingerprint: ['server_action_soft', context.feature ?? context.featureArea ?? 'unknown', context.action],
    metadata: {
      ...(context.metadata ?? {}),
      soft_failure: true,
      ...(collapsedCount > 0 ? { collapsed_count: collapsedCount } : {}),
    },
  };

  try {
    // logServerError's severity param intentionally excludes 'info' (that
    // tier belongs to logServerEvent) — route empty-state outcomes there so
    // they land in admin_events at 'info' without widening logServerError's
    // contract for every other caller of this shared capture class.
    const capture =
      severity === 'info'
        ? logServerEvent(failure.message, logContext, 'info')
        : logServerError(failure.message, logContext, severity);
    void Promise.resolve(capture).catch(() => {});
  } catch {
    // Fire-and-forget: observability must never change action results.
  }
}
