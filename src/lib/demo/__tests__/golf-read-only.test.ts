// =============================================================================
// src/lib/demo/__tests__/golf-read-only.test.ts
//
// Unit coverage for the GolfHelm shared-demo write guard — the golf counterpart
// to the `demoSafe` check inside withBaseballAction. Covers the fail-closed
// contract, the "demo unconfigured" case, and the no-extra-auth-round-trip
// promise of the known-email call shape.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

import {
  GolfDemoReadOnlyError,
  isGolfDemoReadOnlyError,
  isCurrentSessionGolfDemo,
  assertGolfDemoWritable,
} from '@/lib/demo/golf-read-only';

const DEMO_EMAIL = 'demo@golfhelmdemo.com';
const REAL_EMAIL = 'coach@university.edu';

let originalDemoEmail: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  originalDemoEmail = process.env.DEMO_COACH_EMAIL;
  process.env.DEMO_COACH_EMAIL = DEMO_EMAIL;
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
});

afterEach(() => {
  if (originalDemoEmail === undefined) delete process.env.DEMO_COACH_EMAIL;
  else process.env.DEMO_COACH_EMAIL = originalDemoEmail;
});

describe('isCurrentSessionGolfDemo — known-email shape', () => {
  it('identifies the demo account case-insensitively and with surrounding space', async () => {
    expect(await isCurrentSessionGolfDemo(DEMO_EMAIL)).toBe(true);
    expect(await isCurrentSessionGolfDemo(DEMO_EMAIL.toUpperCase())).toBe(true);
    expect(await isCurrentSessionGolfDemo(`  ${DEMO_EMAIL}  `)).toBe(true);
  });

  it('returns false for a real coach', async () => {
    expect(await isCurrentSessionGolfDemo(REAL_EMAIL)).toBe(false);
  });

  it('does not touch auth when the email is already known', async () => {
    await isCurrentSessionGolfDemo(REAL_EMAIL);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('treats an explicit null email as "not the demo" (signed-out, nothing to guard)', async () => {
    expect(await isCurrentSessionGolfDemo(null)).toBe(false);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

describe('isCurrentSessionGolfDemo — session-resolving shape', () => {
  it('resolves the session when no email is passed', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { email: DEMO_EMAIL } } });
    expect(await isCurrentSessionGolfDemo()).toBe(true);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });

  it('returns false for a real signed-in coach', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { email: REAL_EMAIL } } });
    expect(await isCurrentSessionGolfDemo()).toBe(false);
  });

  it('FAILS CLOSED when the session cannot be resolved', async () => {
    mocks.createClient.mockRejectedValue(new Error('supabase unreachable'));
    expect(await isCurrentSessionGolfDemo()).toBe(true);
  });

  it('FAILS CLOSED when getUser itself throws', async () => {
    mocks.getUser.mockRejectedValue(new Error('token exchange failed'));
    expect(await isCurrentSessionGolfDemo()).toBe(true);
  });
});

describe('isCurrentSessionGolfDemo — demo unconfigured', () => {
  it('reports false for every user when DEMO_COACH_EMAIL is unset', async () => {
    delete process.env.DEMO_COACH_EMAIL;
    // No demo account can exist, so no real user may be locked out.
    expect(await isCurrentSessionGolfDemo(REAL_EMAIL)).toBe(false);
    expect(await isCurrentSessionGolfDemo(DEMO_EMAIL)).toBe(false);
  });
});

describe('assertGolfDemoWritable', () => {
  it('throws GolfDemoReadOnlyError for the demo account', async () => {
    await expect(assertGolfDemoWritable(DEMO_EMAIL)).rejects.toBeInstanceOf(GolfDemoReadOnlyError);
  });

  it('resolves silently for a real coach', async () => {
    await expect(assertGolfDemoWritable(REAL_EMAIL)).resolves.toBeUndefined();
  });

  it('blocks the write when the session cannot be resolved', async () => {
    mocks.getUser.mockRejectedValue(new Error('boom'));
    await expect(assertGolfDemoWritable()).rejects.toBeInstanceOf(GolfDemoReadOnlyError);
  });

  it('carries a user-facing message, not an internal one', async () => {
    const err = await assertGolfDemoWritable(DEMO_EMAIL).catch((e: unknown) => e);
    expect((err as Error).message).toMatch(/read-only demo/i);
  });
});

describe('isGolfDemoReadOnlyError', () => {
  it('recognises the real error', () => {
    expect(isGolfDemoReadOnlyError(new GolfDemoReadOnlyError())).toBe(true);
  });

  it('recognises a structurally-equivalent error across a bundle boundary', () => {
    expect(isGolfDemoReadOnlyError({ code: 'GOLF_DEMO_READ_ONLY' })).toBe(true);
  });

  it('rejects unrelated errors and non-objects', () => {
    expect(isGolfDemoReadOnlyError(new Error('nope'))).toBe(false);
    expect(isGolfDemoReadOnlyError(null)).toBe(false);
    expect(isGolfDemoReadOnlyError('GOLF_DEMO_READ_ONLY')).toBe(false);
  });
});
