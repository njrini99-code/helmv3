import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The signup gate distinguishes a STAFF code from a ROSTER join code.
 *
 * This is the invariant the whole "type a code, join as an assistant coach"
 * design rests on. The roster join_code is handed to every athlete, so if a
 * roster code could ever classify as a staff code, any player could become a
 * coach — the exact feature reverted on 2026-08-05 (266d02d91), and a real
 * exposure because is_golf_team_coach() is existence-only: an assistant_coach
 * row reads every player's rounds and PII and can delete roster rows.
 *
 * So the test that matters most here is the NEGATIVE one: a live roster join
 * code must classify as a player credential and nothing else.
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
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
  // The gate warns once when SIGNUP_ACCESS_CODE is unset, which every test
  // here triggers deliberately (the global code is not the path under test).
  logServerEvent: vi.fn(async () => undefined),
}));

/** Rows the fake admin client will serve, keyed by table. */
const tables: Record<string, unknown> = {};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, value: string) => ({
          maybeSingle: async () => {
            const row = tables[table] as { key: string; data: unknown } | undefined;
            if (!row || row.key !== value) return { data: null, error: null };
            return { data: row.data, error: null };
          },
          limit: () => ({
            maybeSingle: async () => {
              const row = tables[table] as { key: string; data: unknown } | undefined;
              if (!row || row.key !== value) return { data: null, error: null };
              return { data: row.data, error: null };
            },
          }),
        }),
      }),
    }),
  }),
}));

import { grantSignupAccess, verifySignupGate } from '../signup-gate';

const ROSTER_CODE = 'K7PQX4MN';
const STAFF_CODE = 'S9TDW2RC';

describe('signup gate — staff code vs roster join code', () => {
  const originalAccess = process.env.SIGNUP_ACCESS_CODE;

  beforeEach(() => {
    cookieJar.clear();
    for (const k of Object.keys(tables)) delete tables[k];
    delete process.env.SIGNUP_ACCESS_CODE;
  });

  afterEach(() => {
    if (originalAccess === undefined) delete process.env.SIGNUP_ACCESS_CODE;
    else process.env.SIGNUP_ACCESS_CODE = originalAccess;
  });

  it('a live STAFF code opens the gate and is carried as a staff code', async () => {
    tables['golf_staff_invite_codes'] = {
      key: STAFF_CODE,
      data: { code: STAFF_CODE, expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    };

    expect(await grantSignupAccess(STAFF_CODE)).toBe(true);
    const gate = await verifySignupGate();
    expect(gate.passed).toBe(true);
    expect(gate.staffInviteCode).toBe(STAFF_CODE);
    // Critically: it is NOT reported as a roster code, so signup will not route
    // it into player onboarding.
    expect(gate.teamJoinCode).toBeNull();
  });

  it('a ROSTER join code NEVER classifies as a staff code', async () => {
    // No staff-code row exists; only a real team carries this code.
    tables['golf_teams'] = { key: ROSTER_CODE, data: { id: 'team-1' } };

    expect(await grantSignupAccess(ROSTER_CODE)).toBe(true);
    const gate = await verifySignupGate();
    expect(gate.passed).toBe(true);
    // THE invariant: a player credential can only ever produce a player.
    expect(gate.staffInviteCode).toBeNull();
    expect(gate.teamJoinCode).toBe(ROSTER_CODE);
  });

  it('an EXPIRED staff code does not open the gate as staff', async () => {
    tables['golf_staff_invite_codes'] = {
      key: STAFF_CODE,
      data: { code: STAFF_CODE, expires_at: new Date(Date.now() - 1000).toISOString() },
    };

    // It is not a staff code and not a team code, so the gate refuses outright.
    expect(await grantSignupAccess(STAFF_CODE)).toBe(false);
  });

  it('an unknown code opens nothing', async () => {
    expect(await grantSignupAccess('NOTACODE')).toBe(false);
  });
});
