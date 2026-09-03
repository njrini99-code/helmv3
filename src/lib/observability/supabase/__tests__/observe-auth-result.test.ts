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

import { observeAuthResult } from '../observe-auth-result';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSentryCorrelation.mockReturnValue(null);
});

const baseInput = {
  operation: 'sign_in' as const,
  feature: 'auth_onboarding',
  action: 'golf.login',
};

describe('observeAuthResult', () => {
  it('does nothing when error is null', () => {
    const outcome = observeAuthResult({ ...baseInput, error: null });
    expect(outcome.observed).toBe(false);
    expect(mocks.recordAuth).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('EXPECTED (invalid_credentials): records the auth metric but no log, no DB write', () => {
    const outcome = observeAuthResult({ ...baseInput, error: { code: 'invalid_credentials', status: 400 } });
    expect(outcome.bucket).toBe('expected_control_flow');
    expect(outcome.envelope).toBeNull();
    // The metric fires for EVERY observed error (attempt/outcome tracking, brief §36-39)
    // — only the durable DB write and Sentry-adjacent log skip the two quiet buckets.
    expect(mocks.recordAuth).toHaveBeenCalledTimes(1);
    expect(mocks.helmLogWarn).not.toHaveBeenCalled();
    expect(mocks.helmLogError).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('CRITICAL (unexpected_failure/500): logs with error and schedules the out-of-band write', () => {
    const outcome = observeAuthResult({ ...baseInput, error: { code: 'unexpected_failure', status: 500 } });
    expect(outcome.bucket).toBe('critical_error');
    expect(outcome.envelope).not.toBeNull();
    expect(outcome.envelope?.service).toBe('auth');
    expect(outcome.envelope?.authCode).toBe('unexpected_failure');
    expect(mocks.helmLogError).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleDbErrorRecording).toHaveBeenCalledTimes(1);
  });

  it('ACTIONABLE_WARNING (rate limit): uses helmLog.warn, not error', () => {
    observeAuthResult({ ...baseInput, operation: 'otp_send', error: { code: 'over_email_send_rate_limit', status: 429 } });
    expect(mocks.helmLogWarn).toHaveBeenCalledTimes(1);
    expect(mocks.helmLogError).not.toHaveBeenCalled();
  });

  it('provider_disabled with providerOptional stays expected — no write', () => {
    const outcome = observeAuthResult({
      ...baseInput,
      error: { code: 'provider_disabled', status: 422 },
      providerOptional: true,
    });
    expect(outcome.bucket).toBe('expected_control_flow');
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('never throws even with a malformed error object', () => {
    expect(() => observeAuthResult({ ...baseInput, error: {} as never })).not.toThrow();
  });
});
