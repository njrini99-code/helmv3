import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRoundStaleness: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/app/golf/actions/round-drafts', () => ({
  checkRoundStaleness: (...args: unknown[]) => mocks.checkRoundStaleness(...args),
}));

vi.mock('@/lib/error-logging', () => ({
  logError: (...args: unknown[]) => mocks.logError(...args),
}));

import { useRoundStatusSync } from '@/hooks/golf/use-round-status-sync';

function useTestStatusSync() {
  const expectedUpdatedAtRef = useRef<string | undefined>('2026-08-25T00:00:00.000Z');
  useRoundStatusSync({
    roundId: '11111111-1111-4111-8111-111111111111',
    expectedUpdatedAtRef,
    syncIntervalMs: 30_000,
  });
}

describe('useRoundStatusSync', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not turn the first transient status-poll transport failure into a client error', async () => {
    mocks.checkRoundStaleness.mockRejectedValueOnce(new Error('Load failed'));

    const rendered = renderHook(() => useTestStatusSync());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.checkRoundStaleness).toHaveBeenCalledTimes(1);
    expect(mocks.logError).not.toHaveBeenCalled();
    rendered.unmount();
  });

  it('reports one actionable error only after the status poll stays unavailable', async () => {
    vi.useFakeTimers();
    mocks.checkRoundStaleness.mockRejectedValue(new Error('Load failed'));

    const rendered = renderHook(() => useTestStatusSync());
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(mocks.checkRoundStaleness).toHaveBeenCalledTimes(3);
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError.mock.calls[0]?.[0]).toMatchObject({
      message: 'Round status synchronization has been unavailable for three attempts',
    });
    rendered.unmount();
  });
});
