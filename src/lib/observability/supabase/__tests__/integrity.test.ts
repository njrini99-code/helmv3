import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordDbFailure: vi.fn(),
  helmLogError: vi.fn(),
  getSentryCorrelation: vi.fn(() => null as { traceId: string; spanId: string } | null),
  scheduleDbErrorRecording: vi.fn(),
}));

vi.mock('../../metrics', () => ({ recordDbFailure: mocks.recordDbFailure }));
vi.mock('../../structured-log', () => ({
  helmLog: { error: mocks.helmLogError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../correlation', () => ({ getSentryCorrelation: mocks.getSentryCorrelation }));
vi.mock('../record-db-error', () => ({ scheduleDbErrorRecording: mocks.scheduleDbErrorRecording }));

import { checkZeroRowMutationIntegrity } from '../integrity';

beforeEach(() => {
  vi.clearAllMocks();
});

const baseInput = {
  operation: 'update' as const,
  feature: 'round_tracking',
  action: 'submit_round',
  relation: 'golf_rounds',
};

describe('checkZeroRowMutationIntegrity', () => {
  it('is a no-op (ok:true, no side effects) when affectedRows meets the expectation', () => {
    const outcome = checkZeroRowMutationIntegrity({ ...baseInput, affectedRows: 1, expectedMinimumRows: 1 });
    expect(outcome.ok).toBe(true);
    expect(outcome.envelope).toBeNull();
    expect(mocks.recordDbFailure).not.toHaveBeenCalled();
    expect(mocks.scheduleDbErrorRecording).not.toHaveBeenCalled();
  });

  it('is a no-op when affectedRows EXCEEDS the expectation', () => {
    const outcome = checkZeroRowMutationIntegrity({ ...baseInput, affectedRows: 3, expectedMinimumRows: 1 });
    expect(outcome.ok).toBe(true);
  });

  it('detects the HTTP-200-but-zero-rows case: not ok, critical severity, forced individual row', () => {
    const outcome = checkZeroRowMutationIntegrity({ ...baseInput, affectedRows: 0, expectedMinimumRows: 1 });
    expect(outcome.ok).toBe(false);
    expect(outcome.envelope).not.toBeNull();
    expect(outcome.envelope!.severity).toBe('critical');
    expect(outcome.envelope!.expectedness).toBe('unexpected');
    expect(outcome.envelope!.httpStatus).toBe(200);
    expect(mocks.recordDbFailure).toHaveBeenCalledTimes(1);
    expect(mocks.helmLogError).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleDbErrorRecording).toHaveBeenCalledWith(expect.anything(), { forceIndividualRow: true });
  });

  it('records the actual vs expected counts in safeMetadata, not in free text', () => {
    const outcome = checkZeroRowMutationIntegrity({ ...baseInput, affectedRows: 0, expectedMinimumRows: 2 });
    expect(outcome.envelope!.safeMetadata).toEqual(
      expect.objectContaining({ affected_rows: 0, expected_minimum_rows: 2 }),
    );
  });

  it('a partial shortfall (some rows affected, still below expectation) is still flagged', () => {
    const outcome = checkZeroRowMutationIntegrity({ ...baseInput, affectedRows: 1, expectedMinimumRows: 3 });
    expect(outcome.ok).toBe(false);
  });

  it('never throws even on a pathological input', () => {
    expect(() =>
      checkZeroRowMutationIntegrity({ ...baseInput, affectedRows: Number.NaN, expectedMinimumRows: 1 }),
    ).not.toThrow();
  });
});
