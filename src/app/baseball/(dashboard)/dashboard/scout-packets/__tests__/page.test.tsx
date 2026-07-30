// =============================================================================
// ScoutPacketsHubPage — BaseballUnauthorizedError must redirect, not raw-throw.
//
// getScoutPacketRoster (withBaseballAction) independently re-resolves auth, so
// a session that expires between the page's own getActiveBaseballContext()
// check and this call throws BaseballUnauthorizedError. Before this fix, that
// error propagated straight out of the Server Component render to error.tsx
// and the error tracker (Sentry/Vercel) — the same class of bug fixed on the
// baseball announcements page (ROOT CAUSE 3). This test pins the fix: the
// unauthenticated case now redirects to /baseball/login (preserving
// returnTo), while any OTHER thrown error (a real failure for a signed-in,
// authorized coach) still propagates so error.tsx keeps handling genuine
// failures.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActiveBaseballContext: vi.fn(),
  resolveBaseballCapabilities: vi.fn(),
  getScoutPacketRoster: vi.fn(),
  requireRecruitingCoachRoute: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

// The page now opens with the recruiting module gate. Mocked so the assertions
// below keep exercising the session-expiry logic they were written for — that
// logic is still correct and is what the documented restore path needs the day
// the module flag flips. The gate's own behaviour is asserted separately at the
// bottom of this file.
vi.mock('@/lib/baseball/server-route-guards', () => ({
  requireRecruitingCoachRoute: mocks.requireRecruitingCoachRoute,
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: mocks.getActiveBaseballContext,
}));

vi.mock('@/lib/baseball/capabilities', () => ({
  resolveBaseballCapabilities: mocks.resolveBaseballCapabilities,
}));

vi.mock('@/app/baseball/actions/scout-packet', () => ({
  getScoutPacketRoster: mocks.getScoutPacketRoster,
}));

// Mocked locally (not the real with-baseball-action module) so the page's
// `instanceof BaseballUnauthorizedError` check runs against the SAME class
// reference this test constructs errors with — no need to pull in the real
// module's Sentry/Supabase/capability dependency graph just to reach one
// error class. Defined inside vi.hoisted since vi.mock factories are hoisted
// above normal top-level declarations.
const { FakeBaseballUnauthorizedError } = vi.hoisted(() => ({
  FakeBaseballUnauthorizedError: class FakeBaseballUnauthorizedError extends Error {
    readonly status = 401;
    constructor(message = 'You must be signed in.') {
      super(message);
      this.name = 'BaseballUnauthorizedError';
    }
  },
}));
vi.mock('@/lib/baseball/with-baseball-action', () => ({
  BaseballUnauthorizedError: FakeBaseballUnauthorizedError,
}));

vi.mock('@/components/baseball/passport/ScoutPacketsFairway', () => ({
  ScoutPacketsFairway: () => null,
}));

import ScoutPacketsHubPage from '../page';

const COACH_CONTEXT = {
  activeTeamId: 'team-1',
  activeRole: 'coach' as const,
  activeCoachId: 'coach-1',
  activePlayerId: null,
};

describe('ScoutPacketsHubPage — BaseballUnauthorizedError redirects instead of raw-throwing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Module OPEN by default — see the mock note above.
    mocks.requireRecruitingCoachRoute.mockResolvedValue({});
    mocks.getActiveBaseballContext.mockResolvedValue(COACH_CONTEXT);
    mocks.resolveBaseballCapabilities.mockResolvedValue({
      can_export_reports: true,
      is_head_coach: false,
    });
  });

  it('redirects to /baseball/login (with returnTo) when the session expired between the context check and the roster fetch', async () => {
    mocks.getScoutPacketRoster.mockRejectedValue(new FakeBaseballUnauthorizedError());

    await expect(ScoutPacketsHubPage()).rejects.toThrow(
      'REDIRECT:/baseball/login?returnTo=/baseball/dashboard/scout-packets',
    );
  });

  it('re-throws any OTHER error (a real failure for a signed-in, authorized coach) instead of redirecting', async () => {
    mocks.getScoutPacketRoster.mockRejectedValue(new Error('roster query failed'));

    await expect(ScoutPacketsHubPage()).rejects.toThrow('roster query failed');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('renders normally when the roster fetch succeeds', async () => {
    mocks.getScoutPacketRoster.mockResolvedValue({ players: [] });

    const element = await ScoutPacketsHubPage();
    expect(element).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  // This page was the only recruiting surface in the module with no gate of its
  // own, relying entirely on two lists in middleware.ts continuing to agree.
  it('consults the recruiting module gate BEFORE reading any data', async () => {
    mocks.requireRecruitingCoachRoute.mockRejectedValue(
      new Error('REDIRECT:/baseball/dashboard/command-center'),
    );

    await expect(ScoutPacketsHubPage()).rejects.toThrow(
      'REDIRECT:/baseball/dashboard/command-center',
    );
    // The point of "before": a withheld module must not spend a capability
    // lookup or a roster read on a request it is going to refuse.
    expect(mocks.resolveBaseballCapabilities).not.toHaveBeenCalled();
    expect(mocks.getScoutPacketRoster).not.toHaveBeenCalled();
  });
});
