// =============================================================================
// src/test/proxy-middleware.test.ts
//
// Ports the root-middleware.test.ts contract onto src/proxy.ts — the file
// Next.js actually compiles. With appDir at src/app, Next's middleware/proxy
// scan root is src/, so the old repo-root middleware.ts was never detected or
// built: its fail-closed behavior existed only on paper while the live
// src/proxy.ts failed OPEN on every error, including the deploy-time Supabase
// env-misconfiguration guard-throw. That root file is now deleted and its
// contract lives here, against the code that really runs.
//
// Locks in:
//   1. Config errors (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY missing) fail CLOSED
//      (500) and are captured to Sentry at 'fatal'.
//   2. Any other (genuinely transient) error still fails OPEN
//      (NextResponse.next()) but IS captured to Sentry at 'warning'.
//   3. Stale-refresh-token errors are normal logged-out churn: fail open,
//      no Sentry capture.
//   4. The success path is unaffected — whatever updateSession returns passes
//      straight through.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const updateSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/middleware', () => ({ updateSession }));

const captureException = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({ captureException }));

import { proxy } from '@/proxy';

function buildRequest() {
  return new NextRequest('https://app.example.com/baseball/dashboard/command-center');
}

describe('src/proxy.ts — updateSession error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes through whatever updateSession returns on success', async () => {
    const success = NextResponse.next();
    updateSession.mockResolvedValueOnce(success);

    const result = await proxy(buildRequest());

    expect(result).toBe(success);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('fails CLOSED (500) + captures at "fatal" for the Supabase env-misconfiguration error', async () => {
    updateSession.mockRejectedValueOnce(
      new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder. Check Vercel env.'),
    );

    const result = await proxy(buildRequest());

    expect(result.status).toBe(500);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ level: 'fatal', tags: { middleware_failure: 'config' } }),
    );
  });

  it('fails CLOSED (500) for the missing-anon-key variant of the config error too', async () => {
    updateSession.mockRejectedValueOnce(
      new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Check Vercel env.'),
    );

    const result = await proxy(buildRequest());

    expect(result.status).toBe(500);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ level: 'fatal' }),
    );
  });

  it('fails OPEN for a genuinely transient error, but captures it to Sentry at "warning"', async () => {
    updateSession.mockRejectedValueOnce(new Error('fetch failed: network blip'));

    const result = await proxy(buildRequest());

    // Fail-open means NextResponse.next() — a 2xx pass-through, not a 500.
    expect(result.status).toBe(200);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ level: 'warning', tags: { middleware_failure: 'transient' } }),
    );
  });

  it('fails OPEN for stale-refresh-token errors WITHOUT a Sentry capture', async () => {
    updateSession.mockRejectedValueOnce(
      new Error('Invalid Refresh Token: Refresh Token Not Found'),
    );

    const result = await proxy(buildRequest());

    expect(result.status).toBe(200);
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe('src/proxy.ts — native user agent: marketing redirect vs app-shell resources', () => {
  const NATIVE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 HelmSportsLabsApp';
  const nativeRequest = (path: string) =>
    new NextRequest(`https://app.example.com${path}`, { headers: { 'user-agent': NATIVE_UA } });

  beforeEach(() => {
    vi.clearAllMocks();
    updateSession.mockResolvedValue(NextResponse.next());
  });

  it('still sends a native request for a marketing page to the golf sign-in', async () => {
    const result = await proxy(nativeRequest('/products'));
    expect(result.status).toBe(307);
    expect(result.headers.get('location')).toBe('https://app.example.com/golf/login');
  });

  it.each(['/sw.js', '/manifest.json', '/offline.html', '/monitoring', '/icons/icon-192.png', '/fonts/inter.woff2'])(
    'lets the native web view load %s (a redirected service worker or manifest is dropped by WebKit)',
    async (path) => {
      const result = await proxy(nativeRequest(path));
      expect(result.status).not.toBe(307);
      expect(updateSession).toHaveBeenCalledTimes(1);
    },
  );
});
