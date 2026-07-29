import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * `updateSession` resolves "you are signed in, you don't need the sign-in page"
 * on the SERVER, before any HTML ships.
 *
 * WHY IT MOVED HERE
 *
 * /golf/login is a client component. It used to paint the whole screen — scene,
 * brand lockup entrance, form card entrance — then run an async session check
 * and `router.replace` the user away once it resolved. That is the "login
 * animation is fidgety when I'm already logged in" report: a screen we already
 * knew was wrong, rendered anyway, then visibly corrected. The session was
 * knowable one hop earlier, for free.
 *
 * THE TRAP THIS SUITE GUARDS
 *
 * The bounce MUST NOT fire for an idle session. `isPublicRoute` deliberately
 * marks every (auth) route public, so the idle-reauth gate never runs on /login
 * — an idle session arrives here looking perfectly authenticated. Bounce it to
 * the dashboard and the dashboard's own gate bounces it back to login: an
 * infinite redirect on the one page that could have fixed it (#730).
 *
 * The first draft of this feature had exactly that bug. It was caught by two
 * pre-existing tests in middleware-idle-timeout-public-routes.test.ts, which is
 * why the fresh-vs-idle pair below is asserted explicitly rather than left
 * implicit.
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

function buildRequest(pathAndQuery: string, cookieHeader?: string) {
  const headers = new Headers({ 'user-agent': 'Mozilla/5.0 (test)' });
  if (cookieHeader) headers.set('cookie', cookieHeader);
  return new NextRequest(`https://app.example.com${pathAndQuery}`, { headers });
}

/** Fresh marker + a recent sign-in: unambiguously an active session. */
const freshCookie = () => `sb_last_activity=${Date.now()}`;
const activeUser = {
  id: 'user-1',
  last_sign_in_at: new Date(Date.now() - 60_000).toISOString(),
};

describe('updateSession — authenticated user on a sign-in page', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockSignOut.mockReset();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://xyz.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPER_ADMIN_USER_IDS', 'admin-1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('redirects an active session off /golf/login to the golf dashboard', async () => {
    mockGetUser.mockResolvedValue({ data: { user: activeUser }, error: null });

    const res = await updateSession(buildRequest('/golf/login', freshCookie()));

    expect(new URL(res.headers.get('location') as string).pathname).toBe('/golf/dashboard');
  });

  it('redirects an active session off /baseball/login and /golf/signup too', async () => {
    for (const [path, expected] of [
      ['/baseball/login', '/baseball/dashboard/command-center'],
      ['/golf/signup', '/golf/dashboard'],
    ] as const) {
      mockGetUser.mockResolvedValue({ data: { user: activeUser }, error: null });

      const res = await updateSession(buildRequest(path, freshCookie()));

      expect(new URL(res.headers.get('location') as string).pathname).toBe(expected);
    }
  });

  it('honours a safe returnTo over the sport default', async () => {
    mockGetUser.mockResolvedValue({ data: { user: activeUser }, error: null });

    const res = await updateSession(
      buildRequest('/golf/login?returnTo=%2Fgolf%2Fdashboard%2Froster', freshCookie()),
    );

    expect(new URL(res.headers.get('location') as string).pathname).toBe('/golf/dashboard/roster');
  });

  it('ignores an off-origin returnTo rather than redirecting to it', async () => {
    mockGetUser.mockResolvedValue({ data: { user: activeUser }, error: null });

    const res = await updateSession(
      buildRequest('/golf/login?returnTo=https%3A%2F%2Fevil.example%2Fsteal', freshCookie()),
    );

    const location = new URL(res.headers.get('location') as string);
    expect(location.host).toBe('app.example.com');
    expect(location.pathname).toBe('/golf/dashboard');
  });

  it('does NOT bounce an IDLE session — that would loop it back here (#730)', async () => {
    // 9h ago, past the 8h window, and a sign-in old enough that
    // sessionYoungerThanWindow cannot rescue it.
    const stale = Date.now() - 9 * 60 * 60 * 1000;
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', last_sign_in_at: new Date(stale).toISOString() } },
      error: null,
    });

    const res = await updateSession(buildRequest('/golf/login', `sb_last_activity=${stale}`));

    expect(res.headers.get('location')).toBeNull();
  });

  it('does NOT bounce an anonymous visitor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await updateSession(buildRequest('/golf/login'));

    expect(res.headers.get('location')).toBeNull();
  });

  it('leaves the auth routes that need a session alone', async () => {
    // Each of these would be a functional break, not a cosmetic one — the
    // recovery link is what signs a user in, so bouncing it kills password reset.
    for (const path of [
      '/golf/reset-password',
      '/golf/forgot-password',
      '/golf/welcome',
      '/baseball/complete-signup',
    ]) {
      mockGetUser.mockResolvedValue({ data: { user: activeUser }, error: null });

      const res = await updateSession(buildRequest(path, freshCookie()));

      expect(res.headers.get('location'), `${path} must not redirect`).toBeNull();
    }
  });
});
