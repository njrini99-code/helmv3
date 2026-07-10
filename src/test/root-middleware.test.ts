// =============================================================================
// src/test/root-middleware.test.ts
//
// P1 (Production-Readiness Mission W0a) — root middleware.ts previously
// swallowed EVERY updateSession error with a bare console.warn + fail-open
// (NextResponse.next()). That included the deploy-time Supabase
// env-misconfiguration guard-throw in src/lib/supabase/middleware.ts, which
// meant a missing/placeholder NEXT_PUBLIC_SUPABASE_* env var would silently
// disable every auth/authorization check in the app instead of failing loudly.
//
// Locks in:
//   1. Config errors (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY missing) fail CLOSED
//      (500) and are captured to Sentry at 'fatal'.
//   2. Any other (genuinely transient) error still fails OPEN
//      (NextResponse.next()) but IS now captured to Sentry at 'warning'
//      (previously invisible — only a console.warn).
//   3. The success path is unaffected — whatever updateSession returns passes
//      straight through.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const updateSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/middleware', () => ({ updateSession }));

const captureException = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({ captureException }));

import { middleware } from '../../middleware';

function buildRequest() {
  return new NextRequest('https://app.example.com/baseball/dashboard/command-center');
}

describe('root middleware.ts — updateSession error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes through whatever updateSession returns on success', async () => {
    const success = NextResponse.next();
    updateSession.mockResolvedValueOnce(success);

    const result = await middleware(buildRequest());

    expect(result).toBe(success);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('fails CLOSED (500) + captures at "fatal" for the Supabase env-misconfiguration error', async () => {
    updateSession.mockRejectedValueOnce(
      new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder. Check Vercel env.'),
    );

    const result = await middleware(buildRequest());

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

    const result = await middleware(buildRequest());

    expect(result.status).toBe(500);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ level: 'fatal' }),
    );
  });

  it('fails OPEN for a genuinely transient error, but now captures it to Sentry at "warning"', async () => {
    updateSession.mockRejectedValueOnce(new Error('fetch failed: network blip'));

    const result = await middleware(buildRequest());

    // Fail-open means NextResponse.next() — a 2xx pass-through, not a 500.
    expect(result.status).toBe(200);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ level: 'warning', tags: { middleware_failure: 'transient' } }),
    );
  });
});
