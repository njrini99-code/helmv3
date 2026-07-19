// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayStatsCockpit — tab -> content mapping (audit W4)
 * ----------------------------------------------------------------------------
 * Bug: `activeTab` used to be derived straight from `useSearchParams()` and
 * switched via `router.replace(...)`. Both cockpit consumers
 * (/golf/dashboard/stats and /golf/dashboard/roster/[id]) sit behind a heavy
 * async Server Component (session lookup + Supabase reads, one is
 * `dynamic = 'force-dynamic'`) with its own route-level `loading.tsx`. The App
 * Router has no shallow-routing equivalent, so every tab click re-rendered
 * that Server Component and could stall behind the route's Suspense fallback:
 * the previous tab stayed on screen while the navigation was in flight
 * ("Approach silently keeps showing Driving"), the heaviest tab's longer
 * round trip left the generic skeleton showing well after the click
 * ("Analysis" stuck ghost/skeleton), and a slow connection could drop the
 * navigation entirely ("Driving renders blank").
 *
 * This test renders the REAL cockpit (only the data-fetching server actions
 * are mocked) and clicks through every tab, asserting each one shows its OWN
 * distinguishing content the instant it's clicked — no `waitFor`, no extra
 * tick. The global test-suite mock of `next/navigation` (src/test/setup.tsx)
 * returns a brand-new, always-empty `URLSearchParams()` on every call and a
 * no-op `router.replace` — so under the OLD (pre-fix) implementation,
 * `activeTab` would resolve to `DEFAULT_STATS_TAB` ('scoring') on every
 * render regardless of what was clicked, and every assertion below except
 * Scoring's would fail. Passing here proves the active tab is real,
 * synchronous local state, not something gated behind a navigation.
 * ========================================================================== */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GolfStats, PuttingBreakStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { TrendAnalysisResponse, SprayChartResponse } from '@/app/golf/actions/stats-data-types';

vi.mock('@/app/golf/actions/stats-data', () => ({
  getDetailedStats: vi.fn(async () => STATS),
  getTrendAnalysis: vi.fn(async () => TREND),
  getSprayChartData: vi.fn(async () => SPRAY),
}));
vi.mock('@/app/golf/actions/stats-leak-maps', () => ({
  getPlayerLeakMaps: vi.fn(async () => ({
    success: true,
    data: { playerId: 'p1', putting: [], approach: [], roundsIncluded: 20 },
  })),
  getPlayerStandingRows: vi.fn(async () => ({ success: true, data: [] })),
}));
vi.mock('@/app/golf/actions/insights', () => ({
  getPlayerPatterns: vi.fn(async () => ({ success: true, patterns: [] })),
}));

// Import AFTER the mocks above (vi.mock calls are hoisted, but this keeps the
// dependency order explicit for readers).
import { FairwayStatsCockpit } from './FairwayStatsCockpit';

const EMPTY_BREAK_STATS: PuttingBreakStats = {
  totalPutts: 0,
  makePct0_3: null,
  makePct3_5: null,
  makePct5_10: null,
  makePct10_15: null,
  makePct15_20: null,
  makePct20_25: null,
  makePct25_30: null,
  makePct30_35: null,
  makePct35Plus: null,
  count5_10: 0,
  overallMakePct: null,
  missShortPct: null,
  missLowPct: null,
  missHighPct: null,
};

const EMPTY_APPROACH_EFF = { fairway: null, rough: null, sand: null } as const;

/**
 * A fully-populated GolfStats fixture. Every tab's headline section gates on
 * `detailedStats` being non-null PLUS a handful of real (non-null) fields, so
 * this fixture is deliberately "everything has a value" rather than minimal —
 * the goal is every tab's OWN section renders, so a regression back to
 * router-driven tab state (which always shows the SAME tab regardless of
 * clicks) is unambiguous.
 */
const STATS: GolfStats = {
  roundsPlayed: 20,
  holesPlayed: 360,
  scoringAverage: 74.5,
  avgScoreToPar: 2.5,
  bestRound: 70,
  worstRound: 82,
  scoringAverage18: 74.5,
  scoringAverage9: null,
  bestRound18: 70,
  bestRound9: null,
  worstRound18: 82,
  worstRound9: null,
  roundsPlayed18: 20,
  roundsPlayed9: 0,
  totalBirdies: 40,
  totalEagles: 1,
  totalPars: 200,
  totalBogeys: 100,
  totalDoublePlus: 19,
  birdiesPerRound: 2,
  eaglesPerRound: 0.05,
  parsPerRound: 10,
  bogeysPerRound: 5,
  doublePlusPerRound: 0.95,
  scoringByPar: {
    par3: { eagle: 0, birdie: 4, par: 30, bogey: 20, doublePlus: 6, total: 60, avgToPar: 0.3 },
    par4: { eagle: 0, birdie: 20, par: 100, bogey: 60, doublePlus: 20, total: 200, avgToPar: 0.35 },
    par5: { eagle: 1, birdie: 16, par: 60, bogey: 20, doublePlus: 3, total: 100, avgToPar: 0.1 },
  },
  practiceScoringAvg: null,
  practiceRounds: 0,
  qualifyingScoringAvg: null,
  qualifyingRounds: 0,
  tournamentScoringAvg: 74.5,
  tournamentRounds: 20,
  mostBirdiesRound: 4,
  mostBirdiesRow: 2,
  mostParsRow: 6,
  currentNo3PuttStreak: 5,
  longestNo3PuttStreak: 12,
  longestHoleOut: null,
  drivingDistanceAvg: 255,
  drivingDistanceDriverOnly: 265,
  drivingDistanceNonDriverOnly: 220,
  fairwaysHit: 140,
  fairwayOpportunities: 220,
  fairwayPercentage: 63.6,
  fairwayPctPar4: 60,
  fairwayPctPar5: 70,
  fairwayPctDriver: 62,
  fairwayPctNonDriver: 68,
  fairwaysHitPerRound: 7,
  missLeftCount: 40,
  missRightCount: 40,
  missLeftPct: 50,
  missRightPct: 50,
  missLeftPctDriver: 50,
  missRightPctDriver: 50,
  missLeftPctNonDriver: 50,
  missRightPctNonDriver: 50,
  girTotal: 220,
  girOpportunities: 360,
  girPercentage: 61.1,
  girPerRound: 11,
  girPctPar3: 55,
  girPctPar4: 60,
  girPctPar5: 70,
  girPct50_75: 75,
  girPct75_100: 70,
  girPct100_125: 65,
  girPct125_150: 60,
  girPct150_175: 55,
  girPct175_200: 50,
  girPct200_225: 45,
  girPct225Plus: 40,
  girPctFromFairway: 70,
  girPctFromRough: 45,
  girPctFromSand: 30,
  girCountFromFairway: 150,
  girCountFromRough: 60,
  approachMissShortPct: 30,
  approachMissLongPct: 20,
  approachMissLeftPct: 25,
  approachMissRightPct: 25,
  approachMissShortLeftPct: 10,
  approachMissShortRightPct: 10,
  approachMissLongLeftPct: 10,
  approachMissLongRightPct: 10,
  approachMissTotal: 140,
  approachMissByBand: {},
  totalPutts: 620,
  puttsPerRound: 31,
  puttsPerHole: 1.72,
  puttsPerGir: 1.8,
  threePuttsTotal: 15,
  threePuttsPerRound: 0.75,
  onePuttsTotal: 60,
  puttMakePct0_3: 99,
  puttMakePct3_5: 70,
  puttMakePct5_10: 40,
  puttMakePct10_15: 25,
  puttMakePct15_20: 15,
  puttMakePct20_25: 10,
  puttMakePct25_30: 6,
  puttMakePct30_35: 4,
  puttMakePct35Plus: 2,
  puttMakeCount0_3: 200,
  puttMakeCount3_5: 100,
  puttMakeCount5_10: 80,
  puttMakeCount10_15: 60,
  puttMakeCount15_20: 40,
  firstPuttDistanceAvg: 12,
  firstPuttDistanceByBand: {},
  approachPuttAvgLeave: 2.1,
  approachPuttAvgLeaveByBand: {},
  puttProximity0_5: 2,
  puttProximity5_10: 3,
  puttProximity10_15: 4,
  puttProximity15_20: 5,
  puttProximity20Plus: 6,
  puttEff0_5: 1.1,
  puttEff5_10: 1.4,
  puttEff10_15: 1.6,
  puttEff15_20: 1.8,
  puttEff20_25: 1.9,
  puttEff25_30: 1.95,
  puttEff30_35: 1.98,
  puttEff35Plus: 2.0,
  puttMissLeftPct: 45,
  puttMissRightPct: 55,
  puttMissShortPct: 60,
  puttMissLongPct: 40,
  puttMissLowPct: 48,
  puttMissHighPct: 52,
  puttingByBreak: {
    left_to_right: { ...EMPTY_BREAK_STATS, totalPutts: 150, overallMakePct: 42 },
    straight: { ...EMPTY_BREAK_STATS, totalPutts: 200, overallMakePct: 45 },
    right_to_left: { ...EMPTY_BREAK_STATS, totalPutts: 150, overallMakePct: 40 },
    multiple: { ...EMPTY_BREAK_STATS, totalPutts: 120, overallMakePct: 38 },
  },
  approachProximityAvg: 28,
  approachProximityWhenHitGreen: 22,
  approachProximityWhenMissedGreen: null,
  approachProximityPar3: 20,
  approachProximityPar4: 25,
  approachProximityPar5: 30,
  approachProximityFairway: 20,
  approachProximityRough: 30,
  approachProximitySand: 15,
  approachProx30_75: 15,
  approachProx75_100: 18,
  approachProx100_125: 20,
  approachProx125_150: 22,
  approachProx150_175: 25,
  approachProx175_200: 28,
  approachProx200_225: 32,
  approachProx225Plus: 40,
  approachEff30_75: EMPTY_APPROACH_EFF,
  approachEff75_100: EMPTY_APPROACH_EFF,
  approachEff100_125: EMPTY_APPROACH_EFF,
  approachEff125_150: EMPTY_APPROACH_EFF,
  approachEff150_175: EMPTY_APPROACH_EFF,
  approachEff175_200: EMPTY_APPROACH_EFF,
  approachEff200_225: EMPTY_APPROACH_EFF,
  approachEff225Plus: EMPTY_APPROACH_EFF,
  scrambleAttempts: 60,
  scramblesMade: 33,
  scramblingPercentage: 55,
  scramblingPctFairway: 60,
  scramblingPctRough: 50,
  scramblingPctSand: 45,
  scramblingPct0_10: 70,
  scramblingPct10_20: 50,
  scramblingPct20_30: 35,
  atgEfficiencyAvg: 2.3,
  atgEfficiency0_10: 2.1,
  atgEfficiency10_20: 2.4,
  atgEfficiency20_30: 2.6,
  atgEffFairway: 2.2,
  atgEffRough: 2.5,
  atgEffSand: 2.4,
  atgEffByDistanceLie: {},
  sandSaveAttempts: 20,
  sandSavesMade: 9,
  sandSavePercentage: 45,
  totalPenalties: 12,
  penaltiesPerRound: 0.6,
  strokesGainedTotal: 0.4,
  strokesGainedTee: 0.1,
  strokesGainedApproach: 0.2,
  strokesGainedAroundGreen: 0.05,
  strokesGainedPutting: 0.05,
  sgTeePerRound: 0.1,
  sgApproachPerRound: 0.2,
  sgAroundGreenPerRound: 0.05,
  sgPuttingPerRound: 0.05,
  sgTotalPerRound: 0.4,
};

const TREND: TrendAnalysisResponse = {
  rounds: [],
  trends: { score: [], gir: [], fairway: [], putts: [] },
  rollingAverages: { score5: [], score10: [], score20: [] },
  periodComparison: {
    last30Days: { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null },
    previous30Days: { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null },
  },
  personalBests: { bestScore: null, bestToPar: null, bestGir: null, lowestPutts: null },
};

const EMPTY_SHOT_GROUP = {
  family: 'driving' as const,
  totalShots: 0,
  plottedShots: 0,
  averageForwardDistance: null,
  averageRemainingDistance: null,
  playableCount: 0,
  troubleCount: 0,
  penaltyCount: 0,
  dominantSector: null,
  points: [],
  summaryBands: [],
};

const SPRAY: SprayChartResponse = {
  driving: { ...EMPTY_SHOT_GROUP, family: 'driving' },
  approach: { ...EMPTY_SHOT_GROUP, family: 'approach' },
  scope: { roundId: 'overall', roundsIncluded: 20, filterApplied: false },
};

/** Each tab's distinguishing, synchronously-rendered heading — real content
 *  owned by that tab and nowhere else (never behind a lazy chart import, so
 *  no extra `waitFor` tick is needed to see it). */
const TAB_MARKERS: ReadonlyArray<{ trigger: string; heading: string }> = [
  { trigger: 'Scoring', heading: 'Scoring trend' },
  { trigger: 'Driving', heading: 'Off the tee' },
  { trigger: 'Approach', heading: 'Approach & greens' },
  { trigger: 'Putting', heading: 'Putting breakdowns' },
  { trigger: 'Scrambling', heading: 'Short game & scrambling' },
  { trigger: 'Strokes Gained', heading: 'Where you win & lose strokes' },
  { trigger: 'Analysis', heading: 'Trends & personal bests' },
];

describe('FairwayStatsCockpit — tab switching (audit W4)', () => {
  it('shows every tab its OWN content instantly, never a stuck previous tab', async () => {
    const user = userEvent.setup();
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    render(<FairwayStatsCockpit playerId="player-1" />);

    // Initial data load is a real (mocked) async fetch — wait for it once.
    const scoringHeading = await screen.findByText('Scoring trend');
    expect(scoringHeading).toBeInTheDocument();

    // Only ONE tabpanel exists at a time (Radix unmounts inactive panels) —
    // Scoring's own content must not leak any other tab's marker text.
    for (const other of TAB_MARKERS.filter((t) => t.trigger !== 'Scoring')) {
      expect(screen.queryByText(other.heading)).not.toBeInTheDocument();
    }

    for (const { trigger, heading } of TAB_MARKERS) {
      // Sequential tab clicks, each asserted before the next — intentional.
      await user.click(screen.getByRole('tab', { name: trigger }));

      // No `waitFor` / extra tick: the switch must be visible on the very
      // next render, proving it is local state, not a pending navigation.
      const panel = screen.getByRole('tabpanel');
      expect(within(panel).getByText(heading)).toBeInTheDocument();

      // Every OTHER tab's marker must be gone — the previous tab's content
      // must never stay stuck on screen once a new tab is clicked.
      for (const other of TAB_MARKERS.filter((t) => t.heading !== heading)) {
        expect(screen.queryByText(other.heading)).not.toBeInTheDocument();
      }
    }

    // The URL still gets kept in sync for deep-linking/sharing — just via
    // history.replaceState (no Next.js router navigation) so it never pays
    // for a Server Component round trip.
    expect(replaceStateSpy).toHaveBeenCalled();
    const lastCallUrl = String(replaceStateSpy.mock.calls.at(-1)?.[2] ?? '');
    expect(lastCallUrl).toContain('tab=analysis');
  });
});
