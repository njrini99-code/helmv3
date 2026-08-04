import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

/**
 * The signup gate accepts either the global SIGNUP_ACCESS_CODE or any existing
 * team's join_code. Coaches share alphanumeric join codes ([A-Z2-9], e.g.
 * "K7PQX4MN") and players copy/paste or hand-type them, so the check must be
 * whitespace-tolerant and case-insensitive, and a real join code must be
 * accepted even when it isn't the global code. The team lookup uses the admin
 * client (mocked below) and must never throw the gate.
 *
 * B8-1: a passed gate now also records a grant cookie carrying the validated
 * code, and `verifySignupGate` re-validates that cookie from scratch — that is
 * what lets signupAction (a separate request that never sees the typed code)
 * enforce the gate server-side.
 */

// Spy-able mock of the admin client query chain:
//   admin.from('golf_teams').select('id').eq('join_code', X).limit(1).maybeSingle()
const maybeSingle = vi.fn();
const limit = vi.fn(() => ({ maybeSingle }));
const eq = vi.fn(() => ({ limit }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const createAdminClient = vi.fn(() => ({ from }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClient(),
}));

// The gate is IP-throttled (pre-auth, service-role lookup behind it), so the
// request headers and the limiter are stubbed the same way demo-access.test.ts
// stubs its public gate. The limiter allows by default; the throttled path has
// its own spec below.
//
// B2-3: the throttle is the DB-backed limiter, not the Upstash-or-in-process
// one — with no Upstash env the latter degrades to a per-serverless-instance
// Map, which bounds nothing for a distributed caller.
const checkRateLimit = vi.fn(async (_identifier: string, _config: unknown) => ({
  allowed: true,
  remaining: 9,
  resetAt: Date.now() + 60_000,
}));

// Cookie jar shared by the gate (writes the grant) and verifySignupGate (reads it).
const cookieJar = new Map<string, string>();
const cookieSet = vi.fn((name: string, value: string, _options?: unknown) => {
  cookieJar.set(name, value);
});

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map([['x-forwarded-for', '203.0.113.9']])),
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string, options?: unknown) => cookieSet(name, value, options),
  })),
}));

vi.mock('@/lib/auth/supabase-rate-limit', () => ({
  checkRateLimit: (identifier: string, config: unknown) => checkRateLimit(identifier, config),
  RATE_LIMITS: { SIGNUP: { maxAttempts: 10, windowMs: 60 * 60 * 1000 } },
}));

import { validateAccessCode } from '../access-code';
// The gate's enforcement half is a plain server module, NOT a server action —
// only validateAccessCode should ever be POST-able from a browser.
import { verifySignupGate } from '@/lib/golf/signup-gate';

const GRANT_COOKIE = 'helm_golf_signup_gate';

describe('validateAccessCode', () => {
  const original = process.env.SIGNUP_ACCESS_CODE;

  beforeEach(() => {
    // Default: the entered code matches no team.
    createAdminClient.mockImplementation(() => ({ from }));
    maybeSingle.mockResolvedValue({ data: null, error: null });
    cookieJar.clear();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SIGNUP_ACCESS_CODE;
    else process.env.SIGNUP_ACCESS_CODE = original;
    vi.clearAllMocks();
  });

  // ── global access code ──────────────────────────────────────────────────
  it('grants nothing on the global-code branch when SIGNUP_ACCESS_CODE is unset', async () => {
    // There is no committed fallback code: an unset env var disables the
    // global-code branch entirely rather than falling back to a literal that
    // ships in the repo. The team join_code path still works (specs below).
    delete process.env.SIGNUP_ACCESS_CODE;
    expect(await validateAccessCode('1881')).toBe(false);
    expect(await validateAccessCode('anything')).toBe(false);
  });

  it('accepts an alphanumeric global code', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    expect(await validateAccessCode('HELM25')).toBe(true);
  });

  it('tolerates surrounding whitespace', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    expect(await validateAccessCode('  HELM25  ')).toBe(true);
  });

  it('accepts the global code case-insensitively', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    expect(await validateAccessCode('helm25')).toBe(true);
    expect(await validateAccessCode('Helm25')).toBe(true);
  });

  it('rejects empty/blank input', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    expect(await validateAccessCode('')).toBe(false);
    expect(await validateAccessCode('   ')).toBe(false);
  });

  // ── team join code (coach-invited players) ──────────────────────────────
  it('accepts a valid team join code even when it is not the global code', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockResolvedValue({ data: { id: 'team-1' }, error: null });
    expect(await validateAccessCode('K7PQX4MN')).toBe(true);
  });

  it('looks up the join code upper-cased and trimmed', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockResolvedValue({ data: { id: 'team-1' }, error: null });
    await validateAccessCode('  k7pqx4mn  ');
    expect(eq).toHaveBeenCalledWith('join_code', 'K7PQX4MN');
  });

  it('rejects a code matching neither the global code nor any team', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await validateAccessCode('ZZZZZZZZ')).toBe(false);
  });

  it('never throws the gate when the team lookup fails (returns false)', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockRejectedValue(new Error('service role unavailable'));
    expect(await validateAccessCode('K7PQX4MN')).toBe(false);
  });

  it('still accepts the global code when the team lookup would fail', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockRejectedValue(new Error('service role unavailable'));
    expect(await validateAccessCode('HELM25')).toBe(true);
  });

  // ── IP throttle ─────────────────────────────────────────────────────────
  it('refuses (and never reaches the join_code lookup) when the IP is throttled', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
    expect(await validateAccessCode('HELM25')).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('keys the throttle by client IP', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    await validateAccessCode('HELM25');
    expect(checkRateLimit).toHaveBeenCalledWith('signup:gate:203.0.113.9', expect.anything());
  });

  // ── B8-1 grant cookie ───────────────────────────────────────────────────
  it('records an httpOnly grant cookie carrying the validated code', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    expect(await validateAccessCode('  helm25 ')).toBe(true);
    expect(cookieSet).toHaveBeenCalledWith(
      GRANT_COOKIE,
      'helm25',
      expect.objectContaining({ httpOnly: true, path: '/', sameSite: 'lax' }),
    );
  });

  it('records no grant when the code is rejected', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await validateAccessCode('ZZZZZZZZ')).toBe(false);
    expect(cookieSet).not.toHaveBeenCalled();
  });
});

describe('verifySignupGate', () => {
  const original = process.env.SIGNUP_ACCESS_CODE;

  beforeEach(() => {
    createAdminClient.mockImplementation(() => ({ from }));
    maybeSingle.mockResolvedValue({ data: null, error: null });
    cookieJar.clear();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SIGNUP_ACCESS_CODE;
    else process.env.SIGNUP_ACCESS_CODE = original;
    vi.clearAllMocks();
  });

  it('is false when no grant cookie exists (a direct POST to signupAction)', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    expect(await verifySignupGate()).toEqual({ passed: false, teamJoinCode: null });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('accepts a grant carrying the global access code, and carries NO team code', async () => {
    // The global code identifies no team, so there is nothing to auto-join.
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    cookieJar.set(GRANT_COOKIE, 'HELM25');
    expect(await verifySignupGate()).toEqual({ passed: true, teamJoinCode: null });
  });

  it('accepts a grant carrying a live team join code AND hands that code back', async () => {
    // This is what lets a player who signed up with their coach's code land on
    // that coach's roster: signupAction forwards it as ?joinCode=.
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockResolvedValue({ data: { id: 'team-1' }, error: null });
    cookieJar.set(GRANT_COOKIE, 'K7PQX4MN');
    expect(await verifySignupGate()).toEqual({ passed: true, teamJoinCode: 'K7PQX4MN' });
    expect(eq).toHaveBeenCalledWith('join_code', 'K7PQX4MN');
  });

  it('re-validates rather than trusting the cookie: a stale code is refused', async () => {
    // Same cookie a player got a week ago, but their team's join_code has
    // since rotated and the global code changed.
    process.env.SIGNUP_ACCESS_CODE = 'HELM26';
    maybeSingle.mockResolvedValue({ data: null, error: null });
    cookieJar.set(GRANT_COOKIE, 'HELM25');
    expect(await verifySignupGate()).toEqual({ passed: false, teamJoinCode: null });
  });

  it('is false when the verify throttle trips, without a join_code lookup', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    cookieJar.set(GRANT_COOKIE, 'K7PQX4MN');
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
    expect(await verifySignupGate()).toEqual({ passed: false, teamJoinCode: null });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('throttles on its own key so signup does not spend the interactive gate budget', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    cookieJar.set(GRANT_COOKIE, 'HELM25');
    await verifySignupGate();
    expect(checkRateLimit).toHaveBeenCalledWith('signup:gate:verify:203.0.113.9', expect.anything());
  });

  it('round-trips a gate pass into a verified signup grant', async () => {
    // The whole point of B8-1: the code a player typed at the gate is what
    // signupAction re-checks one request later.
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockResolvedValue({ data: { id: 'team-1' }, error: null });
    expect(await validateAccessCode('k7pqx4mn')).toBe(true);
    // Typed lowercase at the gate; normalized before it is carried onward, so
    // onboarding resolves the same team either way.
    expect(await verifySignupGate()).toEqual({ passed: true, teamJoinCode: 'K7PQX4MN' });
  });
});
