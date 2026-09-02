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
  classifySoftFailure,
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

  // submitGolfRoundComprehensive is withAdminObserved-wrapped, so its 'busy'
  // carve-out (a same-round auto-save or a second submit still held the row
  // past submit_round_atomic's bounded 3s wait) reaches this classifier even
  // though the call site itself deliberately skips its own logServerError
  // call. Without this pattern, contention that resolves itself on the next
  // tap would page as an 'error'-severity incident.
  it('classifies the round-submit busy message as an expected soft failure', () => {
    expect(isExpectedSoftFailureMessage('Another save for this round is just finishing — try again in a moment.')).toBe(true);
  });

  // createGolfConversationImpl's tenancy gate (src/app/golf/actions/
  // messages.ts) throws these two exact strings on an ordinary authorization
  // denial. Neither previously matched an anchored pattern — the closest,
  // `/^you do not have permission/i`, is a different wording — so both
  // classified as 'error' and paged Sentry for a routine "not on this team"
  // rejection.
  it('classifies the golf-messaging tenancy denials as expected soft failures', () => {
    expect(isExpectedSoftFailureMessage('You do not have access to this team')).toBe(true);
    expect(isExpectedSoftFailureMessage('One or more recipients are not on this team')).toBe(true);
    // A genuine infrastructure failure from the same gate (the audience
    // probe itself failing) must NOT be swallowed alongside them.
    expect(isExpectedSoftFailureMessage('Could not verify team access. Please try again.')).toBe(false);
  });

  it('keeps expected qualifier lifecycle protections out of the error incident feed', () => {
    for (const code of ['qualifier_closed', 'qualifier_round_limit_reached', 'qualifier_round_already_exists']) {
      expect(isExpectedSoftFailureMessage('A qualifier lifecycle response', code)).toBe(true);
    }
  });

  it('keeps an active-round roster safety guard out of Sentry', () => {
    expect(
      isExpectedSoftFailureMessage(
        'This player has a saved in-progress round. Have them finish or discard it before removing them from the team.',
        'active_round_in_progress',
      ),
    ).toBe(true);
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

  it('A6 (2026-09-02): records a stale deleted-shot reconciliation as warning, not info — it is still a loss signal', () => {
    // Still an EXPECTED soft failure (not a hard error worth paging), but no
    // longer collapsed to 'info' alongside genuinely nothing-failed outcomes:
    // a reconciled-away shot means a shot the client no longer has is
    // absent from the server too, which is worth an operator's attention if
    // it recurs for one player.
    expect(isExpectedSoftFailureMessage('Shot not found', 'shot_not_found')).toBe(true);
    expect(classifySoftFailure('Shot not found', 'shot_not_found')).toEqual({
      severity: 'warning',
      skipSentry: true,
    });
  });

  it('records the expected native-session token retry as info, not a warning incident', () => {
    expect(classifySoftFailure('Unauthorized', 'UNAUTHORIZED_RETRYABLE')).toEqual({
      severity: 'info',
      skipSentry: true,
    });
  });

  it('A6 (2026-09-02): tiers the qualifier-already-completed refusal as warning — a player can be stuck on it', () => {
    // Reached while a player is mid-submit or mid-save with a fully-scored,
    // unsubmitted round on their device: the coach closed the qualifier out
    // from under them, and their round now has nowhere to land. That is a
    // stuck-player signal, not ordinary "you typed something wrong" input
    // rejection — unlike the OTHER qualifier-lifecycle messages nearby
    // (still-open-with-a-cap, already-submitted), which stay at 'info'.
    const message = 'This qualifier has already been completed. Rounds can no longer be submitted.';
    expect(isUserInputRejection(message)).toBe(false);
    expect(classifySoftFailure(message, null)).toEqual({
      severity: 'warning',
      skipSentry: true,
    });
    // The neighbouring qualifier-lifecycle outcomes are untouched.
    expect(classifySoftFailure('You have already submitted this qualifier round.', null).severity).toBe('info');
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
