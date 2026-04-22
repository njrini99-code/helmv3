/**
 * Tests for src/lib/auth/rate-limit.ts
 *
 * Verifies the rate limiter:
 * 1. Falls back to in-memory Map when Upstash is not configured
 * 2. Preserves the public API (allowed, remaining, resetAt, blockedUntil)
 *
 * Note: The Upstash-enabled path is integration-tested in preview deploys —
 * mocking dynamic `import()` calls to @upstash/redis and @upstash/ratelimit
 * from a singleton-state module is brittle across Vitest versions and not
 * worth the maintenance cost. The fallback paths are what break silently
 * in prod, so we exercise those instead.
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('rate-limit (in-memory fallback)', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('allows requests under the limit', async () => {
    const { checkRateLimit } = await import('@/lib/auth/rate-limit');
    const config = { maxAttempts: 3, windowMs: 60_000 };
    // Fresh identifier each test run to avoid Map bleed
    const id = `test-allow-${Date.now()}-${Math.random()}`;

    const r1 = await checkRateLimit(id, config);
    const r2 = await checkRateLimit(id, config);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r1.remaining).toBeGreaterThan(r2.remaining);
  });

  it('denies requests above the limit', async () => {
    const { checkRateLimit } = await import('@/lib/auth/rate-limit');
    const config = { maxAttempts: 2, windowMs: 60_000 };
    const id = `test-deny-${Date.now()}-${Math.random()}`;

    await checkRateLimit(id, config);
    await checkRateLimit(id, config);
    const overLimit = await checkRateLimit(id, config);

    expect(overLimit.allowed).toBe(false);
    expect(overLimit.remaining).toBe(0);
  });

  it('applies extended block when blockDurationMs is set', async () => {
    const { checkRateLimit } = await import('@/lib/auth/rate-limit');
    const config = {
      maxAttempts: 2,
      windowMs: 60_000,
      blockDurationMs: 15 * 60_000,
    };
    const id = `test-block-${Date.now()}-${Math.random()}`;

    await checkRateLimit(id, config);
    await checkRateLimit(id, config);
    const r = await checkRateLimit(id, config);

    expect(r.allowed).toBe(false);
    expect(r.blockedUntil).toBeDefined();
    expect(r.blockedUntil!).toBeGreaterThan(Date.now());
  });

  it('isolates different identifiers', async () => {
    const { checkRateLimit } = await import('@/lib/auth/rate-limit');
    const config = { maxAttempts: 2, windowMs: 60_000 };
    const a = `test-iso-a-${Date.now()}-${Math.random()}`;
    const b = `test-iso-b-${Date.now()}-${Math.random()}`;

    await checkRateLimit(a, config);
    await checkRateLimit(a, config);
    const aBlocked = await checkRateLimit(a, config);
    const bFresh = await checkRateLimit(b, config);

    expect(aBlocked.allowed).toBe(false);
    expect(bFresh.allowed).toBe(true);
  });
});
