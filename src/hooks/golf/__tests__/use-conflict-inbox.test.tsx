// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  ConflictInboxRequest,
  ConflictInboxResult,
  ConflictInboxSnapshot,
} from '@/app/golf/actions/conflict-inbox';
import { useConflictInbox } from '../use-conflict-inbox';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function request(overrides: Partial<ConflictInboxRequest> = {}): ConflictInboxRequest {
  return { teamId: 'team-a', from: '2026-09-08', to: '2026-09-22', ...overrides };
}

function snapshot(overrides: Partial<ConflictInboxSnapshot> = {}): ConflictInboxSnapshot {
  return {
    teamId: 'team-a',
    window: { start: '2026-09-08T00:00:00.000Z', end: '2026-09-22T00:00:00.000Z' },
    checkedAt: '2026-09-08T12:00:00.000Z',
    groups: [],
    ...overrides,
  };
}

function success(data: ConflictInboxSnapshot): ConflictInboxResult {
  return { success: true, data };
}

describe('useConflictInbox', () => {
  it('resets to loading with no snapshot when the key (team or window) changes', async () => {
    const pendingA = deferred<ConflictInboxResult>();
    const pendingB = deferred<ConflictInboxResult>();
    const load = vi
      .fn<(request: ConflictInboxRequest) => Promise<ConflictInboxResult>>()
      .mockReturnValueOnce(pendingA.promise)
      .mockReturnValueOnce(pendingB.promise);
    const requestA = request();
    const requestB = request({ teamId: 'team-b' });

    const { result, rerender } = renderHook(
      ({ currentRequest }) => useConflictInbox(currentRequest, load),
      { initialProps: { currentRequest: requestA } },
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await act(async () => {
      pendingA.resolve(success(snapshot({ teamId: 'team-a', checkedAt: '2026-09-08T12:00:00.000Z' })));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.snapshot?.teamId).toBe('team-a'));

    // A brand new window must never show team-a's list as if it already
    // covered team-b — not even the loading flag alone: `snapshot` itself
    // must go back to null.
    rerender({ currentRequest: requestB });
    expect(result.current.snapshot).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.refreshing).toBe(false);

    await act(async () => {
      pendingB.resolve(success(snapshot({ teamId: 'team-b' })));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.snapshot?.teamId).toBe('team-b'));
  });

  it('keeps the last snapshot visible during an explicit refresh and reports refreshing, not loading', async () => {
    const first = deferred<ConflictInboxResult>();
    const refreshAttempt = deferred<ConflictInboxResult>();
    const load = vi
      .fn<(request: ConflictInboxRequest) => Promise<ConflictInboxResult>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(refreshAttempt.promise);
    const currentRequest = request();

    const { result } = renderHook(() => useConflictInbox(currentRequest, load));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(result.current.loading).toBe(true);

    const checkedAt = '2026-09-08T12:00:00.000Z';
    await act(async () => {
      first.resolve(success(snapshot({ checkedAt })));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.snapshot?.checkedAt).toBe(checkedAt));
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(false);

    act(() => result.current.refresh());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    // The stale snapshot (same checkedAt as before) stays visible; the hook
    // reports `refreshing`, never a bare `loading` that would justify
    // swapping the list for a skeleton.
    expect(result.current.snapshot?.checkedAt).toBe(checkedAt);
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(true);
  });

  it('never presents the cached snapshot as a fresh all-clear when a refresh fails: the stale checkedAt and the error both surface', async () => {
    const first = deferred<ConflictInboxResult>();
    const refreshAttempt = deferred<ConflictInboxResult>();
    const load = vi
      .fn<(request: ConflictInboxRequest) => Promise<ConflictInboxResult>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(refreshAttempt.promise);
    const currentRequest = request();

    const { result } = renderHook(() => useConflictInbox(currentRequest, load));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    const staleCheckedAt = '2026-09-08T09:00:00.000Z';
    await act(async () => {
      // An empty, clean snapshot — the exact shape a naive "cache as
      // all-clear" bug would happily keep showing after a failed refresh.
      first.resolve(success(snapshot({ groups: [], checkedAt: staleCheckedAt })));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.snapshot?.checkedAt).toBe(staleCheckedAt));

    act(() => result.current.refresh());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await act(async () => {
      refreshAttempt.resolve({ success: false, error: 'Conflicts could not be loaded. Please retry.' });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.error).toBe('Conflicts could not be loaded. Please retry.'));
    // The stale snapshot's OWN checkedAt is still what a consumer would
    // render — never replaced by a fresh-looking clean read, and never
    // silently dropped either.
    expect(result.current.snapshot?.checkedAt).toBe(staleCheckedAt);
    expect(result.current.snapshot?.groups).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(false);
  });

  it('does not update state when an in-flight request settles after unmount', async () => {
    const pending = deferred<ConflictInboxResult>();
    const load = vi
      .fn<(request: ConflictInboxRequest) => Promise<ConflictInboxResult>>()
      .mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useConflictInbox(request(), load));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      pending.resolve(success(snapshot()));
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('returns an inert result for a null request', () => {
    const load = vi.fn();
    const { result } = renderHook(() => useConflictInbox(null, load));
    expect(result.current).toMatchObject({ snapshot: null, loading: false, refreshing: false, error: null });
    expect(load).not.toHaveBeenCalled();
  });
});
