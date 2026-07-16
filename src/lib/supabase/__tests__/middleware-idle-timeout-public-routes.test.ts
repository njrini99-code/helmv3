import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Proves the idle-timeout gate is scoped to routes that actually require a
 * live session (dashboard routes + /admin), not to "any /baseball, /golf, or
 * /lifting path". Before this fix, getSportFromPath() being non-null was
 * enough to trigger the 5-minute idle-expiry bounce, which meant a
 * signed-in-but-idle visitor got redirected to /login?message=session_expired
 * off PUBLIC pages: marketing roots, the login page itself, and public
 * player/team/program/packet profiles — across all three sports. It also
 * bounced our own production crawl. See the fix-backlog finding on
 * middleware.ts:~438 (idle-timeout gate keyed on sport, not on
 * protected/dashboard routes).
 *
 * Genuinely protected routes (dashboard, /admin) must still bounce exactly
 * as before — that half of #730 is untouched and re-asserted here alongside
 * the new public-route cases.
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

describe('updateSession — idle-timeout scoped to protected routes, not public sport pages', () => {
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

  it('does NOT idle-bounce a stale session visiting /baseball/login itself', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const req = buildRequest('/baseball/login', `sb_last_activity=${staleTimestamp()}`);
    const res = await updateSession(req);

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
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
