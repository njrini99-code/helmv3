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

import { observeStorageResult } from '../observe-storage-result';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSentryCorrelation.mockReturnValue(null);
});

const baseInput = {
  operation: 'download' as const,
  feature: 'player_profile',
  action: 'load_avatar',
  bucketClass: 'player_avatar',
};

describe('observeStorageResult', () => {
  it('does nothing when error is null', () => {
    const outcome = observeStorageResult({ ...baseInput, error: null });
    expect(outcome.observed).toBe(false);
    expect(mocks.recordDbFailure).not.toHaveBeenCalled();
  });

  it('EXPECTED (missing avatar, declared): metric fires, no log, no DB write', () => {
    const outcome = observeStorageResult({
      ...baseInput,
      error: { code: 'NoSuchKey', statusCode: '404' },
      expectedMissingObject: true,
    });
    expect(outcome.bucket).toBe('expected_control_flow');
    expect(mocks.recordDbFailure).toHaveBeenCalledTimes(1);
    expect(mocks.helmLogError).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('CRITICAL (DatabaseTimeout): logs error, schedules the out-of-band write, envelope carries the bucketClass label', () => {
    const outcome = observeStorageResult({ ...baseInput, error: { code: 'DatabaseTimeout' } });
    expect(outcome.bucket).toBe('critical_error');
    expect(outcome.envelope?.service).toBe('storage');
    expect(outcome.envelope?.bucketClass).toBe('player_avatar');
    expect(outcome.envelope?.storageCode).toBe('DatabaseTimeout');
    expect(mocks.helmLogError).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleDbErrorRecording).toHaveBeenCalledTimes(1);
  });

  it('never throws on a malformed error', () => {
    expect(() => observeStorageResult({ ...baseInput, error: {} as never })).not.toThrow();
  });
});
