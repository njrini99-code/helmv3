/**
 * ============================================================================
 * `loadScoringAddendumIfEnabled` / `loadScoringAddendum` /
 * `loadDistanceProfileAndScoringAddenda` — the A7 Scoring surface's flag
 * gate and failure isolation, plus the shared-player-context path used when
 * BOTH A7 flags are on. Mirrors
 * `page.distanceProfileAddendum.test.ts`'s convention exactly (#2010
 * review, MUST 1: the no-op-while-off property for the Scoring addendum
 * must be proven here, not by an unrelated component test rerun unchanged).
 * ----------------------------------------------------------------------------
 * Every OTHER import `page.tsx` makes is mocked to a no-op purely so the
 * module can be imported at all without pulling in session/cookie/Supabase
 * plumbing this test never exercises.
 * ========================================================================== */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadDistanceProfile: vi.fn(),
  buildDistanceProfileViewModel: vi.fn(() => []),
  loadParOpportunities: vi.fn(),
  computeParOpportunities: vi.fn(() => []),
  loadPlayerContext: vi.fn(),
  buildScoringViewModel: vi.fn(() => ({ parSections: [], par5Holes: [] })),
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
vi.mock('@/lib/coachhelm/v3/metrics/load-par-opportunities', () => ({
  loadParOpportunities: mocks.loadParOpportunities,
}));
vi.mock('@/lib/coachhelm/v3/metrics/par-opportunities', () => ({
  computeParOpportunities: mocks.computeParOpportunities,
}));
vi.mock('@/lib/coachhelm/v3/context/load-player-context', () => ({
  loadPlayerContext: mocks.loadPlayerContext,
}));
vi.mock('@/components/golf/coachhelm/game-fingerprint/scoring/buildScoringViewModel', () => ({
  buildScoringViewModel: mocks.buildScoringViewModel,
}));
vi.mock('@/components/golf/coachhelm/game-fingerprint/scoring/ScoringSection', () => ({
  ScoringSection: () => null,
}));
vi.mock('./PlayerDeepDiveTabs', () => ({ PlayerDeepDiveTabs: () => null }));

import {
  loadDistanceProfileAndScoringAddenda,
  loadScoringAddendum,
  loadScoringAddendumIfEnabled,
} from './page';

const FAKE_SUPABASE = {} as unknown as Parameters<typeof loadScoringAddendum>[1];

describe('loadScoringAddendumIfEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never calls the loader when the flag is off — not just discards its result', async () => {
    const result = await loadScoringAddendumIfEnabled(false, 'p-1', FAKE_SUPABASE);
    expect(result).toBeNull();
    expect(mocks.loadParOpportunities).not.toHaveBeenCalled();
  });

  it('calls the loader when the flag is on', async () => {
    mocks.loadParOpportunities.mockResolvedValueOnce([]);
    await loadScoringAddendumIfEnabled(true, 'p-1', FAKE_SUPABASE);
    expect(mocks.loadParOpportunities).toHaveBeenCalledTimes(1);
  });
});

describe('loadScoringAddendum', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves to null rather than rejecting when the loader throws, so a Promise.all sibling never fails alongside it', async () => {
    mocks.loadParOpportunities.mockRejectedValueOnce(new Error('boom'));
    await expect(loadScoringAddendum('p-1', FAKE_SUPABASE)).resolves.toBeNull();
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
  });

  it('still renders the Scoring section when the golf_courses name lookup fails (#2010 review, SHOULD 2) — the par sections are not conditioned on it', async () => {
    mocks.loadParOpportunities.mockResolvedValueOnce([
      { dimensions: { course_id: 'course-a' }, metricId: 'par5_regulation_opportunity_rate' },
    ]);
    const supabaseWithFailingCourseLookup = {
      from: () => ({
        select: () => ({
          in: async () => ({ data: null, error: new Error('courses lookup failed') }),
        }),
      }),
    } as unknown as Parameters<typeof loadScoringAddendum>[1];

    const result = await loadScoringAddendum('p-1', supabaseWithFailingCourseLookup);

    // The whole addendum must NOT degrade to null just because the course
    // name lookup failed — buildScoringViewModel still runs (with an empty
    // courseNameById, falling back to a short id fragment per-card), and the
    // failure is logged once, separately from the addendum's own outer
    // try/catch (which never fires here).
    expect(result).not.toBeNull();
    expect(mocks.buildScoringViewModel).toHaveBeenCalledTimes(1);
    expect(mocks.buildScoringViewModel).toHaveBeenCalledWith(expect.any(Array), {});
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    expect(mocks.logServerError).toHaveBeenCalledWith(
      expect.stringContaining('golf_courses name lookup failed'),
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('loadDistanceProfileAndScoringAddenda — shared player-context path (#2010 review, SHOULD 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPlayerContext.mockResolvedValue({ shots: [], holes: [] });
  });

  it('with only one flag on, never touches the shared loadPlayerContext path — falls through to that addendum\'s own existing loader', async () => {
    mocks.loadDistanceProfile.mockResolvedValueOnce([]);
    const result = await loadDistanceProfileAndScoringAddenda(true, false, 'p-1', FAKE_SUPABASE);
    expect(mocks.loadPlayerContext).not.toHaveBeenCalled();
    expect(mocks.loadDistanceProfile).toHaveBeenCalledTimes(1);
    expect(mocks.loadParOpportunities).not.toHaveBeenCalled();
    expect(result.scoring).toBeNull();
  });

  it('with neither flag on, calls nothing', async () => {
    const result = await loadDistanceProfileAndScoringAddenda(false, false, 'p-1', FAKE_SUPABASE);
    expect(mocks.loadPlayerContext).not.toHaveBeenCalled();
    expect(mocks.loadDistanceProfile).not.toHaveBeenCalled();
    expect(mocks.loadParOpportunities).not.toHaveBeenCalled();
    expect(result).toEqual({ distanceProfile: null, scoring: null });
  });

  it('with BOTH flags on, calls loadPlayerContext exactly ONCE — not once per addendum', async () => {
    const result = await loadDistanceProfileAndScoringAddenda(true, true, 'p-1', FAKE_SUPABASE);
    expect(mocks.loadPlayerContext).toHaveBeenCalledTimes(1);
    // Neither addendum's OWN composition loader runs in this path — the
    // shared context is fed straight to computeDistanceProfile/
    // computeParOpportunities instead.
    expect(mocks.loadDistanceProfile).not.toHaveBeenCalled();
    expect(mocks.loadParOpportunities).not.toHaveBeenCalled();
    expect(result.distanceProfile).not.toBeNull();
    expect(result.scoring).not.toBeNull();
  });

  it('with BOTH flags on, a shared loadPlayerContext failure degrades BOTH addenda to null, not a rejection', async () => {
    mocks.loadPlayerContext.mockReset();
    mocks.loadPlayerContext.mockRejectedValueOnce(new Error('boom'));
    await expect(loadDistanceProfileAndScoringAddenda(true, true, 'p-1', FAKE_SUPABASE)).resolves.toEqual({
      distanceProfile: null,
      scoring: null,
    });
    expect(mocks.logServerError).toHaveBeenCalled();
  });

  it('with BOTH flags on, a computeParOpportunities failure degrades ONLY Scoring — the shared distance-profile addendum still renders (#2010 review fold-in)', async () => {
    // computeDistanceProfile is NOT mocked in this file — it runs for real
    // on the shared (empty) context, proving renderDistanceProfileFromContext's
    // own try/catch isolation actually holds when its SIBLING renderer
    // throws, not just when loadPlayerContext itself fails (already covered
    // above).
    mocks.computeParOpportunities.mockImplementationOnce(() => {
      throw new Error('scoring boom');
    });
    const result = await loadDistanceProfileAndScoringAddenda(true, true, 'p-1', FAKE_SUPABASE);
    expect(result.scoring).toBeNull();
    expect(result.distanceProfile).not.toBeNull();
    expect(mocks.logServerError).toHaveBeenCalledWith(
      expect.stringContaining('scoring render failed'),
      expect.anything(),
      expect.anything(),
    );
  });
});
