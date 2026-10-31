import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * The proxy lets /api/ping past updateSession. Every other path, /api/health
 * included, still gets the session refresh and its auth check.
 */
const updateSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/middleware', () => ({ updateSession }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { proxy } from '@/proxy';

const NATIVE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 HelmSportsLabsApp';

describe('src/proxy.ts — the liveness probe skips session work', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSession.mockResolvedValue(NextResponse.next());
  });

  it('passes /api/ping straight through without calling updateSession', async () => {
    const result = await proxy(new NextRequest('https://app.example.com/api/ping', { method: 'HEAD' }));

    expect(result.status).toBe(200);
    expect(result.headers.get('location')).toBeNull();
    expect(updateSession).not.toHaveBeenCalled();
  });

  it('does the same for the native app, with no marketing redirect', async () => {
    const result = await proxy(
      new NextRequest('https://app.example.com/api/ping', { headers: { 'user-agent': NATIVE_UA } }),
    );

    expect(result.status).toBe(200);
    expect(updateSession).not.toHaveBeenCalled();
  });

  it.each(['/api/health', '/api/pings', '/api/ping/extra', '/golf/dashboard'])(
    'still runs updateSession for %s',
    async (path) => {
      await proxy(new NextRequest(`https://app.example.com${path}`));

      expect(updateSession).toHaveBeenCalledTimes(1);
    },
  );
});
