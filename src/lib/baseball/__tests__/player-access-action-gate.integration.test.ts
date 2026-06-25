// =============================================================================
// Integration test: the WIRED player-access gate fails closed end-to-end.
//
// Proves that a server action wrapped with
//   withBaseballAction({ requiredPlayerAccess: <key> })
// actually:
//   1. DENIES a non-staff player when the team toggle is OFF (throws
//      PlayerAccessError -> the action body never runs).
//   2. ALLOWS a non-staff player when the team toggle is ON.
//   3. ALLOWS a coach (staff) even when a self-service toggle is OFF (bypass).
//   4. DENIES a coach for a NON-bypassable surface gate when the toggle is OFF.
//
// The DB + auth + active-context seams are mocked; the real withBaseballAction
// + player-access resolution wiring is exercised. This is the regression that
// would have caught "the settings are write-only configuration that nothing
// consumes".
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mockable seams --------------------------------------------------------

const authUser = { id: 'user-1', email: 'p@example.com' };

let toggleRow: Record<string, boolean> | null;
let staffCaps: Record<string, boolean>;

// Mock the request-scoped Supabase client used by both the wrapper (auth) and
// the player-access settings read.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: authUser } })) },
  })),
}));

// Mock the untyped settings read so player-access reads our controlled toggle.
vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: toggleRow })),
  })),
}));

// Mock the active baseball context (server-validated team/role).
vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => ({
    activeTeamId: 'team-1',
    activeRole: 'player',
    activeCoachId: null,
    activePlayerId: 'player-1',
    fellBackFromStale: false,
  })),
}));

// Mock the capabilities resolver so we control staff-vs-player.
vi.mock('@/lib/baseball/capabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../capabilities')>();
  return {
    ...actual,
    resolveBaseballCapabilities: vi.fn(async () => staffCaps),
  };
});

// Silence the server error logger (it would try to hit DB).
vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => undefined),
}));

// Sentry withScope passthrough.
vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));

import { withBaseballAction } from '../with-baseball-action';
import { PlayerAccessError } from '../player-access';

const NO_CAPS: Record<string, boolean> = { can_manage_roster: false };
const STAFF_CAPS: Record<string, boolean> = { can_manage_roster: true };

function makeGatedAction(key: Parameters<typeof withBaseballAction>[1]['requiredPlayerAccess']) {
  return withBaseballAction(
    'testGatedAction',
    { featureArea: 'baseball-test', requiredPlayerAccess: key },
    async () => ({ ran: true }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('wired player-access gate (self-service key: can_self_log_lift)', () => {
  it('DENIES a player when the toggle is OFF (body never runs)', async () => {
    toggleRow = { players_can_self_log_lift: false };
    staffCaps = NO_CAPS;
    const action = makeGatedAction('can_self_log_lift');
    await expect(action()).rejects.toBeInstanceOf(PlayerAccessError);
  });

  it('ALLOWS a player when the toggle is ON', async () => {
    toggleRow = { players_can_self_log_lift: true };
    staffCaps = NO_CAPS;
    const action = makeGatedAction('can_self_log_lift');
    await expect(action()).resolves.toEqual({ ran: true });
  });

  it('ALLOWS a coach even when the self-service toggle is OFF (staff bypass)', async () => {
    toggleRow = { players_can_self_log_lift: false };
    staffCaps = STAFF_CAPS;
    const action = makeGatedAction('can_self_log_lift');
    await expect(action()).resolves.toEqual({ ran: true });
  });
});

describe('wired player-access gate (surface gate: public_profiles_enabled)', () => {
  it('DENIES even a coach when the surface toggle is OFF (not staff-bypassable)', async () => {
    toggleRow = { public_profiles_enabled: false };
    staffCaps = STAFF_CAPS;
    const action = makeGatedAction('public_profiles_enabled');
    await expect(action()).rejects.toBeInstanceOf(PlayerAccessError);
  });

  it('ALLOWS when the surface toggle is ON', async () => {
    toggleRow = { public_profiles_enabled: true };
    staffCaps = NO_CAPS;
    const action = makeGatedAction('public_profiles_enabled');
    await expect(action()).resolves.toEqual({ ran: true });
  });
});
