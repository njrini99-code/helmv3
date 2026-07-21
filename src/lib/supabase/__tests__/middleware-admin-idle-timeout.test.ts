import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Proves the #730 idle-session timeout (5 minutes) now also applies to
 * /admin — previously getSportFromPath('/admin') === null skipped the
 * entire idle-expiry block, so a genuinely idle super-admin tab was never
 * force-signed-out (see fix-backlog finding on middleware.ts:406).
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

describe('updateSession — /admin idle timeout (#730 coverage)', () => {
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

  it('signs out and redirects a genuinely idle super admin off /admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    const staleTimestamp = Date.now() - 9 * 60 * 60 * 1000; // 9h ago > 8h window
    const req = buildRequest('/admin/errors', `sb_last_activity=${staleTimestamp}`);

    const res = await updateSession(req);

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    const url = new URL(location!);
    expect(url.pathname).toBe('/golf/login');
    expect(url.searchParams.get('message')).toBe('session_expired');
    expect(url.searchParams.get('returnTo')).toBe('/admin/errors');
  });

  it('does not idle-timeout a super admin whose session activity is within the window', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });

    const freshTimestamp = Date.now() - 60 * 1000; // 1 min ago, inside work-session window
    const req = buildRequest('/admin', `sb_last_activity=${freshTimestamp}`);

    const res = await updateSession(req);

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
  });

  it('bootstraps the activity marker on a fresh /admin visit instead of treating it as idle', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });

    const req = buildRequest('/admin'); // no sb_last_activity cookie at all

    const res = await updateSession(req);

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
    expect(res.cookies.get('sb_last_activity')?.value).toBeTruthy();
  });
});
