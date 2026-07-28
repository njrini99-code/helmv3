import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * `evaluateAdminGate` guards `/admin` and `/admin/*` only (isAdminPath), so the
 * SPORT-scoped admin sub-apps — `/golf/admin/*`, `/baseball/admin/*` — were not
 * protected routes: an anonymous request was SERVED, 200, and the route's own
 * layout was the only gate.
 *
 * That layout gate cannot work. `src/app/golf/admin/loading.tsx` opens a
 * Suspense boundary, so the shell has flushed by the time the layout's async
 * auth check resolves and its `redirect('/golf/login')` throws — too late for an
 * HTTP redirect. React reports "Switched to client rendering because the server
 * rendering errored" and our boundary files it as an incident. Measured against
 * a real dev server: anonymous GET /golf/admin/crm returned 200 with that error
 * and `at AdminLayout` in the payload; with this gate it returns 307 to
 * /golf/login.
 *
 * One expired session on 2026-07-20 produced ten admin_events rows across four
 * classes in four seconds (2× RSC render error, 4× Unauthorized server action,
 * 1× crm_coaches RLS denial, 1× unhandledrejection). Bouncing at the edge means
 * none of that code runs.
 */

const mockGetUser = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(),
  })),
}));

import { updateSession } from '@/lib/supabase/middleware';

function anonymousRequest(pathAndQuery: string) {
  return new NextRequest(`https://app.example.com${pathAndQuery}`, {
    headers: new Headers({ 'user-agent': 'Mozilla/5.0 (test)' }),
  });
}

describe('updateSession — sport-scoped admin routes require auth', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    // No session, exactly as on 2026-07-20 after the idle gate signed the admin out.
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://xyz.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPER_ADMIN_USER_IDS', 'admin-1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('bounces an anonymous request to the golf admin CRM before it can render', async () => {
    const res = await updateSession(anonymousRequest('/golf/admin/crm?tab=outreach'));

    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    const url = new URL(location!);
    expect(url.pathname).toBe('/golf/login');
    expect(url.searchParams.get('returnTo')).toBe('/golf/admin/crm');
  });

  it('bounces an anonymous request to a baseball admin route to the baseball login', async () => {
    const res = await updateSession(anonymousRequest('/baseball/admin/demo-sessions'));

    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    const url = new URL(location!);
    expect(url.pathname).toBe('/baseball/login');
    expect(url.searchParams.get('returnTo')).toBe('/baseball/admin/demo-sessions');
  });

  it('still bounces the dashboard routes it already covered', async () => {
    for (const [path, login] of [
      ['/golf/dashboard', '/golf/login'],
      ['/baseball/dashboard', '/baseball/login'],
      ['/lifting/dashboard', '/lifting/login'],
    ] as const) {
      const res = await updateSession(anonymousRequest(path));
      const location = res.headers.get('location');
      expect(location, path).not.toBeNull();
      expect(new URL(location!).pathname, path).toBe(login);
    }
  });

  it('does not bounce an AUTHENTICATED request — role checks stay with the page and RLS', async () => {
    // This gate is the `!user` check only, NOT the SUPER_ADMIN_USER_IDS
    // allowlist: /golf/admin authorizes on `users.role === 'admin'`, so
    // routing it through the allowlist would lock out legitimate admins.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'not-on-allowlist' } }, error: null });

    const res = await updateSession(anonymousRequest('/golf/admin/crm'));

    expect(res.headers.get('location')).toBeNull();
  });

  it('leaves the login page itself reachable, so there is no redirect loop', async () => {
    const res = await updateSession(anonymousRequest('/golf/login?returnTo=%2Fgolf%2Fadmin%2Fcrm'));

    expect(res.headers.get('location')).toBeNull();
  });
});
