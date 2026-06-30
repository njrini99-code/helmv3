// =============================================================================
// src/lib/demo/__tests__/baseball-config.server.test.ts
//
// Issue #392 — unit coverage for the demo-session detection helper and the
// production kill-switch that withBaseballAction + the demo gate both rely on.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));

import {
  getBaseballDemoCoachCredentials,
  isBaseballDemoCoachEmail,
  isCurrentSessionBaseballDemo,
  isBaseballDemoEnabled,
} from '@/lib/demo/baseball-config.server';

describe('isBaseballDemoCoachEmail', () => {
  it('matches the seeded demo coach email case-insensitively', () => {
    const { email } = getBaseballDemoCoachCredentials();
    expect(isBaseballDemoCoachEmail(email.toUpperCase())).toBe(true);
    expect(isBaseballDemoCoachEmail(`  ${email}  `)).toBe(true);
  });

  it('returns false for a real coach email', () => {
    expect(isBaseballDemoCoachEmail('real-coach@university.edu')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isBaseballDemoCoachEmail(null)).toBe(false);
    expect(isBaseballDemoCoachEmail(undefined)).toBe(false);
  });
});

describe('isCurrentSessionBaseballDemo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('with a known email: matches the demo coach without touching auth', async () => {
    const { email } = getBaseballDemoCoachCredentials();
    expect(await isCurrentSessionBaseballDemo(email)).toBe(true);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('with a known email: returns false for a real coach without touching auth', async () => {
    expect(await isCurrentSessionBaseballDemo('real-coach@university.edu')).toBe(false);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('with no argument: resolves the session itself and matches the demo coach', async () => {
    const { email } = getBaseballDemoCoachCredentials();
    mocks.getUser.mockResolvedValue({ data: { user: { email } } });
    expect(await isCurrentSessionBaseballDemo()).toBe(true);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });

  it('with no argument: returns false when there is no session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await isCurrentSessionBaseballDemo()).toBe(false);
  });

  it('fails CLOSED (treats as demo) when resolving the session throws', async () => {
    mocks.getUser.mockRejectedValue(new Error('network blip'));
    expect(await isCurrentSessionBaseballDemo()).toBe(true);
  });
});

describe('isBaseballDemoEnabled (kill-switch)', () => {
  const ORIGINAL = process.env.BASEBALL_DEMO_ENABLED;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.BASEBALL_DEMO_ENABLED;
    else process.env.BASEBALL_DEMO_ENABLED = ORIGINAL;
  });

  it('defaults to enabled when the env var is unset', () => {
    delete process.env.BASEBALL_DEMO_ENABLED;
    expect(isBaseballDemoEnabled()).toBe(true);
  });

  it.each(['false', 'FALSE', '0', 'off', 'no'])('is disabled when set to %s', (value) => {
    process.env.BASEBALL_DEMO_ENABLED = value;
    expect(isBaseballDemoEnabled()).toBe(false);
  });

  it('stays enabled for any other value', () => {
    process.env.BASEBALL_DEMO_ENABLED = 'true';
    expect(isBaseballDemoEnabled()).toBe(true);
  });
});
