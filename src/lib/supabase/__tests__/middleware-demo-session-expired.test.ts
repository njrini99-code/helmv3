import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * #918 — an idle-expired DEMO session has nowhere to "sign in again" (the
 * visitor never had a password), so /login is a dead end for it. The
 * idle-timeout redirect must detect a demo-context session (via
 * `user_metadata.is_demo`, or an email-match fallback for a session
 * established before this fix shipped) and route back to the sport's own
 * /demo gate with a friendly `message=demo_session_expired` instead.
 *
 * A NON-demo idle-expired session must be completely unaffected — still
 * routes to /login?message=session_expired&returnTo=... exactly as before.
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

// Demo sessions get the LONGER 30-min idle window (DEMO_SESSION_IDLE_TIMEOUT_MS)
// — 35 min ago is stale for demo and non-demo alike.
const STALE = Date.now() - 35 * 60 * 1000;

describe('updateSession — demo-context idle-timeout redirect (#918)', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue({ error: null });
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://xyz.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('DEMO_COACH_EMAIL', 'demo@golfhelmdemo.com');
    vi.stubEnv('DEMO_COACH_PASSWORD', 'irrelevant-for-this-test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('routes an idle-expired golf demo session (is_demo metadata) back to /golf/demo, not /golf/login', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'demo-1', email: 'demo@golfhelmdemo.com', user_metadata: { is_demo: true } } },
      error: null,
    });

    const req = buildRequest('/golf/dashboard', `sb_last_activity=${STALE}`);
    const res = await updateSession(req);

    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    const url = new URL(location!);
    expect(url.pathname).toBe('/golf/demo');
    expect(url.searchParams.get('message')).toBe('demo_session_expired');
    expect(url.searchParams.get('returnTo')).toBeNull();
    expect(url.pathname).not.toBe('/golf/login');
  });

  it('falls back to an email match for a demo session established before is_demo metadata shipped', async () => {
    // No user_metadata.is_demo at all — only the email matches the
    // server-only demo credentials (a session that pre-dates the fix).
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'demo-1', email: 'demo@golfhelmdemo.com', user_metadata: {} } },
      error: null,
    });

    const req = buildRequest('/golf/dashboard', `sb_last_activity=${STALE}`);
    const res = await updateSession(req);

    const url = new URL(res.headers.get('location')!);
    expect(url.pathname).toBe('/golf/demo');
    expect(url.searchParams.get('message')).toBe('demo_session_expired');
  });

  it('routes an idle-expired baseball demo session back to /baseball/demo', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'demo-2',
          email: 'demo-coach@baseballhelmdemo.com',
          user_metadata: { is_demo: true },
        },
      },
      error: null,
    });

    const req = buildRequest('/baseball/dashboard/command-center', `sb_last_activity=${STALE}`);
    const res = await updateSession(req);

    const url = new URL(res.headers.get('location')!);
    expect(url.pathname).toBe('/baseball/demo');
    expect(url.searchParams.get('message')).toBe('demo_session_expired');
  });

  it('leaves a NON-demo idle-expired session on the normal /login redirect unchanged', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'real-coach-1', email: 'coach@university.edu', user_metadata: {} } },
      error: null,
    });

    const req = buildRequest('/golf/dashboard', `sb_last_activity=${STALE}`);
    const res = await updateSession(req);

    const url = new URL(res.headers.get('location')!);
    expect(url.pathname).toBe('/golf/login');
    expect(url.searchParams.get('message')).toBe('session_expired');
    expect(url.searchParams.get('returnTo')).toBe('/golf/dashboard');
  });

  it('a demo session idle 10 min is INSIDE the 30-min demo window — no bounce', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'demo-1', email: 'demo@golfhelmdemo.com', user_metadata: { is_demo: true } } },
      error: null,
    });

    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const req = buildRequest('/golf/dashboard', `sb_last_activity=${tenMinAgo}`);
    const res = await updateSession(req);

    // Passes through (no idle redirect) — 10 min stale would bounce a
    // regular user (5-min window) but not a demo visitor (30-min window).
    expect(res.headers.get('location')).toBeNull();
  });

  it('a REGULAR user idle 10 min still bounces (5-min window unchanged)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'real-coach-3', email: 'coach@university.edu', user_metadata: {} } },
      error: null,
    });

    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const req = buildRequest('/golf/dashboard', `sb_last_activity=${tenMinAgo}`);
    const res = await updateSession(req);

    const url = new URL(res.headers.get('location')!);
    expect(url.pathname).toBe('/golf/login');
    expect(url.searchParams.get('message')).toBe('session_expired');
  });

  it('a real user whose metadata happens to hold is_demo: false is NOT treated as demo', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'real-coach-2', email: 'coach@university.edu', user_metadata: { is_demo: false } } },
      error: null,
    });

    const req = buildRequest('/golf/dashboard', `sb_last_activity=${STALE}`);
    const res = await updateSession(req);

    const url = new URL(res.headers.get('location')!);
    expect(url.pathname).toBe('/golf/login');
  });
});
