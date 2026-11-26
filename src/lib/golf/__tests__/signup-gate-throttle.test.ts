/**
 * @vitest-environment node
 *
 * The throttle in front of the signup code check, keyed on (IP, code) instead of IP alone. A roster signs up together from
 * one campus network, so the same code from one IP has a roster-sized budget; trying many DIFFERENT codes from one IP is
 * still bounded at ten an hour. The limiter here counts like the real one (count per key, remaining = max - count).
 * Owner-delegated default, 2026-11-24.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const counts = new Map<string, number>();
const blocked = new Map<string, number>();
let vercelIp: string | null = null;
let forwarded = '203.0.113.9';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map<string, string>([['x-forwarded-for', forwarded], ...(vercelIp ? ([['x-vercel-forwarded-for', vercelIp]] as Array<[string, string]>) : [])])),
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => {} })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  // Every code names a team, so only the throttle can refuse.
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 't1', name: 'Men’s Golf' }, error: null }) }) }) }) }) }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}), logServerEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/auth/supabase-rate-limit', async () => {
  const real = await vi.importActual<typeof import('@/lib/auth/supabase-rate-limit')>('@/lib/auth/supabase-rate-limit');
  return {
    RATE_LIMITS: real.RATE_LIMITS,
    // Counts like check_rate_limit_atomic: increment, stamp a block once past the max when a block is asked for, and a
    // standing block refuses whatever the config says.
    checkRateLimit: vi.fn(async (key: string, cfg: { maxAttempts: number; blockDurationMs?: number }) => {
      if ((blocked.get(key) ?? 0) > Date.now()) return { allowed: false, remaining: 0, resetAt: Date.now() + 3_600_000 };
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      if (cfg.blockDurationMs && n > cfg.maxAttempts) blocked.set(key, Date.now() + cfg.blockDurationMs);
      return { allowed: n <= cfg.maxAttempts, remaining: Math.max(0, cfg.maxAttempts - n), resetAt: Date.now() + 3_600_000 };
    }),
  };
});

import { RATE_LIMITS } from '@/lib/auth/supabase-rate-limit';
import { RATE_LIMITS as GOLF_LIMITS } from '@/lib/auth/rate-limit';
import { grantSignupAccessDetailed } from '../signup-gate';

beforeEach(() => {
  counts.clear();
  blocked.clear();
  forwarded = '203.0.113.9';
  vercelIp = null;
});

describe('a roster on one network', () => {
  it('15 different players with the same code from one IP all pass', async () => {
    for (let i = 0; i < 15; i++) {
      expect((await grantSignupAccessDetailed('K7PQX4MN')).granted).toBe(true);
    }
  });

  it('the code as people write it is one code: any case, spaces, dashes', async () => {
    for (const typed of ['k7pqx4mn', 'K7PQ-X4MN', ' k7pq x4mn ']) {
      expect((await grantSignupAccessDetailed(typed)).granted).toBe(true);
    }
    // One distinct code spent one slot of the guessing budget.
    expect(counts.get('signup:gate:codes:203.0.113.9')).toBe(1);
  });

  it('both of a coach’s two codes work from the same network', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await grantSignupAccessDetailed(i % 2 ? 'MENS2345' : 'WOMENS99')).granted).toBe(true);
    }
  });
});

describe('guessing is still bounded', () => {
  it('the 11th different code from one IP in the window is refused (and reads as no match)', async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 12; i++) {
      results.push((await grantSignupAccessDetailed(`CODE${String(i).padStart(4, '0')}`)).granted);
    }
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results.slice(10)).toEqual([false, false]);
    // Asking again about a refused code is not a free second try.
    expect(await grantSignupAccessDetailed('CODE0011')).toEqual({ granted: false, kind: 'none', teamName: null });
    expect(await grantSignupAccessDetailed('CODE0010')).toEqual({ granted: false, kind: 'none', teamName: null });
  });

  it('one code hammered from one IP stops at its own budget', async () => {
    const max = RATE_LIMITS.SIGNUP_SAME_CODE.maxAttempts;
    for (let i = 0; i < max; i++) await grantSignupAccessDetailed('K7PQX4MN');
    expect((await grantSignupAccessDetailed('K7PQX4MN')).granted).toBe(false);
  });

  it('another network is not affected', async () => {
    for (let i = 0; i < 12; i++) await grantSignupAccessDetailed(`CODE${String(i).padStart(4, '0')}`);
    forwarded = '198.51.100.7';
    expect((await grantSignupAccessDetailed('K7PQX4MN')).granted).toBe(true);
  });
});

describe('the budgets', () => {
  it('account creation is 60 an hour per IP; the guessing budget is unchanged at 10', () => {
    expect(GOLF_LIMITS.GOLF_SIGNUP).toMatchObject({ maxAttempts: 60, windowMs: 3_600_000 });
    expect(RATE_LIMITS.SIGNUP.maxAttempts).toBe(10);
    expect(RATE_LIMITS.SIGNUP_SAME_CODE.maxAttempts).toBe(60);
  });
});

describe('random-code spam cannot mint unbounded rows', () => {
  it('past the coarse per-IP cap nothing is created for the code, and the answer is no', async () => {
    const cap = RATE_LIMITS.SIGNUP_ALL.maxAttempts;
    expect(cap).toBe(200);
    for (let i = 0; i < cap + 50; i++) await grantSignupAccessDetailed(`RND${String(i).padStart(5, '0')}`);
    const perCodeKeys = [...counts.keys()].filter((k) => /^signup:gate:203\.0\.113\.9:RND/.test(k));
    // Only attempts under the cap reached a per-code key (and only ten of those were new codes that got past the guess budget).
    expect(perCodeKeys.length).toBeLessThanOrEqual(cap);
    expect(counts.get('signup:gate:all:203.0.113.9')).toBe(cap + 50);
    expect(await grantSignupAccessDetailed('K7PQX4MN')).toEqual({ granted: false, kind: 'none', teamName: null });
    expect(counts.has('signup:gate:203.0.113.9:K7PQX4MN')).toBe(false);
  });
});

describe('the address the throttle keys on', () => {
  it('a varied or junk forwarded header collapses into one bucket instead of one per request', async () => {
    for (const junk of ['junk-1', 'junk-2', '<script>', '999.1.1.1, 8.8.8.8x']) {
      forwarded = junk;
      await grantSignupAccessDetailed('K7PQX4MN');
    }
    expect(counts.get('signup:gate:all:unknown')).toBe(4);
  });

  it('the platform-set address wins over a client-supplied one', async () => {
    vercelIp = '198.51.100.20';
    forwarded = '203.0.113.99';
    await grantSignupAccessDetailed('K7PQX4MN');
    expect(counts.has('signup:gate:all:198.51.100.20')).toBe(true);
    expect(counts.has('signup:gate:all:203.0.113.99')).toBe(false);
  });
});
