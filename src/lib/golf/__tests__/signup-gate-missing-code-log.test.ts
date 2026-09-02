import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * #1566 — `SIGNUP_ACCESS_CODE` unset is the PERMANENT intended configuration
 * (owner-confirmed 2026-08-21: join-code-only signup by design, shared code
 * deliberately retired 2026-08-04). This pins the two things that keep that
 * fact from becoming incident noise:
 *
 *   1. Severity is 'info', not 'critical' — already fixed 2026-08-05
 *      (ea6ad417f, #1290: 17 critical rows filed before that commit, 0 since,
 *      confirmed against production `admin_events` 2026-08-21).
 *   2. The warning fires AT MOST ONCE PER PROCESS, not once per signup
 *      attempt — the module-level `warnedMissingAccessCode` flag in
 *      `signup-gate.ts`, the same once-per-warm-instance idiom already used
 *      by other startup/config-drift checks in this codebase.
 *
 * (2) was correct in the code but had no test — this file is that test.
 * `admin_events` still shows ~50 'info' rows across 15 days: that is
 * once-per-process working exactly as designed under Vercel's serverless
 * scale-out (a fresh instance's module state starts unwarned, logs once,
 * then falls silent for that instance's lifetime) — it is not a bug, and
 * this test does not assert against it. Only a cross-instance store (a DB
 * sentinel row, a KV flag) could produce a single log EVER across the whole
 * fleet, which is a materially bigger change than what #1566 asks for.
 */

const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map([['x-forwarded-for', '203.0.113.9']])),
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const v = cookieJar.get(name);
      return v === undefined ? undefined : { name, value: v };
    },
    set: (name: string, value: string) => void cookieJar.set(name, value),
  })),
}));

const allow = { allowed: true, remaining: 9, resetAt: Date.now() + 60_000 };
vi.mock('@/lib/auth/supabase-rate-limit', () => ({
  checkRateLimit: vi.fn(async () => allow),
  RATE_LIMITS: { SIGNUP: { maxAttempts: 10, windowMs: 3_600_000 } },
}));

const { logServerEvent } = vi.hoisted(() => ({ logServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
  logServerEvent,
}));

// No rows in either table — every candidate below resolves to 'none', which
// is irrelevant to what this test checks: `classifySignupCodeDetailed` calls
// `warnMissingAccessCodeOnce()` before it ever looks at a team/staff table,
// so the warning fires (subject to the once-per-process gate) regardless of
// whether the candidate later matches anything.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    }),
  }),
}));

describe('signup gate — SIGNUP_ACCESS_CODE-unset warning fires at most once per process (#1566)', () => {
  const originalAccess = process.env.SIGNUP_ACCESS_CODE;

  // The flag under test (`warnedMissingAccessCode` in signup-gate.ts) is
  // module-level state that is SUPPOSED to survive across calls within one
  // process — that is the whole point of "once per process". So each test
  // below needs its OWN fresh module instance (vi.resetModules() + a dynamic
  // re-import), or the second test would inherit the first test's already-
  // tripped flag and silently prove nothing.
  beforeEach(() => {
    cookieJar.clear();
    logServerEvent.mockClear();
    delete process.env.SIGNUP_ACCESS_CODE;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalAccess === undefined) delete process.env.SIGNUP_ACCESS_CODE;
    else process.env.SIGNUP_ACCESS_CODE = originalAccess;
  });

  it('two consecutive validate calls with the var unset produce at most one log call', async () => {
    const { grantSignupAccessDetailed } = await import('../signup-gate');

    await grantSignupAccessDetailed('first-attempt');
    await grantSignupAccessDetailed('second-attempt');

    expect(logServerEvent).toHaveBeenCalledTimes(1);
    expect(logServerEvent).toHaveBeenCalledWith(
      expect.stringContaining('by design'),
      expect.objectContaining({ action: 'access-code.validateAccessCode' }),
    );
  });

  it('stays quiet on the third, fourth, and fifth attempt too — not a leaky "warn every N"', async () => {
    const { grantSignupAccessDetailed } = await import('../signup-gate');

    for (let i = 0; i < 5; i++) {
      await grantSignupAccessDetailed(`attempt-${i}`);
    }

    expect(logServerEvent).toHaveBeenCalledTimes(1);
  });

  it('logs at INFO severity, never critical/error — the actual #1566 fix (ea6ad417f, 2026-08-05)', async () => {
    const { grantSignupAccessDetailed } = await import('../signup-gate');

    await grantSignupAccessDetailed('any-code');

    expect(logServerEvent).toHaveBeenCalledTimes(1);
    // logServerEvent's own default severity is 'info' (server-error-logger.ts);
    // the call site here passes no third argument, so it never overrides that
    // default up to 'critical'. Asserting the call shape (2 args) pins that.
    expect(logServerEvent.mock.calls[0]).toHaveLength(2);
  });
});
