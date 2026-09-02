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

  // B2: two devices on one round. The RPCs (save_partial_round_atomic,
  // submit_round_atomic) are full-snapshot REPLACE and rely on
  // `expectedUpdatedAt` as an optimistic lock. If this hook silently resyncs
  // that token to whatever the SERVER reports on a background poll — even
  // when the poll proves the server has moved since this device's last known
  // checkpoint (`isStale`) — the next save from this (stale) device passes
  // the lock and REPLACES the round with this device's outdated in-memory
  // holes/shots, discarding the other device's newer work with no warning.
  function useTestStaleSync(initial: string | undefined, onRoundStale: (s: unknown) => void) {
    const expectedUpdatedAtRef = useRef<string | undefined>(initial);
    useRoundStatusSync({
      roundId: '11111111-1111-4111-8111-111111111111',
      expectedUpdatedAtRef,
      onRoundStale,
      syncIntervalMs: 30_000,
    });
    return expectedUpdatedAtRef;
  }

  it('does not adopt a newer server updated_at when the poll proves this device is behind (B2)', async () => {
    const onRoundStale = vi.fn();
    mocks.checkRoundStaleness.mockResolvedValueOnce({
      success: true,
      data: { isStale: true, currentUpdatedAt: '2026-08-25T00:05:00.000Z', status: 'in_progress' },
    });

    const rendered = renderHook(() => useTestStaleSync('2026-08-25T00:00:00.000Z', onRoundStale));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Still the OLD value this device last confirmed — never silently
    // resynced to the value another device/session produced.
    expect(rendered.result.current.current).toBe('2026-08-25T00:00:00.000Z');
    expect(onRoundStale).toHaveBeenCalledWith({
      currentUpdatedAt: '2026-08-25T00:05:00.000Z',
      status: 'in_progress',
    });
    rendered.unmount();
  });

  it('does not re-fire onRoundStale for the same server version on the next poll tick', async () => {
    vi.useFakeTimers();
    const onRoundStale = vi.fn();
    mocks.checkRoundStaleness.mockResolvedValue({
      success: true,
      data: { isStale: true, currentUpdatedAt: '2026-08-25T00:05:00.000Z', status: 'in_progress' },
    });

    const rendered = renderHook(() => useTestStaleSync('2026-08-25T00:00:00.000Z', onRoundStale));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(onRoundStale).toHaveBeenCalledTimes(1);
    expect(rendered.result.current.current).toBe('2026-08-25T00:00:00.000Z');
    rendered.unmount();
  });

  it('adopts the server updated_at once the poll confirms this device is already current', async () => {
    const onRoundStale = vi.fn();
    mocks.checkRoundStaleness.mockResolvedValueOnce({
      success: true,
      data: { isStale: false, currentUpdatedAt: '2026-08-25T00:00:00.000Z', status: 'in_progress' },
    });

    const rendered = renderHook(() => useTestStaleSync('2026-08-25T00:00:00.000Z', onRoundStale));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rendered.result.current.current).toBe('2026-08-25T00:00:00.000Z');
    expect(onRoundStale).not.toHaveBeenCalled();
    rendered.unmount();
  });
});
