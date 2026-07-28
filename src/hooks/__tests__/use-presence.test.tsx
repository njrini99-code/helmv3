import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresence } from '../use-presence';

type AuthUser = { id: string };
type AuthCallback = (
  event: string,
  session: { user: AuthUser } | null,
) => void;

const {
  createClientMock,
  getUserMock,
  onAuthStateChangeMock,
  rpcMock,
  unsubscribeMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getUserMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  rpcMock: vi.fn(),
  unsubscribeMock: vi.fn(),
}));

let authCallback: AuthCallback;

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
}));

describe('usePresence authenticated heartbeat lifecycle (#1016)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rpcMock.mockReset().mockResolvedValue({ data: undefined, error: null });
    getUserMock.mockReset();
    unsubscribeMock.mockReset();
    onAuthStateChangeMock.mockReset().mockImplementation((callback: AuthCallback) => {
      authCallback = callback;
      return { data: { subscription: { unsubscribe: unsubscribeMock } } };
    });
    createClientMock.mockReset().mockReturnValue({
      auth: {
        getUser: getUserMock,
        onAuthStateChange: onAuthStateChangeMock,
      },
      rpc: rpcMock,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('never schedules or sends a heartbeat for an anonymous visitor', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    renderHook(() => usePresence());
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(125_000);
    });

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('starts for an authenticated session and stops all timers on sign-out', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    renderHook(() => usePresence());
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenLastCalledWith('heartbeat');

    act(() => {
      authCallback('SIGNED_OUT', null);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('starts when an authenticated session arrives after an anonymous mount', async () => {
    getUserMock
      .mockResolvedValueOnce({ data: { user: null }, error: null })
      .mockResolvedValueOnce({
        data: { user: { id: 'user-2' } },
        error: null,
      });

    renderHook(() => usePresence());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      authCallback('SIGNED_IN', { user: { id: 'user-2' } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('does not trust a cached auth event until getUser confirms it', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    renderHook(() => usePresence());
    act(() => {
      authCallback('INITIAL_SESSION', { user: { id: 'stale-user' } });
    });
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(125_000);
    });

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('handles a resolved RPC error as text and stops after auth is no longer valid', async () => {
    const permissionError = {
      code: '42501',
      message: 'permission denied for function heartbeat',
      details: null,
      hint: null,
    };
    getUserMock
      .mockResolvedValueOnce({
        data: { user: { id: 'user-1' } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { user: null }, error: null });
    rpcMock.mockResolvedValue({ data: undefined, error: permissionError });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    renderHook(() => usePresence());
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(debugSpy).toHaveBeenCalledWith(
      '[Presence] Heartbeat failed:',
      'code=42501 msg=permission denied for function heartbeat',
    );
    expect(getUserMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('creates one stable Supabase client across rerenders', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const { rerender } = renderHook(() => usePresence());
    await act(async () => {
      await Promise.resolve();
    });
    rerender();
    rerender();

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(onAuthStateChangeMock).toHaveBeenCalledTimes(1);
  });
});
