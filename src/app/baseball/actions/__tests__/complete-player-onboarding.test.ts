// =============================================================================
// src/app/baseball/actions/__tests__/complete-player-onboarding.test.ts
//
// GUARD (defect #1 regression test): the player golden path is web email/password
// signup, which created NO baseball_players row. The old onboarding completion
// ran a bare client `.update().eq('user_id', ...)` that matched 0 rows, returned
// a null error, and silently never set onboarding_completed — trapping the player
// in an onboarding bounce loop. completePlayerOnboarding() must instead UPSERT
// (onConflict: user_id) via the admin client so the row is created-or-updated and
// onboarding_completed is actually persisted.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
// untyped helper is imported at module top in onboarding.ts; stub so import resolves.
vi.mock('@/lib/supabase/untyped', () => ({ fromUntyped: vi.fn() }));
vi.mock('@/lib/auth/supabase-rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, resetAt: 0 })),
  RATE_LIMITS: { SIGNUP: {} },
  formatTimeRemaining: vi.fn(() => '1m'),
}));
vi.mock('@/lib/auth/password-validation', () => ({
  validatePassword: vi.fn(() => ({ valid: true, feedback: [] })),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));

import { completePlayerOnboarding } from '@/app/baseball/actions/onboarding';

const BASE_INPUT = {
  playerType: 'high_school',
  firstName: 'Jordan',
  lastName: 'Rivera',
  gradYear: 2027,
  primaryPosition: 'SS',
  profileCompletionPercent: 60,
};

describe('completePlayerOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'p@example.com' } } });
    upsert.mockResolvedValue({ error: null });
  });

  it('UPSERTS the player row on user_id and marks onboarding complete', async () => {
    const res = await completePlayerOnboarding(BASE_INPUT);

    expect(res.success).toBe(true);
    expect(res.redirectTo).toBe('/baseball/dashboard');
    expect(from).toHaveBeenCalledWith('baseball_players');

    const [row, opts] = upsert.mock.calls[0]!;
    // CRITICAL: must be onConflict user_id (the create-or-update that the old
    // bare .update() lacked).
    expect(opts).toEqual({ onConflict: 'user_id' });
    expect(row.user_id).toBe('user-1');
    expect(row.player_type).toBe('high_school');
    expect(row.onboarding_completed).toBe(true);
    expect(row.first_name).toBe('Jordan');
    expect(row.profile_completion_percent).toBe(60);
    // privacy-first: never auto-activate recruiting at onboarding.
    expect(row.recruiting_activated).toBe(false);
  });

  it('rejects an unauthenticated caller without writing', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await completePlayerOnboarding(BASE_INPUT);
    expect(res.success).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects an invalid player type', async () => {
    const res = await completePlayerOnboarding({ ...BASE_INPUT, playerType: 'pro' });
    expect(res.success).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('requires first and last name', async () => {
    const res = await completePlayerOnboarding({ ...BASE_INPUT, lastName: '   ' });
    expect(res.success).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('surfaces a DB error instead of silently succeeding', async () => {
    upsert.mockResolvedValue({ error: new Error('boom') });
    const res = await completePlayerOnboarding(BASE_INPUT);
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('clamps profile completion into 0..100', async () => {
    await completePlayerOnboarding({ ...BASE_INPUT, profileCompletionPercent: 999 });
    expect(upsert.mock.calls[0]![0].profile_completion_percent).toBe(100);
  });

  // GUARD (verify mustFix regression test): height_feet, pitch_velo, exit_velo,
  // and sixty_time have NO other write path in the app — updateMyPlayerProfile's
  // whitelist omits all four, and bats/throws only recover via a coach-gated
  // toggle. If these are dropped here they become permanently uncapturable on
  // the normal happy path, silently breaking Discover's velo/exit filters, the
  // recruiting match-calculator/min-standards, and the public profile headline.
  it('persists all six measurables (height_feet, bats, throws, pitch_velo, exit_velo, sixty_time)', async () => {
    await completePlayerOnboarding({
      ...BASE_INPUT,
      heightFeet: 6,
      heightInches: 2,
      weightLbs: 190,
      bats: 'L',
      throws: 'R',
      pitchVelo: 88,
      exitVelo: 95,
      sixtyTime: 6.7,
    });

    const row = upsert.mock.calls[0]![0];
    expect(row.height_feet).toBe(6);
    expect(row.height_inches).toBe(2);
    expect(row.weight_lbs).toBe(190);
    expect(row.bats).toBe('L');
    expect(row.throws).toBe('R');
    expect(row.pitch_velo).toBe(88);
    expect(row.exit_velo).toBe(95);
    expect(row.sixty_time).toBe(6.7);
  });

  it('drops an invalid handedness value instead of persisting garbage', async () => {
    await completePlayerOnboarding({ ...BASE_INPUT, bats: 'X', throws: 'Z' });
    const row = upsert.mock.calls[0]![0];
    expect(row.bats).toBeNull();
    expect(row.throws).toBeNull();
  });

  it('omits measurables gracefully (all null) when not provided', async () => {
    const res = await completePlayerOnboarding(BASE_INPUT);
    expect(res.success).toBe(true);
    const row = upsert.mock.calls[0]![0];
    expect(row.height_feet).toBeNull();
    expect(row.pitch_velo).toBeNull();
    expect(row.exit_velo).toBeNull();
    expect(row.sixty_time).toBeNull();
    expect(row.bats).toBeNull();
    expect(row.throws).toBeNull();
  });
});
