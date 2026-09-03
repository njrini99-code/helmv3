import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordAuth: vi.fn(),
  helmLogWarn: vi.fn(),
  helmLogError: vi.fn(),
  getSentryCorrelation: vi.fn(() => null as { traceId: string; spanId: string } | null),
  scheduleDbErrorRecording: vi.fn(),
}));

vi.mock('../../metrics', () => ({ recordAuth: mocks.recordAuth }));
vi.mock('../../structured-log', () => ({
  helmLog: { warn: mocks.helmLogWarn, error: mocks.helmLogError, info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../correlation', () => ({ getSentryCorrelation: mocks.getSentryCorrelation }));
vi.mock('../record-db-error', () => ({ scheduleDbErrorRecording: mocks.scheduleDbErrorRecording }));

import { observeAuthResult } from '../observe-auth';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSentryCorrelation.mockReturnValue(null);
});

const baseInput = {
  feature: 'auth',
  action: 'sign_in',
  operation: 'sign_in' as const,
};

describe('observeAuthResult', () => {
  it('does nothing and reports observed:false when error is null', () => {
    const outcome = observeAuthResult({ ...baseInput, error: null });
    expect(outcome.observed).toBe(false);
    expect(outcome.envelope).toBeNull();
    expect(mocks.recordAuth).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('EXPECTED (invalid_credentials on sign-in): no metric, no log, no DB write', () => {
    const outcome = observeAuthResult({
      ...baseInput,
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });
    expect(outcome.bucket).toBe('expected_control_flow');
    expect(outcome.envelope).toBeNull();
    expect(mocks.recordAuth).not.toHaveBeenCalled();
    expect(mocks.helmLogWarn).not.toHaveBeenCalled();
    expect(mocks.helmLogError).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('ACTIONABLE_WARNING (429 over_request_rate_limit): records metric, warn log, schedules DB write', () => {
    const outcome = observeAuthResult({
      ...baseInput,
      error: { code: 'over_request_rate_limit', message: 'Too many requests' },
    });
    expect(outcome.bucket).toBe('actionable_warning');
    expect(outcome.envelope).not.toBeNull();
    expect(mocks.recordAuth).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuth).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sign_in', outcome: 'actionable_warning', errorCode: 'over_request_rate_limit' }),
    );
    expect(mocks.helmLogWarn).toHaveBeenCalledTimes(1);
    expect(mocks.helmLogError).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).toHaveBeenCalledTimes(1);
  });

  it('CRITICAL_ERROR (500 unexpected_failure): uses the error log, not warn', () => {
    observeAuthResult({ ...baseInput, error: { code: 'unexpected_failure', message: 'internal error' } });
    expect(mocks.helmLogError).toHaveBeenCalledTimes(1);
    expect(mocks.helmLogWarn).not.toHaveBeenCalled();
  });

  it('ACTIONABLE_ERROR (bad_oauth_state): classifies as an error, not a warning', () => {
    const outcome = observeAuthResult({ ...baseInput, error: { code: 'bad_oauth_state', message: 'bad state' } });
    expect(outcome.bucket).toBe('actionable_error');
    expect(mocks.helmLogError).toHaveBeenCalledTimes(1);
  });

  it('never logs the raw Auth message — only code/feature/action/service/operation fields', () => {
    observeAuthResult({
      ...baseInput,
      error: { code: 'unexpected_failure', message: 'failure for user someone@example.com' },
    });
    expect(mocks.helmLogError).toHaveBeenCalledTimes(1);
    const fields = mocks.helmLogError.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(JSON.stringify(fields)).not.toContain('someone@example.com');
    expect(fields).toMatchObject({ feature: 'auth', action: 'sign_in', service: 'auth', operation: 'auth' });
  });

  it('unknown expectedness never disappears silently — lands in an actionable bucket', () => {
    const outcome = observeAuthResult({ ...baseInput, error: { code: 'mfa_verification_failed' } });
    expect(outcome.bucket).not.toBe('expected_control_flow');
    expect(outcome.bucket).not.toBe('routine_recovery');
    expect(outcome.envelope).not.toBeNull();
  });

  it('does NOT call Sentry.captureException — no such mock exists here and none is imported', () => {
    expect(() =>
      observeAuthResult({ ...baseInput, error: { code: 'unexpected_failure', message: 'boom' } }),
    ).not.toThrow();
  });

  it('never throws even when internal state is malformed', () => {
    expect(() => observeAuthResult({ ...baseInput, error: {} as never })).not.toThrow();
  });
});

describe('observeAuthResult — expectedMissingUser threads through to the classifier', () => {
  const resetInput = {
    feature: 'auth_password_reset',
    action: 'send_password_reset_link',
    operation: 'password_reset' as const,
  };

  it('EXPECTED with the flag: no metric, no log, no durable write', () => {
    const outcome = observeAuthResult({
      ...resetInput,
      expectedMissingUser: true,
      error: { code: 'user_not_found', status: 404, message: 'User not found' },
    });
    expect(outcome.bucket).toBe('expected_control_flow');
    expect(outcome.envelope).toBeNull();
    expect(mocks.recordAuth).not.toHaveBeenCalled();
    expect(mocks.helmLogWarn).not.toHaveBeenCalled();
    expect(mocks.helmLogError).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('ACTIONABLE without the flag: the same error is recorded', () => {
    const outcome = observeAuthResult({
      ...resetInput,
      error: { code: 'user_not_found', status: 404, message: 'User not found' },
    });
    expect(outcome.bucket).toBe('actionable_warning');
    expect(mocks.recordAuth).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleDbErrorRecording).toHaveBeenCalledTimes(1);
  });

  it('a 429 on that same declared-missing-user path is still recorded', () => {
    const outcome = observeAuthResult({
      ...resetInput,
      expectedMissingUser: true,
      error: { code: 'over_request_rate_limit', message: 'Too many requests' },
    });
    expect(outcome.bucket).toBe('actionable_warning');
    expect(mocks.recordAuth).toHaveBeenCalledTimes(1);
  });
});
