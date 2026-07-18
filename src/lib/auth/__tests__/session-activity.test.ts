// =============================================================================
// src/lib/auth/__tests__/session-activity.test.ts
//
// #918 — useSessionActivity's idle-timeout logout must:
//   1. Route a demo-context session (user_metadata.is_demo) back to the
//      sport's /demo gate with a friendly message, not the dead-end
//      password /login.
//   2. Leave a normal (non-demo) idle-timeout and the /admin idle-timeout
//      path completely unchanged.
//   3. Never hang: the demo-detection probe (getUser()) is hard-timeout
//      guarded, so a stuck refresh-token exchange still lets the logout
//      redirect complete instead of leaving the tab stuck mid-signout.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { SESSION_IDLE_COOKIE } from '@/lib/auth/session-idle-shared';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

interface FakeUser {
  id: string;
  user_metadata: Record<string, unknown>;
}

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async (): Promise<{ data: { user: FakeUser | null }; error: unknown }> => ({
    data: { user: null },
    error: null,
  })),
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
  })),
}));

import { useSessionActivity } from '@/lib/auth/session-activity';

/** A `sb_last_activity` value 10 minutes in the past — past the 5-min idle window. */
const STALE = Date.now() - 10 * 60 * 1000;

function setPath(pathname: string) {
  window.history.pushState({}, '', pathname);
}

function setStaleActivityCookie() {
  document.cookie = `${SESSION_IDLE_COOKIE}=${STALE}; path=/`;
}

function clearCookies() {
  document.cookie = `${SESSION_IDLE_COOKIE}=; path=/; max-age=0`;
}

describe('useSessionActivity — idle-timeout logout demo routing (#918)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCookies();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    clearCookies();
  });

  it('routes an idle-expired golf demo session to /golf/demo?message=demo_session_expired', async () => {
    setPath('/golf/dashboard');
    setStaleActivityCookie();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'demo-1', user_metadata: { is_demo: true } } },
      error: null,
    });

    renderHook(() => useSessionActivity());

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());

    expect(mocks.signOut).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith('/golf/demo?message=demo_session_expired');
  });

  it('routes an idle-expired baseball demo session to /baseball/demo?message=demo_session_expired', async () => {
    setPath('/baseball/dashboard/command-center');
    setStaleActivityCookie();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'demo-2', user_metadata: { is_demo: true } } },
      error: null,
    });

    renderHook(() => useSessionActivity());

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(replaceMock).toHaveBeenCalledWith('/baseball/demo?message=demo_session_expired');
  });

  it('leaves a NON-demo idle-timeout on the normal /login redirect unchanged', async () => {
    setPath('/golf/dashboard');
    setStaleActivityCookie();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'real-coach-1', user_metadata: {} } },
      error: null,
    });

    renderHook(() => useSessionActivity());

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(replaceMock).toHaveBeenCalledWith('/golf/login?message=session_expired');
  });

  it('leaves the /admin idle-timeout path unchanged even for a demo-flagged user', async () => {
    setPath('/admin/errors');
    setStaleActivityCookie();
    // /admin has no sport prefix, so the demo probe never even applies here —
    // this proves the admin branch still wins regardless.
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'demo-1', user_metadata: { is_demo: true } } },
      error: null,
    });

    renderHook(() => useSessionActivity());

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    const [url] = replaceMock.mock.calls[0] as [string];
    expect(url.startsWith('/golf/login?')).toBe(true);
    expect(url).toContain('message=session_expired');
    expect(url).toContain('returnTo=%2Fadmin%2Ferrors');
  });

  it('never hangs the logout: a getUser() that hangs forever still completes the redirect', async () => {
    vi.useFakeTimers();
    try {
      setPath('/golf/dashboard');
      setStaleActivityCookie();
      // Simulates the exact failure mode this fix targets — a stuck
      // refresh-token exchange whose promise never settles.
      mocks.getUser.mockReturnValue(new Promise<never>(() => {}));

      renderHook(() => useSessionActivity());

      // Advance past the probe's hard 4s deadline.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4100);
      });

      expect(replaceMock).toHaveBeenCalledWith('/golf/login?message=session_expired');
    } finally {
      vi.useRealTimers();
    }
  });
});
