import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordStorageFailure: vi.fn(),
  helmLogWarn: vi.fn(),
  helmLogError: vi.fn(),
  getSentryCorrelation: vi.fn(() => null as { traceId: string; spanId: string } | null),
  scheduleDbErrorRecording: vi.fn(),
}));

vi.mock('../../metrics', () => ({ recordStorageFailure: mocks.recordStorageFailure }));
vi.mock('../../structured-log', () => ({
  helmLog: { warn: mocks.helmLogWarn, error: mocks.helmLogError, info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../correlation', () => ({ getSentryCorrelation: mocks.getSentryCorrelation }));
vi.mock('../record-db-error', () => ({ scheduleDbErrorRecording: mocks.scheduleDbErrorRecording }));

import { observeStorageResult } from '../observe-storage';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSentryCorrelation.mockReturnValue(null);
});

const baseInput = {
  operation: 'delete' as const,
  feature: 'documents',
  action: 'delete_document',
  bucketClass: 'documents/document_version',
};

describe('observeStorageResult', () => {
  it('does nothing and reports observed:false when error is null', () => {
    const outcome = observeStorageResult({ ...baseInput, error: null });
    expect(outcome.observed).toBe(false);
    expect(mocks.recordStorageFailure).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('UNEXPLAINED AccessDenied is actionable, not silent: it still records', () => {
    // Changed 2026-09-03 after review. A denial the caller did not explain
    // must not be swallowed by `expected_control_flow`.
    const outcome = observeStorageResult({ ...baseInput, error: { code: 'AccessDenied', message: 'denied' } });
    expect(outcome.bucket).not.toBe('expected_control_flow');
    expect(mocks.recordStorageFailure).toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).toHaveBeenCalled();
  });

  it('EXPECTED (AccessDenied the caller declared routine): no metric, no log, no DB write', () => {
    const outcome = observeStorageResult({
      ...baseInput,
      error: { code: 'AccessDenied', message: 'denied' },
      expectedAccessDenied: true,
    });
    expect(outcome.bucket).toBe('expected_control_flow');
    expect(mocks.recordStorageFailure).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('ACTIONABLE_ERROR (AccessDenied on own path): records metric, error log, schedules DB write', () => {
    const outcome = observeStorageResult({
      ...baseInput,
      error: { code: 'AccessDenied', message: 'denied' },
      accessDeniedOnOwnPath: true,
    });
    expect(outcome.bucket).toBe('actionable_error');
    expect(mocks.recordStorageFailure).toHaveBeenCalledTimes(1);
    expect(mocks.recordStorageFailure).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'documents', action: 'delete_document', errorCode: 'AccessDenied' }),
    );
    expect(mocks.helmLogError).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleDbErrorRecording).toHaveBeenCalledTimes(1);
  });

  it('CRITICAL (DatabaseTimeout): uses the error log, not warn, regardless of context', () => {
    observeStorageResult({ ...baseInput, error: { code: 'DatabaseTimeout' } });
    expect(mocks.helmLogError).toHaveBeenCalledTimes(1);
    expect(mocks.helmLogWarn).not.toHaveBeenCalled();
  });

  it('the envelope carries bucketClass, never an object path', () => {
    let capturedEnvelope: unknown;
    mocks.scheduleDbErrorRecording.mockImplementation((envelope: unknown) => {
      capturedEnvelope = envelope;
    });
    observeStorageResult({ ...baseInput, error: { code: 'DatabaseTimeout' } });
    expect((capturedEnvelope as { bucketClass: string }).bucketClass).toBe('documents/document_version');
  });

  it('the log carries bucket_class as a safe dimension, not a raw path', () => {
    observeStorageResult({ ...baseInput, error: { code: 'DatabaseTimeout' } });
    const fields = mocks.helmLogError.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(fields.bucket_class).toBe('documents/document_version');
  });

  it('ROUTINE_RECOVERY (ResourceAlreadyExists + idempotentUpsert): no metric, no log, no DB write', () => {
    const outcome = observeStorageResult({
      ...baseInput,
      error: { code: 'ResourceAlreadyExists' },
      idempotentUpsert: true,
    });
    expect(outcome.bucket).toBe('routine_recovery');
    expect(mocks.recordStorageFailure).not.toHaveBeenCalled();
  });

  it('never throws even when internal state is malformed', () => {
    expect(() => observeStorageResult({ ...baseInput, error: {} as never })).not.toThrow();
  });
});
