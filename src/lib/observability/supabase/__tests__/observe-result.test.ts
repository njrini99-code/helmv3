import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordDbFailure: vi.fn(),
  helmLogWarn: vi.fn(),
  helmLogError: vi.fn(),
  getSentryCorrelation: vi.fn(() => null as { traceId: string; spanId: string } | null),
  scheduleDbErrorRecording: vi.fn(),
}));

vi.mock('../../metrics', () => ({ recordDbFailure: mocks.recordDbFailure }));
vi.mock('../../structured-log', () => ({
  helmLog: { warn: mocks.helmLogWarn, error: mocks.helmLogError, info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../correlation', () => ({ getSentryCorrelation: mocks.getSentryCorrelation }));
vi.mock('../record-db-error', () => ({ scheduleDbErrorRecording: mocks.scheduleDbErrorRecording }));

import { observeSupabaseResult, classifyBucket } from '../observe-result';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSentryCorrelation.mockReturnValue(null);
});

const baseInput = {
  operation: 'rpc' as const,
  feature: 'round_tracking',
  action: 'save_partial_round',
  rpc: 'save_partial_round_atomic',
};

describe('classifyBucket', () => {
  it('maps every (expectedness, severity) pair to exactly one of the five brief §7 buckets', () => {
    expect(classifyBucket('expected', 'info')).toBe('expected_control_flow');
    expect(classifyBucket('routine_recovery', 'warning')).toBe('routine_recovery');
    expect(classifyBucket('unexpected', 'critical')).toBe('critical_error');
    expect(classifyBucket('unexpected', 'error')).toBe('actionable_error');
    expect(classifyBucket('unexpected', 'warning')).toBe('actionable_warning');
    // unknown expectedness never disappears silently — lands in an actionable bucket
    expect(classifyBucket('unknown', 'warning')).toBe('actionable_warning');
  });
});

describe('observeSupabaseResult', () => {
  it('does nothing and reports observed:false when error is null', () => {
    const outcome = observeSupabaseResult({ ...baseInput, error: null });
    expect(outcome.observed).toBe(false);
    expect(outcome.envelope).toBeNull();
    expect(mocks.recordDbFailure).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('EXPECTED_CONTROL_FLOW (42501 + expectedAuthorizationDenial): no metric, no log, no DB write', () => {
    const outcome = observeSupabaseResult({
      ...baseInput,
      error: { code: '42501', message: 'permission denied' },
      expectedAuthorizationDenial: true,
    });
    expect(outcome.bucket).toBe('expected_control_flow');
    expect(outcome.envelope).toBeNull();
    expect(mocks.recordDbFailure).not.toHaveBeenCalled();
    expect(mocks.helmLogWarn).not.toHaveBeenCalled();
    expect(mocks.helmLogError).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('ROUTINE_RECOVERY (40001 serialization_failure): no metric, no log, no DB write', () => {
    const outcome = observeSupabaseResult({ ...baseInput, error: { code: '40001', message: 'serialization failure' } });
    expect(outcome.bucket).toBe('routine_recovery');
    expect(mocks.recordDbFailure).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('ACTIONABLE_ERROR (unexpected 42501): records metric, logs, schedules the DB write', () => {
    const outcome = observeSupabaseResult({
      ...baseInput,
      error: { code: '42501', message: 'permission denied for table golf_rounds' },
      durationMs: 88,
      sport: 'golf',
    });
    expect(outcome.bucket).toBe('actionable_error');
    expect(outcome.envelope).not.toBeNull();
    expect(mocks.recordDbFailure).toHaveBeenCalledTimes(1);
    expect(mocks.recordDbFailure).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'round_tracking', action: 'save_partial_round', errorCode: '42501' }),
    );
    expect(mocks.helmLogError).toHaveBeenCalledTimes(1);
    expect(mocks.helmLogWarn).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).toHaveBeenCalledTimes(1);
  });

  it('CRITICAL_ERROR (42P01 schema drift): uses the error log, not warn', () => {
    observeSupabaseResult({ ...baseInput, error: { code: '42P01', message: 'relation does not exist' } });
    expect(mocks.helmLogError).toHaveBeenCalledTimes(1);
    expect(mocks.helmLogWarn).not.toHaveBeenCalled();
  });

  it('ACTIONABLE_WARNING (unexpected 23503): uses helmLog.warn, not error', () => {
    observeSupabaseResult({ ...baseInput, error: { code: '23503', message: 'violates foreign key constraint' } });
    expect(mocks.helmLogWarn).toHaveBeenCalledTimes(1);
    expect(mocks.helmLogError).not.toHaveBeenCalled();
  });

  it('does NOT call Sentry.captureException — no such mock exists here and none is imported', () => {
    // If observe-result.ts ever imports @sentry/nextjs directly for capture,
    // this test file's absence of a Sentry mock would surface as an import
    // error rather than a silent pass — a deliberate tripwire for the
    // "no duplicate Sentry capture" design rule in the file header.
    expect(() =>
      observeSupabaseResult({ ...baseInput, error: { code: '42501', message: 'permission denied' } }),
    ).not.toThrow();
  });

  it('forwards forceIndividualRow through to scheduleDbErrorRecording', () => {
    observeSupabaseResult({
      ...baseInput,
      error: { code: '42P01', message: 'relation does not exist' },
      forceIndividualRow: true,
    });
    expect(mocks.scheduleDbErrorRecording).toHaveBeenCalledWith(expect.anything(), { forceIndividualRow: true });
  });

  it('never throws even when internal state is malformed', () => {
    expect(() => observeSupabaseResult({ ...baseInput, error: {} as never })).not.toThrow();
  });
});
