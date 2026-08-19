import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The native app must NOT be idle-expired on the 8-hour browser window.
 *
 * Reported 2026-08-18 by a customer: "my guys still get logged out every time
 * you close the app". The 8-hour window (SESSION_IDLE_TIMEOUT_MS) is a
 * shared-BROWSER boundary — it protects a dashboard left open on a team
 * laptop. Applied to a phone, it fired on the most ordinary thing a coach
 * does: use the app in the evening, open it again the next morning. Every
 * reopen past the window was a forced re-login on a personal, passcode-locked
 * device.
 *
 * These tests pin BOTH directions. The native exemption is only trustworthy
 * if the browser boundary it diverges from is asserted in the same file —
 * otherwise a future change that quietly widens the window for everyone would
 * still leave the native test green.
 */

const mockGetUser = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      signOut: mockSignOut,
    },
    from: vi.fn(),
  })),
}));

import { updateSession } from '@/lib/supabase/middleware';
import {
  NATIVE_APP_SESSION_IDLE_TIMEOUT_MS,
  NATIVE_APP_UA_MARKER,
  SESSION_IDLE_TIMEOUT_MS,
} from '@/lib/auth/session-idle-shared';

/** The real Capacitor UA shape: a WebView UA with the marker appended. */
const NATIVE_UA = `Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ${NATIVE_APP_UA_MARKER}`;
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

function buildRequest(pathname: string, opts: { ua: string; lastActivity: number }) {
  const headers = new Headers({ 'user-agent': opts.ua });
  headers.set('cookie', `sb_last_activity=${opts.lastActivity}`);
  return new NextRequest(`https://app.example.com${pathname}`, { headers });
}

describe('updateSession — native app idle window', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockSignOut.mockReset();
    // last_sign_in_at is deliberately ancient: isIdleExpiredSession short
    // circuits when the SESSION is younger than the window, so a recent
    // sign-in would make these tests pass without the fix under test.
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'coach-1',
          last_sign_in_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
      error: null,
    });
    mockSignOut.mockResolvedValue({ error: null });
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://xyz.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps a native-app coach signed in overnight (the reported bug)', async () => {
    // 14 hours: past the 8h browser window, nowhere near the native one —
    // i.e. exactly "closed the app last night, opened it this morning".
    const lastActivity = Date.now() - 14 * 60 * 60 * 1000;
    expect(14 * 60 * 60 * 1000).toBeGreaterThan(SESSION_IDLE_TIMEOUT_MS);

    const res = await updateSession(
      buildRequest('/golf/dashboard', { ua: NATIVE_UA, lastActivity }),
    );

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
  });

  it('still signs out the SAME staleness in a desktop browser', async () => {
    const lastActivity = Date.now() - 14 * 60 * 60 * 1000;

    const res = await updateSession(
      buildRequest('/golf/dashboard', { ua: BROWSER_UA, lastActivity }),
    );

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location!).searchParams.get('message')).toBe('session_expired');
  });

  it('still expires a native session that is genuinely abandoned', async () => {
    // The exemption is a longer window, NOT "never expires" — a phone lost for
    // a month must still re-authenticate.
    const lastActivity = Date.now() - (NATIVE_APP_SESSION_IDLE_TIMEOUT_MS + 60 * 60 * 1000);

    const res = await updateSession(
      buildRequest('/golf/dashboard', { ua: NATIVE_UA, lastActivity }),
    );

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(res.headers.get('location')).not.toBeNull();
  });

  it('applies to baseball as well as golf', async () => {
    const lastActivity = Date.now() - 14 * 60 * 60 * 1000;

    const res = await updateSession(
      buildRequest('/baseball/dashboard/command-center', { ua: NATIVE_UA, lastActivity }),
    );

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
  });
});
