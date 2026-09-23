/**
 * ============================================================================
 * `loadDistanceProfileAddendumIfEnabled` / `loadDistanceProfileAddendum` —
 * the A7 distance-profile surface's flag gate and failure isolation, pulled
 * out of `page.tsx`'s `Promise.all` array so both are directly testable.
 * ----------------------------------------------------------------------------
 * A #2008 review MUST: with the flag off, the loader must never be CALLED
 * (not just have its result discarded) — and `loadDistanceProfileAddendum`'s
 * own try/catch must turn a throw into `null`, never a rejected promise,
 * since a `Promise.all` sibling rejecting would take down the whole page's
 * data fetch, not just this one addendum.
 *
 * Every OTHER import `page.tsx` makes is mocked to a no-op purely so the
 * module can be imported at all without pulling in session/cookie/Supabase
 * plumbing this test never exercises — mirrors the mocking convention in
 * `src/app/baseball/(dashboard)/dashboard/players/[id]/scout-packet/preview/__tests__/page.test.tsx`.
 * ========================================================================== */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadDistanceProfile: vi.fn(),
  buildDistanceProfileViewModel: vi.fn(() => []),
  buildRollingDistanceProfileScope: vi.fn((playerId: string) => ({
    player_id: playerId,
    window_start: '2026-01-01T00:00:00.000Z',
    window_end: '2026-09-23T00:00:00.000Z',
    analysis_cutoff: '2026-09-23T00:00:00.000Z',
  })),
  describeDistanceProfileWindow: vi.fn(() => 'Last 12 months'),
  logServerError: vi.fn(async () => undefined),
  isFlagEnabled: vi.fn(() => false),
  createClient: vi.fn(),
  getGolfSessionProfile: vi.fn(),
  resolveCoachTeamIdWithCookie: vi.fn(),
  getPlayerFingerprint: vi.fn(),
  getThemesForCoach: vi.fn(),
  getAlertCounts: vi.fn(),
  getPlayerTrendAnalysis: vi.fn(),
  getPlayerTrajectory: vi.fn(),
  applyInsightVisibility: vi.fn(),
  fairwayScope: vi.fn(),
  computeCompositeRating: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: mocks.getGolfSessionProfile }));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: mocks.resolveCoachTeamIdWithCookie,
}));
vi.mock('@/app/golf/actions/player-fingerprint', () => ({ getPlayerFingerprint: mocks.getPlayerFingerprint }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getThemesForCoach: mocks.getThemesForCoach }));
vi.mock('@/app/golf/actions/alerts', () => ({ getAlertCounts: mocks.getAlertCounts }));
vi.mock('@/app/golf/actions/coachhelm-data', () => ({ getPlayerTrendAnalysis: mocks.getPlayerTrendAnalysis }));
vi.mock('@/app/golf/actions/insights', () => ({ getPlayerTrajectory: mocks.getPlayerTrajectory }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));
vi.mock('@/lib/coachhelm/v3/insight-visibility', () => ({ applyInsightVisibility: mocks.applyInsightVisibility }));
vi.mock('@/lib/redesign/flag', () => ({ fairwayScope: mocks.fairwayScope }));
vi.mock('@/lib/coachhelm/composite-rating', () => ({ computeCompositeRating: mocks.computeCompositeRating }));
vi.mock('@/lib/flags', () => ({ isFlagEnabled: mocks.isFlagEnabled }));
vi.mock('@/lib/coachhelm/v3/metrics/distance-profile-window', () => ({
  buildRollingDistanceProfileScope: mocks.buildRollingDistanceProfileScope,
  describeDistanceProfileWindow: mocks.describeDistanceProfileWindow,
}));
vi.mock('@/lib/coachhelm/v3/metrics/load-distance-profile', () => ({
  loadDistanceProfile: mocks.loadDistanceProfile,
}));
vi.mock(
  '@/components/golf/coachhelm/game-fingerprint/distance-profile/buildDistanceProfileViewModel',
  () => ({ buildDistanceProfileViewModel: mocks.buildDistanceProfileViewModel }),
);
vi.mock('@/components/golf/coachhelm/game-fingerprint/distance-profile/DistanceProfileSection', () => ({
  DistanceProfileSection: () => null,
}));
vi.mock('./PlayerDeepDiveTabs', () => ({ PlayerDeepDiveTabs: () => null }));

import { loadDistanceProfileAddendum, loadDistanceProfileAddendumIfEnabled } from './page';

const FAKE_SUPABASE = {} as unknown as Parameters<typeof loadDistanceProfileAddendum>[1];

describe('loadDistanceProfileAddendumIfEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never calls the loader when the flag is off — not just discards its result', async () => {
    const result = await loadDistanceProfileAddendumIfEnabled(false, 'p-1', FAKE_SUPABASE);
    expect(result).toBeNull();
    expect(mocks.loadDistanceProfile).not.toHaveBeenCalled();
  });

  it('calls the loader when the flag is on', async () => {
    mocks.loadDistanceProfile.mockResolvedValueOnce([]);
    await loadDistanceProfileAddendumIfEnabled(true, 'p-1', FAKE_SUPABASE);
    expect(mocks.loadDistanceProfile).toHaveBeenCalledTimes(1);
  });
});

describe('loadDistanceProfileAddendum', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves to null rather than rejecting when the loader throws, so a Promise.all sibling never fails alongside it', async () => {
    mocks.loadDistanceProfile.mockRejectedValueOnce(new Error('boom'));
    await expect(loadDistanceProfileAddendum('p-1', FAKE_SUPABASE)).resolves.toBeNull();
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
  });
});
