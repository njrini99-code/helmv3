// =============================================================================
// activateRecruitingExposure must refuse to run while the module is sunset.
//
// WHY A SEPARATE SUITE. The sunset closed /baseball/dashboard/activate two
// ways — added to MODULE_ROUTE_PREFIXES (middleware) and a redirect in the page
// itself. Neither touches the server action behind the button, and the action
// is the actual door: a POST endpoint with a stable id, invocable without ever
// loading the page that renders its button. Closing the page and leaving the
// action open is the same mistake as hiding a nav link and leaving the route
// open, one layer down.
//
// It is the only recruiting entry point that WRITES. Every other surface
// displays; this one sets recruiting_activated = true — the flag that makes a
// player publicly named rather than masked to initials — and that row state
// outlives the sunset.
//
// WHAT THE TEST SETS UP, AND WHY IT LOOKS BACKWARDS. The toggle
// `recruiting_exposure_enabled` is deliberately set to **true** in every case
// below — the permissive value. That is the point: it defaults to true for
// high-school, showcase and JUCO program variants, and the coach-facing switch
// that could turn it off is itself hidden while the module is sunset. So the
// pre-existing gate is wide open and cannot be closed by anyone, which is
// exactly why the module gate has to carry the weight here. Setting the toggle
// to false would make this suite pass on the wrong gate — the same way the
// first draft of recruiting-activate-door.test.ts passed on the real flag while
// believing it had mocked one.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const authUser = { id: 'user-1', email: 'player@example.com' };

/** Set by each test; the player-access resolver reads it. */
let toggleRow: Record<string, boolean> | null = null;

/** Tripped if the action ever reaches its service-role write path. */
const adminClientConstructed = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: authUser } })) },
  })),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: toggleRow })),
    update: vi.fn().mockReturnThis(),
  })),
}));

// The write seam. If the module gate regresses, this fires and the assertion
// below catches it — the test must never depend on a real client refusing.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    adminClientConstructed();
    return {};
  }),
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => ({
    activeTeamId: 'team-1',
    activeRole: 'player',
    activeCoachId: null,
    activePlayerId: 'player-1',
    fellBackFromStale: false,
  })),
}));

vi.mock('@/lib/baseball/capabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baseball/capabilities')>();
  return {
    ...actual,
    resolveBaseballCapabilities: vi.fn(async () => ({ can_manage_roster: false })),
  };
});

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  activateRecruitingExposure,
  deactivateRecruitingExposure,
} from '@/app/baseball/actions/player-access';
import { isRecruitingEnabled } from '@/lib/baseball/product-modules';

beforeEach(() => {
  vi.clearAllMocks();
  adminClientConstructed.mockClear();
  // Permissive on every OTHER gate — see the header.
  toggleRow = { recruiting_exposure_enabled: true };
});

describe('activateRecruitingExposure — product-module gate', () => {
  it('the module really is off (sanity — otherwise the assertions below are meaningless)', () => {
    expect(isRecruitingEnabled()).toBe(false);
  });

  it('refuses to activate even with the team toggle wide open', async () => {
    await expect(activateRecruitingExposure()).rejects.toThrow();
  });

  it('never reaches the service-role write path', async () => {
    // The load-bearing assertion. "It threw" is not enough — a throw AFTER the
    // update would still have set recruiting_activated = true, and the row
    // state is the thing that outlives the sunset. This proves the gate runs
    // before any write is attempted.
    await expect(activateRecruitingExposure()).rejects.toThrow();
    expect(adminClientConstructed).not.toHaveBeenCalled();
  });
});

describe('deactivateRecruitingExposure — deliberately NOT module-gated', () => {
  it('still lets a player withdraw while the module is sunset', async () => {
    // Players who activated before the sunset still carry
    // recruiting_activated = true. Gating the way OUT would trap them in an
    // exposed state with no way to leave it — the worst of the three outcomes.
    // A module gate belongs on the door in, never on the door out.
    await expect(deactivateRecruitingExposure()).resolves.toEqual({ success: true });
    expect(adminClientConstructed).toHaveBeenCalled();
  });
});
