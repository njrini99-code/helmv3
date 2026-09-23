// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  ScheduleSnapshot,
  ScheduleWindowRequest,
  ScheduleWindowResult,
} from '@/lib/calendar/scheduling-contracts';
import { useScheduleWindow } from '../use-schedule-window';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function request(overrides: Partial<ScheduleWindowRequest> = {}): ScheduleWindowRequest {
  return {
    teamId: 'team-a',
    date: '2026-09-08',
    participantIds: ['player-2', 'player-1', 'player-2'],
    ...overrides,
  };
}

function snapshot(teamId: string, participantIds: string[]): ScheduleSnapshot {
  return {
    teamId,
    timeZone: 'America/New_York',
    window: { start: '2026-09-08T00:00:00Z', end: '2026-09-09T00:00:00Z' },
    checkedAt: '2026-09-08T12:00:00Z',
    participants: participantIds.map((id) => ({
      id,
      kind: 'player' as const,
      name: id,
      avatarUrl: null,
      isViewer: false,
      required: true,
      verification: 'complete' as const,
      intervals: [],
    })),
  };
}

function success(data: ScheduleSnapshot): ScheduleWindowResult {
  return { success: true, data };
}

describe('useScheduleWindow', () => {
  it('deduplicates and sorts participants, and ignores an older response after the key changes', async () => {
    const pendingA = deferred<ScheduleWindowResult>();
    const pendingB = deferred<ScheduleWindowResult>();
    const load = vi
      .fn<(request: ScheduleWindowRequest) => Promise<ScheduleWindowResult>>()
      .mockReturnValueOnce(pendingA.promise)
      .mockReturnValueOnce(pendingB.promise);
    const requestA = request();
    const requestB = request({ teamId: 'team-b', participantIds: ['player-3'] });
    const { result, rerender } = renderHook(
      ({ currentRequest, loader }) => useScheduleWindow(currentRequest, loader),
      { initialProps: { currentRequest: requestA, loader: load } },
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledWith({
      ...requestA,
      participantIds: ['player-1', 'player-2'],
    });

    rerender({ currentRequest: requestB, loader: load });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(result.current.snapshot).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => {
      pendingA.resolve(success(snapshot('team-a', ['player-1', 'player-2'])));
      await Promise.resolve();
    });
    expect(result.current.snapshot).toBeNull();

    await act(async () => {
      pendingB.resolve(success(snapshot('team-b', ['player-3'])));
      await Promise.resolve();
    });
    expect(result.current.snapshot?.teamId).toBe('team-b');
  });

  it('preserves a same-key snapshot during retry and surfaces a retry failure', async () => {
    const first = deferred<ScheduleWindowResult>();
    const retryAttempt = deferred<ScheduleWindowResult>();
    const load = vi
      .fn<(request: ScheduleWindowRequest) => Promise<ScheduleWindowResult>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(retryAttempt.promise);
    const currentRequest = request({ participantIds: ['player-1'] });
    const { result, rerender } = renderHook(() =>
      useScheduleWindow(currentRequest, (nextRequest) => load(nextRequest)),
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    rerender();
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      first.resolve(success(snapshot('team-a', ['player-1'])));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.snapshot?.teamId).toBe('team-a'));

    act(() => result.current.retry());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(result.current.snapshot?.teamId).toBe('team-a');
    expect(result.current.loading).toBe(true);

    await act(async () => {
      retryAttempt.reject(new Error('Schedule service unavailable.'));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.error).toBe('Schedule service unavailable.'));
    expect(result.current.snapshot?.teamId).toBe('team-a');
    expect(result.current.loading).toBe(false);
  });

  it('does not update state when an in-flight request settles after unmount', async () => {
    const pending = deferred<ScheduleWindowResult>();
    const load = vi
      .fn<(request: ScheduleWindowRequest) => Promise<ScheduleWindowResult>>()
      .mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useScheduleWindow(request(), load));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      pending.resolve(success(snapshot('team-a', ['player-1', 'player-2'])));
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
