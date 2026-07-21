// =============================================================================
// src/lib/auth/__tests__/session-activity.test.ts
//
// #918 + 2026-07-20 idle-bounce incident — useSessionActivity must:
//   1. Route a demo-context session (user_metadata.is_demo) back to the
//      sport's /demo gate with a friendly message, not the dead-end
//      password /login.
//   2. Leave a normal (non-demo) idle-timeout and the /admin idle-timeout
//      path completely unchanged.
//   3. Never hang: the demo-detection probe (getUser()) is hard-timeout
//      guarded, so a stuck refresh-token exchange still lets the logout
//      redirect complete instead of leaving the tab stuck mid-signout.
//   4. NEVER log out at mount. A fresh page render means the middleware
//      already approved the request (with its last_sign_in_at guard) — the
//      client-side logout decision belongs to the VISIBILITY path
//      (visibilitychange/pageshow), which catches bfcache/hidden-tab
//      restores the server can't see. Mount-time booting was the
//      "signed out after ~2 minutes" incident: the 30-day sb_last_activity
//      marker survives sign-in, so a stale marker from a previous session
//      booted freshly-signed-in users.
//   5. Use the demo-aware idle window (30 min demo / 5 min standard) in
//      those visibility checks.
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
  // resolveIdleTimeoutMs reads the LOCAL session (no network) to pick the
  // demo vs standard idle window — the double must provide it or the hook
  // silently falls back to the standard window and the demo-window tests
  // go false-green (adversarial-review finding, 2026-07-20).
  getSession: vi.fn(async (): Promise<{ data: { session: { user: FakeUser } | null } }> => ({
    data: { session: null },
  })),
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mocks.getUser,
      getSession: mocks.getSession,
      signOut: mocks.signOut,
    },
  })),
}));

import { useSessionActivity } from '@/lib/auth/session-activity';

/** 13h ago — stale beyond BOTH the 8h standard and 12h demo windows. */
const STALE = () => Date.now() - 13 * 60 * 60 * 1000;
/** 9h ago — stale for a standard session, INSIDE the 12h demo window. */
const STALE_FOR_STANDARD_ONLY = () => Date.now() - 9 * 60 * 60 * 1000;

function setPath(pathname: string) {
  window.history.pushState({}, '', pathname);
}

function setActivityCookie(value: number) {
  document.cookie = `${SESSION_IDLE_COOKIE}=${value}; path=/`;
}

function clearCookies() {
  document.cookie = `${SESSION_IDLE_COOKIE}=; path=/; max-age=0`;
}

/** Let the hook's async init (window resolution + setup) settle. */
async function settleMount() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Simulate a tab restore: stamp a stale marker, then fire visibilitychange. */
async function restoreTabWithMarker(value: number) {
  setActivityCookie(value);
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function demoUser(id = 'demo-1'): FakeUser {
  return { id, user_metadata: { is_demo: true } };
}

function mockSignedIn(user: FakeUser) {
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { user } } });
}

describe('useSessionActivity — idle-timeout logout demo routing (#918)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCookies();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    clearCookies();
  });

  it('routes an idle-expired golf demo session to /golf/demo?message=demo_session_expired', async () => {
    setPath('/golf/dashboard');
    mockSignedIn(demoUser());

    renderHook(() => useSessionActivity());
    await settleMount();
    await restoreTabWithMarker(STALE());

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(mocks.signOut).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith('/golf/demo?message=demo_session_expired');
  });

  it('routes an idle-expired baseball demo session to /baseball/demo?message=demo_session_expired', async () => {
    setPath('/baseball/dashboard/command-center');
    mockSignedIn(demoUser('demo-2'));

    renderHook(() => useSessionActivity());
    await settleMount();
    await restoreTabWithMarker(STALE());

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(replaceMock).toHaveBeenCalledWith('/baseball/demo?message=demo_session_expired');
  });

  it('leaves a NON-demo idle-timeout on the normal /login redirect unchanged', async () => {
    setPath('/golf/dashboard');
    mockSignedIn({ id: 'real-coach-1', user_metadata: {} });

    renderHook(() => useSessionActivity());
    await settleMount();
    await restoreTabWithMarker(STALE());

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(replaceMock).toHaveBeenCalledWith('/golf/login?message=session_expired');
  });

  it('leaves the /admin idle-timeout path unchanged even for a demo-flagged user', async () => {
    setPath('/admin/errors');
    // /admin has no sport prefix, so the demo probe never even applies here —
    // this proves the admin branch still wins regardless.
    mockSignedIn(demoUser());

    renderHook(() => useSessionActivity());
    await settleMount();
    await restoreTabWithMarker(STALE());

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    const [url] = replaceMock.mock.calls[0] as [string];
    expect(url.startsWith('/golf/login?')).toBe(true);
    expect(url).toContain('message=session_expired');
    expect(url).toContain('returnTo=%2Fadmin%2Ferrors');
  });

  it('does NOT log out at mount even with a very stale marker (middleware owns page loads)', async () => {
    setPath('/golf/dashboard');
    mockSignedIn({ id: 'real-coach-5', user_metadata: {} });
    // Marker from a PREVIOUS session, 35 min stale, present BEFORE mount —
    // the 2026-07-20 "signed out after ~2 minutes" trigger.
    setActivityCookie(STALE());

    renderHook(() => useSessionActivity());
    await settleMount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('a DEMO session restored after 9 idle hours stays signed in (12-hour demo window)', async () => {
    setPath('/golf/dashboard');
    mockSignedIn(demoUser());

    renderHook(() => useSessionActivity());
    // Window resolution must actually run (guards against the false-green
    // fallback where a missing getSession silently picks the standard window).
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalled());
    await settleMount();
    await restoreTabWithMarker(STALE_FOR_STANDARD_ONLY());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('a REGULAR session restored after 9 idle hours still logs out (8-hour window)', async () => {
    setPath('/golf/dashboard');
    mockSignedIn({ id: 'real-coach-9', user_metadata: {} });

    renderHook(() => useSessionActivity());
    await settleMount();
    await restoreTabWithMarker(STALE_FOR_STANDARD_ONLY());

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(replaceMock).toHaveBeenCalledWith('/golf/login?message=session_expired');
  });

  it('never hangs the logout: a getUser() that hangs forever still completes the redirect', async () => {
    setPath('/golf/dashboard');
    mockSignedIn({ id: 'real-coach-1', user_metadata: {} });

    renderHook(() => useSessionActivity());
    await settleMount();

    vi.useFakeTimers();
    try {
      // Simulates the exact failure mode this fix targets — a stuck
      // refresh-token exchange whose promise never settles.
      mocks.getUser.mockReturnValue(new Promise<never>(() => {}));
      setActivityCookie(Date.now() - 13 * 60 * 60 * 1000);
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

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
