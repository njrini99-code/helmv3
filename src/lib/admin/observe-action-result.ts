import 'server-only';

import { isExpectedAuthNoise } from '@/lib/admin/data/triage';
import { drainCollapsedCount, shouldEmit } from '@/lib/admin/emit-throttle';
import { logServerError } from '@/lib/server-error-logger';

export type ActionSoftFailureContext = NonNullable<Parameters<typeof logServerError>[1]> & {
  action: string;
};

/** User-facing control flow — logged as handled warnings, hidden from Sentry. */
const EXPECTED_SOFT_FAILURE_PATTERNS: readonly RegExp[] = [
  /^not authenticated$/i,
  /^unauthorized$/i,
  /^you must be signed in/i,
  /^coach or team not found$/i,
  /^player profile not found$/i,
  /^only coaches can/i,
  /^you do not have permission/i,
  /^this isn't available in the live demo/i,
  /^choose a valid/i,
  /^please (enter|select|provide)/i,
];

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

export function isExpectedSoftFailureMessage(message: string): boolean {
  if (isExpectedAuthNoise(message)) return true;
  return EXPECTED_SOFT_FAILURE_PATTERNS.some((pattern) => pattern.test(message.trim()));
}

function severityForSoftFailure(message: string): 'warning' | 'error' {
  return isExpectedSoftFailureMessage(message) ? 'warning' : 'error';
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
  const expected = isExpectedSoftFailureMessage(failure.message);
  const severity = severityForSoftFailure(failure.message);

  try {
    void Promise.resolve(
      logServerError(
        failure.message,
        {
          ...context,
          title: `[${context.action}] ${failure.message}`.slice(0, 500),
          handled: true,
          skipSentry: expected,
          errorCode: failure.code ?? undefined,
          fingerprint: ['server_action_soft', context.feature ?? context.featureArea ?? 'unknown', context.action],
          metadata: {
            ...(context.metadata ?? {}),
            soft_failure: true,
            ...(collapsedCount > 0 ? { collapsed_count: collapsedCount } : {}),
          },
        },
        severity,
      ),
    ).catch(() => {});
  } catch {
    // Fire-and-forget: observability must never change action results.
  }
}
