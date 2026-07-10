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
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

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
});
