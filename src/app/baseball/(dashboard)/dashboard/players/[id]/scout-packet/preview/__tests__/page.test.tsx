// =============================================================================
// CoachScoutPacketPreviewPage — BaseballUnauthorizedError must redirect, not
// raw-throw.
//
// getScoutPacketPreview (withBaseballAction) independently re-resolves auth,
// so a session that expires between the page's own getActiveBaseballContext()
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
  getScoutPacketPreview: vi.fn(),
  requireRecruitingCoachRoute: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));

// The page now opens with the recruiting module gate. Mocked so the assertions
// below keep exercising the session-expiry logic they were written for — still
// correct, and what the documented restore path needs when the flag flips. The
// gate's own behaviour is asserted separately at the bottom of this file.
vi.mock('@/lib/baseball/server-route-guards', () => ({
  requireRecruitingCoachRoute: mocks.requireRecruitingCoachRoute,
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: mocks.getActiveBaseballContext,
}));

vi.mock('@/app/baseball/actions/scout-packet', () => ({
  getScoutPacketPreview: mocks.getScoutPacketPreview,
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

vi.mock('@/components/baseball/passport/ScoutPacketView', () => ({
  ScoutPacketView: () => null,
}));

import CoachScoutPacketPreviewPage from '../page';

const COACH_CONTEXT = {
  activeTeamId: 'team-1',
  activeRole: 'coach' as const,
  activeCoachId: 'coach-1',
  activePlayerId: null,
};

describe('CoachScoutPacketPreviewPage — BaseballUnauthorizedError redirects instead of raw-throwing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Module OPEN by default — see the mock note above.
    mocks.requireRecruitingCoachRoute.mockResolvedValue({});
    mocks.getActiveBaseballContext.mockResolvedValue(COACH_CONTEXT);
  });

  it('redirects to /baseball/login (with returnTo) when the session expired between the context check and the preview fetch', async () => {
    mocks.getScoutPacketPreview.mockRejectedValue(new FakeBaseballUnauthorizedError());

    await expect(CoachScoutPacketPreviewPage({ params: Promise.resolve({ id: 'player-1' }) })).rejects.toThrow(
      'REDIRECT:/baseball/login?returnTo=' +
        encodeURIComponent('/baseball/dashboard/players/player-1/scout-packet/preview'),
    );
  });

  it('re-throws any OTHER error (a real failure for a signed-in, authorized coach) instead of redirecting', async () => {
    mocks.getScoutPacketPreview.mockRejectedValue(new Error('assembly failed'));

    await expect(
      CoachScoutPacketPreviewPage({ params: Promise.resolve({ id: 'player-1' }) }),
    ).rejects.toThrow('assembly failed');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('renders normally when the preview fetch succeeds', async () => {
    mocks.getScoutPacketPreview.mockResolvedValue({ ok: true });

    const element = await CoachScoutPacketPreviewPage({
      params: Promise.resolve({ id: 'player-1' }),
    });
    expect(element).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  // This route sat outside MODULE_ROUTE_PREFIXES (no static prefix can describe
  // /players/[id]/scout-packet without also matching the live roster subtree),
  // outside the middleware's RECRUITING_ROUTES and STAFF_CAPABILITY_ROUTES, and
  // carried no guard of its own — so "preview as a scout" kept assembling and
  // rendering a real packet straight through the sunset.
  it('consults the recruiting module gate BEFORE assembling a packet', async () => {
    mocks.requireRecruitingCoachRoute.mockRejectedValue(
      new Error('REDIRECT:/baseball/dashboard/command-center'),
    );

    await expect(
      CoachScoutPacketPreviewPage({ params: Promise.resolve({ id: 'player-1' }) }),
    ).rejects.toThrow('REDIRECT:/baseball/dashboard/command-center');
    expect(mocks.getScoutPacketPreview).not.toHaveBeenCalled();
  });
});
