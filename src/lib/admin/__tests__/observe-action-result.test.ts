import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  logServerError: vi.fn(async () => {}),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: mocks.logServerError,
}));

import {
  extractActionSoftFailure,
  isExpectedSoftFailureMessage,
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

  it('extracts { data: null, error } envelopes', () => {
    expect(extractActionSoftFailure({ data: null, error: 'missing row' })).toEqual({
      message: 'missing row',
      code: null,
    });
  });

  it('classifies auth-ish copy as expected soft failures', () => {
    expect(isExpectedSoftFailureMessage('Not authenticated')).toBe(true);
    expect(isExpectedSoftFailureMessage('Could not complete the calendar action. Please try again.')).toBe(false);
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
});
