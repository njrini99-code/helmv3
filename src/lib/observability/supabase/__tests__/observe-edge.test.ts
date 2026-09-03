import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordEdgeFunctionFailure: vi.fn(),
  helmLogWarn: vi.fn(),
  helmLogError: vi.fn(),
  getSentryCorrelation: vi.fn(() => null as { traceId: string; spanId: string } | null),
  scheduleDbErrorRecording: vi.fn(),
}));

vi.mock('../../metrics', () => ({ recordEdgeFunctionFailure: mocks.recordEdgeFunctionFailure }));
vi.mock('../../structured-log', () => ({
  helmLog: { warn: mocks.helmLogWarn, error: mocks.helmLogError, info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../correlation', () => ({ getSentryCorrelation: mocks.getSentryCorrelation }));
vi.mock('../record-db-error', () => ({ scheduleDbErrorRecording: mocks.scheduleDbErrorRecording }));

import { observeEdgeInvoke } from '../observe-edge';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSentryCorrelation.mockReturnValue(null);
});

const baseInput = {
  functionName: 'send-apns-push',
  feature: 'push_notifications',
  action: 'send_push',
};

describe('observeEdgeInvoke', () => {
  it('does nothing and reports observed:false when error is null', () => {
    const outcome = observeEdgeInvoke({ ...baseInput, error: null });
    expect(outcome.observed).toBe(false);
    expect(mocks.recordEdgeFunctionFailure).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('FunctionsRelayError: records metric, error log, schedules DB write', () => {
    const outcome = observeEdgeInvoke({ ...baseInput, error: { name: 'FunctionsRelayError', message: 'relay error' } });
    expect(outcome.bucket).toBe('actionable_error');
    expect(mocks.recordEdgeFunctionFailure).toHaveBeenCalledTimes(1);
    expect(mocks.recordEdgeFunctionFailure).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'push_notifications', action: 'send_push', errorCode: 'relay_error' }),
    );
    expect(mocks.helmLogError).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleDbErrorRecording).toHaveBeenCalledTimes(1);
  });

  it('FunctionsHttpError 5xx: critical, uses the error log', () => {
    observeEdgeInvoke({
      ...baseInput,
      error: { name: 'FunctionsHttpError', context: { status: 500 } },
    });
    expect(mocks.helmLogError).toHaveBeenCalledTimes(1);
    expect(mocks.helmLogWarn).not.toHaveBeenCalled();
  });

  it('FunctionsHttpError 4xx: warning, uses the warn log', () => {
    observeEdgeInvoke({ ...baseInput, error: { name: 'FunctionsHttpError', context: { status: 400 } } });
    expect(mocks.helmLogWarn).toHaveBeenCalledTimes(1);
    expect(mocks.helmLogError).not.toHaveBeenCalled();
  });

  it('the envelope carries functionName and service edge_function', () => {
    let captured: unknown;
    mocks.scheduleDbErrorRecording.mockImplementation((envelope: unknown) => {
      captured = envelope;
    });
    observeEdgeInvoke({ ...baseInput, error: { name: 'FunctionsRelayError' } });
    expect((captured as { service: string; functionName: string }).service).toBe('edge_function');
    expect((captured as { service: string; functionName: string }).functionName).toBe('send-apns-push');
  });

  it('unknown error name lands in an actionable bucket, never dropped', () => {
    const outcome = observeEdgeInvoke({ ...baseInput, error: { name: 'WeirdError' } });
    expect(outcome.bucket).not.toBe('expected_control_flow');
    expect(outcome.bucket).not.toBe('routine_recovery');
  });

  it('never throws even when internal state is malformed', () => {
    expect(() => observeEdgeInvoke({ ...baseInput, error: {} as never })).not.toThrow();
  });
});
