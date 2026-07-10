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
});
