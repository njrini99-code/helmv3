import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Proves the idle-timeout gate fires on every genuinely authenticated
 * surface (dashboard routes, /admin, AND every other authenticated,
 * non-public route under a sport prefix) while staying off truly public
 * shapes: marketing roots, (auth) login/signup/reset flows, and
 * BaseballHelm's (public) player/team/program/packet profile groups.
 *
 * History: the gate originally keyed on getSportFromPath() being non-null
 * ("any /baseball, /golf, or /lifting path"), which meant a
 * signed-in-but-idle visitor got redirected to /login?message=session_expired
 * off PUBLIC pages too — marketing roots, login itself, public profiles. A
 * first fix over-corrected by narrowing the gate to isDashboardRoute
 * (dashboard routes only), which silently exempted BaseballHelm's entire
 * (player-dashboard) route group — /baseball/player/{today,practice,
 * timeline,passport}, PLAYER_HOME — and /baseball/admin/demo-sessions from
 * idle-reauth entirely, reintroducing the #730 shared-device exposure for
 * players (see #872 fix-backlog). The current gate is
 * `(sport || onAdminPath) && !isPublicRoute(pathname, sport)`: broad by
 * default, narrowed only by an explicit public-route allowlist.
 *
 * `/baseball/player/today` and `/baseball/player/some-public-player-id`
 * share the exact same URL prefix but resolve to different route groups —
 * (player-dashboard) vs. (public) — and must be asserted as opposite cases
 * below; that pair is the crux of the regression this suite guards against.
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

function buildRequest(pathname: string, cookieHeader?: string) {
  const headers = new Headers({ 'user-agent': 'Mozilla/5.0 (test)' });
  if (cookieHeader) headers.set('cookie', cookieHeader);
  return new NextRequest(`https://app.example.com${pathname}`, { headers });
}

describe('updateSession — idle-timeout fires on all authenticated surfaces except public routes', () => {
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

  const staleTimestamp = () => Date.now() - 10 * 60 * 1000; // 10 min ago > 5 min window

  it('does NOT idle-bounce a stale session visiting the /baseball marketing root', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const req = buildRequest('/baseball', `sb_last_activity=${staleTimestamp()}`);
    const res = await updateSession(req);

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
  });

  it('does NOT idle-bounce a stale session visiting the /golf marketing root', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const req = buildRequest('/golf', `sb_last_activity=${staleTimestamp()}`);
    const res = await updateSession(req);

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
  });

  it('does NOT idle-bounce a stale session visiting a public /baseball/player/<id> profile', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const req = buildRequest('/baseball/player/some-public-player-id', `sb_last_activity=${staleTimestamp()}`);
    const res = await updateSession(req);

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
  });

  it('does NOT idle-bounce a stale session visiting a public /baseball/player/<uuid> profile', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const req = buildRequest(
      '/baseball/player/3f2c1a90-8b7d-4e5f-9c1a-1234567890ab',
      `sb_last_activity=${staleTimestamp()}`,
    );
    const res = await updateSession(req);

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
  });

  it('does NOT idle-bounce a stale session visiting /golf/signup or /lifting/login ((auth) route groups)', async () => {
    for (const pathname of ['/golf/signup', '/lifting/login']) {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

      const req = buildRequest(pathname, `sb_last_activity=${staleTimestamp()}`);
      const res = await updateSession(req);

      expect(mockSignOut).not.toHaveBeenCalled();
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('does NOT idle-bounce a stale session visiting /baseball/login itself', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const req = buildRequest('/baseball/login', `sb_last_activity=${staleTimestamp()}`);
    const res = await updateSession(req);

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
  });

  it('still idle-bounces a stale session off /baseball/player/today — the private player app, NOT the public profile route (#872 regression)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const req = buildRequest('/baseball/player/today', `sb_last_activity=${staleTimestamp()}`);
    const res = await updateSession(req);

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    const url = new URL(location!);
    expect(url.pathname).toBe('/baseball/login');
    expect(url.searchParams.get('message')).toBe('session_expired');
    expect(url.searchParams.get('returnTo')).toBe('/baseball/player/today');
  });

  it('still idle-bounces a stale session off /baseball/player/practice (player-dashboard route group)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const req = buildRequest('/baseball/player/practice', `sb_last_activity=${staleTimestamp()}`);
    const res = await updateSession(req);

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    const url = new URL(res.headers.get('location')!);
    expect(url.pathname).toBe('/baseball/login');
    expect(url.searchParams.get('returnTo')).toBe('/baseball/player/practice');
  });

  it('still idle-bounces a stale session off /baseball/player/timeline and /baseball/player/passport (player-dashboard route group)', async () => {
    for (const pathname of ['/baseball/player/timeline', '/baseball/player/passport']) {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockSignOut.mockResolvedValue({ error: null });

      const req = buildRequest(pathname, `sb_last_activity=${staleTimestamp()}`);
      const res = await updateSession(req);

      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
      const url = new URL(res.headers.get('location')!);
      expect(url.pathname).toBe('/baseball/login');
      expect(url.searchParams.get('returnTo')).toBe(pathname);
    }
  });

  it('does NOT idle-bounce a stale session visiting a public /baseball/team/<id> or /baseball/program/<id> profile', async () => {
    for (const pathname of ['/baseball/team/some-public-team-id', '/baseball/program/some-public-program-id']) {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

      const req = buildRequest(pathname, `sb_last_activity=${staleTimestamp()}`);
      const res = await updateSession(req);

      expect(mockSignOut).not.toHaveBeenCalled();
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('does NOT idle-bounce a stale session visiting a public /baseball/packet/<token> report', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const req = buildRequest('/baseball/packet/some-share-token', `sb_last_activity=${staleTimestamp()}`);
    const res = await updateSession(req);

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
  });

  it('still idle-bounces a stale session off /baseball/admin/demo-sessions (authenticated, non-dashboard-prefixed)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const req = buildRequest('/baseball/admin/demo-sessions', `sb_last_activity=${staleTimestamp()}`);
    const res = await updateSession(req);

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    const url = new URL(res.headers.get('location')!);
    expect(url.pathname).toBe('/baseball/login');
    expect(url.searchParams.get('returnTo')).toBe('/baseball/admin/demo-sessions');
  });

  it('still idle-bounces a stale session off a genuinely protected dashboard route (#730 preserved)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const req = buildRequest('/baseball/dashboard/roster', `sb_last_activity=${staleTimestamp()}`);
    const res = await updateSession(req);

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    const url = new URL(location!);
    expect(url.pathname).toBe('/baseball/login');
    expect(url.searchParams.get('message')).toBe('session_expired');
    expect(url.searchParams.get('returnTo')).toBe('/baseball/dashboard/roster');
  });

  it('still idle-bounces a stale session off /admin (#730 preserved)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const req = buildRequest('/admin/errors', `sb_last_activity=${staleTimestamp()}`);
    const res = await updateSession(req);

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    const url = new URL(location!);
    expect(url.pathname).toBe('/golf/login');
    expect(url.searchParams.get('message')).toBe('session_expired');
  });

  it('does not bootstrap the idle marker for a fresh visit to a public /baseball page', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const req = buildRequest('/baseball'); // no sb_last_activity cookie at all
    const res = await updateSession(req);

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
    // Public routes are out of scope for this gate entirely — no marker write.
    expect(res.cookies.get('sb_last_activity')).toBeUndefined();
  });
});
