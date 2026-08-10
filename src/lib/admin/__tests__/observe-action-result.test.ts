import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: mocks.logServerError,
  logServerEvent: mocks.logServerEvent,
}));

import {
  extractActionSoftFailure,
  isExpectedSoftFailureMessage,
  isExpectedEmptyStateCode,
  isUserInputRejection,
  observeActionSoftFailure,
} from '@/lib/admin/observe-action-result';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';

describe('observe-action-result', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetEmitThrottleForTests();
  });

  afterEach(() => {
    __resetEmitThrottleForTests();
  });

  it('extracts { success: false, error } envelopes', () => {
    expect(extractActionSoftFailure({ success: false, error: 'DB blew up' })).toEqual({
      message: 'DB blew up',
      code: null,
    });
  });

  it('extracts the stable `code` field alongside the message', () => {
    expect(
      extractActionSoftFailure({
        success: false,
        error: 'No completed rounds in the last 90 days yet — insights will populate after the next round',
        code: 'engine_no_recent_rounds',
      }),
    ).toEqual({
      message: 'No completed rounds in the last 90 days yet — insights will populate after the next round',
      code: 'engine_no_recent_rounds',
    });
  });

  it('extracts { data: null, error } envelopes', () => {
    expect(extractActionSoftFailure({ data: null, error: 'missing row' })).toEqual({
      message: 'missing row',
      code: null,
    });
  });

  it('classifies auth-ish copy as expected soft failures', () => {
    expect(isExpectedSoftFailureMessage('Not authenticated')).toBe(true);
    expect(isExpectedSoftFailureMessage('Invalid email or password (4 attempts remaining)')).toBe(true);
    expect(isExpectedSoftFailureMessage('Too many login attempts. Please try again in 10 minutes.')).toBe(true);
    expect(isExpectedSoftFailureMessage('Could not complete the calendar action. Please try again.')).toBe(false);
  });

  // Two identical outcomes reached the Bridge at two different severities
  // purely because of punctuation and synonym drift between emitters:
  // `Not authenticated.` (insight-delivery.ts) and `Not authorized` (~30 golf
  // insight actions) missed the anchored patterns and were filed as hard
  // errors next to their correctly-tiered 'warning' twins.
  it('tiers denial wording consistently across punctuation and synonyms', () => {
    for (const message of [
      'Not authenticated',
      'Not authenticated.',
      'Unauthorized',
      'Unauthorized.',
      'Not authorized',
      'Not authorised',
      'Forbidden',
    ]) {
      expect(isExpectedSoftFailureMessage(message)).toBe(true);
    }
  });

  it('treats a correct response to user input as info, not an incident', () => {
    for (const message of [
      'Invalid email or password',
      'Invalid email or password (2 attempts remaining)',
      'Too many login attempts. Please try again in 10 seconds.',
      'Account is locked',
      "This isn't available in the live demo",
      'Please select a course',
      // Every wording the four duplicate-signup call sites use.
      'An account with this email already exists. Please sign in instead.',
      'An account with this email already exists. Please sign in to continue your setup.',
      'An account with this email already exists. Please sign in instead, or use a different email.',
    ]) {
      expect(isUserInputRejection(message)).toBe(true);
    }

    // Not every "already exists" is a signup: a duplicate the coach can act on
    // is a real conflict and must stay visible.
    expect(isUserInputRejection('A qualifier with this name already exists')).toBe(false);

    // An access denial is NOT user input — it stays a warning-tier soft failure
    // so an operator can still see who was denied what.
    for (const message of ['Unauthorized', 'Forbidden', 'Not authorized']) {
      expect(isUserInputRejection(message)).toBe(false);
      expect(isExpectedSoftFailureMessage(message)).toBe(true);
    }
  });

  it('logs a mistyped password at info, not as a warning-tier incident', () => {
    observeActionSoftFailure(
      { success: false, error: 'Invalid email or password (2 attempts remaining)' },
      { action: 'loginAction', sport: 'golf', source: 'server_action' },
    );

    expect(mocks.logServerError).not.toHaveBeenCalled();
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const infoCall = mocks.logServerEvent.mock.calls[0] as
      | [string, Record<string, unknown> | undefined, 'info']
      | undefined;
    expect(infoCall?.[2]).toBe('info');
    expect(infoCall?.[1]).toMatchObject({ skipSentry: true });
  });

  it('classifies the engine_session_expired code as expected regardless of message wording', () => {
    // Structural, not message-string matching: an arbitrary message paired
    // with the known code is still expected.
    expect(isExpectedSoftFailureMessage('anything at all', 'engine_session_expired')).toBe(true);
    expect(isExpectedSoftFailureMessage('anything at all', 'some_other_code')).toBe(false);
  });

  it('classifies engine_no_recent_rounds as an empty-state code, not a generic soft failure', () => {
    expect(isExpectedEmptyStateCode('engine_no_recent_rounds')).toBe(true);
    expect(isExpectedEmptyStateCode('engine_session_expired')).toBe(false);
    expect(isExpectedEmptyStateCode(null)).toBe(false);
  });

  it('classifies the coachhelm-data empty-state codes as expected empty states', () => {
    expect(isExpectedEmptyStateCode('no_rounds_in_period')).toBe(true);
    expect(isExpectedEmptyStateCode('no_completed_rounds')).toBe(true);
    expect(isExpectedEmptyStateCode('insufficient_rounds')).toBe(true);
  });

  it.each([
    ['no_rounds_in_period', 'No completed rounds found in the specified period'],
    ['no_completed_rounds', 'No completed rounds found for this player'],
    ['insufficient_rounds', 'Need at least 3 completed rounds for trend analysis'],
  ])('logs %s via logServerEvent at info severity with skipSentry', (code, error) => {
    observeActionSoftFailure(
      { success: false, error, code },
      { action: 'getPlayerProfile', sport: 'golf', feature: 'intelligence_dashboard', source: 'server_action' },
    );

    expect(mocks.logServerError).not.toHaveBeenCalled();
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const infoCall = mocks.logServerEvent.mock.calls[0] as
      | [string, Record<string, unknown> | undefined, 'info' | 'warning' | 'error' | 'critical']
      | undefined;
    expect(infoCall?.[2]).toBe('info');
    expect(infoCall?.[1]).toMatchObject({ skipSentry: true });
  });

  it('logs unexpected soft failures at error severity', () => {
    observeActionSoftFailure(
      { success: false, error: 'Could not save document' },
      { action: 'uploadBaseballDocument', sport: 'baseball', feature: 'baseball_documents', source: 'server_action' },
    );

    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    const errorCall = mocks.logServerError.mock.calls[0] as
      | [string, Record<string, unknown> | undefined, 'warning' | 'error' | 'critical']
      | undefined;
    expect(errorCall?.[2]).toBe('error');
  });

  it('logs expected soft failures as warnings with skipSentry', () => {
    observeActionSoftFailure(
      { success: false, error: 'Not authenticated' },
      { action: 'createBaseballEvent', sport: 'baseball', source: 'server_action' },
    );

    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    const warningCall = mocks.logServerError.mock.calls[0] as
      | [string, Record<string, unknown> | undefined, 'warning' | 'error' | 'critical']
      | undefined;
    expect(warningCall?.[2]).toBe('warning');
    expect(warningCall?.[1]).toMatchObject({ skipSentry: true });
  });

  it('ignores successful results', () => {
    observeActionSoftFailure(
      { success: true },
      { action: 'noop', source: 'server_action' },
    );
    expect(mocks.logServerError).not.toHaveBeenCalled();
  });

  // ROOT CAUSE 2 — "No completed rounds in the last 90 days yet..." from
  // triggerPlayerInsightsAfterRound during the roster-sweep cron must never
  // land in admin_events at 'error' severity or as a Sentry exception; it is
  // an expected empty state, classified via `code`, not the message text.
  it('logs the no-recent-rounds empty state via logServerEvent at info severity, not logServerError', () => {
    observeActionSoftFailure(
      {
        success: false,
        error: 'No completed rounds in the last 90 days yet — insights will populate after the next round',
        code: 'engine_no_recent_rounds',
      },
      { action: 'triggerPlayerInsightsAfterRound', sport: 'golf', feature: 'coachhelm_ai_engine', source: 'server_action' },
    );

    expect(mocks.logServerError).not.toHaveBeenCalled();
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const infoCall = mocks.logServerEvent.mock.calls[0] as
      | [string, Record<string, unknown> | undefined, 'info' | 'warning' | 'error' | 'critical']
      | undefined;
    expect(infoCall?.[2]).toBe('info');
    expect(infoCall?.[1]).toMatchObject({ skipSentry: true });
  });

  it('logs an engine session-expired background failure as warning with skipSentry, not error', () => {
    observeActionSoftFailure(
      {
        success: false,
        error: 'Player analysis failed (likely session expired in background context)',
        code: 'engine_session_expired',
      },
      { action: 'triggerPlayerInsightsAfterRound', sport: 'golf', feature: 'coachhelm_ai_engine', source: 'server_action' },
    );

    expect(mocks.logServerEvent).not.toHaveBeenCalled();
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    const warningCall = mocks.logServerError.mock.calls[0] as
      | [string, Record<string, unknown> | undefined, 'warning' | 'error' | 'critical']
      | undefined;
    expect(warningCall?.[2]).toBe('warning');
    expect(warningCall?.[1]).toMatchObject({ skipSentry: true });
  });

  it('still logs a real failure at error severity even when it carries an unrecognized code', () => {
    observeActionSoftFailure(
      { success: false, error: 'Database connection pool exhausted', code: 'db_pool_exhausted' },
      { action: 'someOtherAction', sport: 'golf', source: 'server_action' },
    );

    expect(mocks.logServerEvent).not.toHaveBeenCalled();
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    const errorCall = mocks.logServerError.mock.calls[0] as
      | [string, Record<string, unknown> | undefined, 'warning' | 'error' | 'critical']
      | undefined;
    expect(errorCall?.[2]).toBe('error');
    expect(errorCall?.[1]).toMatchObject({ skipSentry: false });
  });

  /**
   * A provider fault that reaches this capture class through a RETURNED
   * envelope rather than a throw.
   *
   * An action that already classified the fault itself — schedule-image.ts does,
   * and logs `errorCode: provider_vercel_ai_gateway_credit_exhausted` — then
   * returns `{ success: false, error: <the summary> }`. The envelope carries no
   * `code` field, because the summary IS the payload. So this observer stored
   * `errorCode: undefined`, and the withAdminObserved wrapper's row for the very
   * same outage landed unclassified beside its correctly-classified sibling.
   *
   * That is not merely cosmetic double-counting. `auto-resolve.ts` protects a
   * fingerprint from release-based resolution only via
   * `isOperatorGatedFaultCode(metadata.errorCode)` — so the unclassified copy is
   * eligible to be auto-closed by the next deploy while the account behind it is
   * still out of credit. Measured in production on 2026-08-09: fingerprint
   * 1ace6e9f carried the provider code and 737d7332, the same outage, carried
   * null.
   *
   * Silence is not recovery, and no deploy has ever topped up a billing account.
   */
  it('carries the provider code through when the failure MESSAGE is a provider fault', () => {
    observeActionSoftFailure(
      {
        success: false,
        error:
          'AI features are unavailable: the Vercel AI Gateway account is out of credit. Retrying will not help until it is topped up. Your schedule can still be added with the Paste Text option.',
      },
      { action: 'extractClassesFromScheduleImage', sport: 'golf', source: 'server_action' },
    );

    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    const call = mocks.logServerError.mock.calls[0] as
      | [string, Record<string, unknown> | undefined, string]
      | undefined;
    expect(call?.[1]).toMatchObject({
      errorCode: 'provider_vercel_ai_gateway_credit_exhausted',
    });
  });

  it('leaves an envelope that IS carrying its own code untouched', () => {
    observeActionSoftFailure(
      { success: false, error: 'Something broke', code: 'engine_specific_code' },
      { action: 'someAction', sport: 'golf', source: 'server_action' },
    );

    const call = mocks.logServerError.mock.calls[0] as
      | [string, Record<string, unknown> | undefined, string]
      | undefined;
    expect(call?.[1]).toMatchObject({ errorCode: 'engine_specific_code' });
  });

  it('does not invent a code for an ordinary failure', () => {
    observeActionSoftFailure(
      { success: false, error: 'Database connection pool exhausted' },
      { action: 'someAction', sport: 'golf', source: 'server_action' },
    );

    const call = mocks.logServerError.mock.calls[0] as
      | [string, Record<string, unknown> | undefined, string]
      | undefined;
    expect(call?.[1]?.errorCode).toBeUndefined();
  });
});
