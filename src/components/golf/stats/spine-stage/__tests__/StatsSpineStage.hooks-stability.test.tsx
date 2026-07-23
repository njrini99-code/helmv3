// @vitest-environment jsdom
/**
 * ============================================================================
 * StatsSpineStage — hooks-order stability across `?area=` tab switches
 * ----------------------------------------------------------------------------
 * Regression coverage for the prod React #310 "Rendered more hooks than
 * during the previous render" crash reported on /golf/dashboard/stats,
 * /stats/team, /players/[id], /coachhelm, /my-development, /my-standing, and
 * /hub (Sentry helm-xs JAVASCRIPT-NEXTJS-CN). The LIVE-QA note for that crash
 * was "EVERY ?area= tab renders nothing below the ViewHeader" — i.e. the
 * whole StatsSpineStage tree unmounts. This test exercises the REAL
 * `StageRouter` + REAL per-area Drill components (StatsBento, PuttingDrill,
 * DrivingDrill, ApproachDrill, ShortGameDrill, ScoringDrill, StandingDrill,
 * RoundsDrill) — nothing is stubbed out — and cycles through every area
 * (including round-tripping back to `home`) on the SAME mounted instance,
 * which is exactly the scenario that trips a hooks-order mismatch (a hook
 * called conditionally/after an early return only shows up on an UPDATE of
 * an already-mounted fiber, never on a fresh mount).
 *
 * A hooks-order violation throws synchronously during render, so `render()`/
 * `fireEvent.click()` re-throwing is enough to fail this test with no extra
 * assertions required — but we also pin that real content renders at every
 * stop (an error-boundary-swallowed crash would otherwise read as a false
 * pass here, matching the "renders nothing below the ViewHeader" symptom).
 * ========================================================================== */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StatsSpineStage } from '../StatsSpineStage';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';

const getPlayerStatsDashboardBundle = vi.fn();

vi.mock('@/app/golf/actions/stats-dashboard', () => ({
  getPlayerStatsDashboardBundle: (...args: unknown[]) => getPlayerStatsDashboardBundle(...args),
}));

// StatsSpineStage imports `getPlayerPatterns` only for its return TYPE
// (`ReturnType<typeof getPlayerPatterns>`), but it is a real value import at
// runtime — the module pulls in server-only Supabase wiring, so it must be
// stubbed for a jsdom render the same way the bundle action is.
vi.mock('@/app/golf/actions/insights', () => ({
  getPlayerPatterns: vi.fn(),
}));

const ok = <T,>(value: T) => ({ ok: true as const, value });

function fixtureStats(overrides: Partial<GolfStats> = {}): GolfStats {
  return {
    roundsPlayed: 12,
    holesPlayed: 216,
    scoringAverage: 74.2,
    avgScoreToPar: 2.2,
    bestRound: 70,
    worstRound: 79,
    scoringAverage18: 74.2,
    scoringAverage9: null,
    bestRound18: 70,
    bestRound9: null,
    worstRound18: 79,
    worstRound9: null,
    roundsPlayed18: 12,
    roundsPlayed9: 0,
    totalBirdies: 24,
    totalEagles: 1,
    totalPars: 120,
    totalBogeys: 60,
    totalDoublePlus: 12,
    birdiesPerRound: 2,
    eaglesPerRound: 0.1,
    parsPerRound: 10,
    bogeysPerRound: 5,
    doublePlusPerRound: 1,
    scoringByPar: {
      par3: { avgToPar: 0.3, count: 36 },
      par4: { avgToPar: 0.2, count: 108 },
      par5: { avgToPar: 0.1, count: 72 },
    },
    practiceScoringAvg: null,
    practiceRounds: 0,
    qualifyingScoringAvg: null,
    qualifyingRounds: 0,
    tournamentScoringAvg: 74.2,
    tournamentRounds: 12,
    mostBirdiesRound: 4,
    mostBirdiesRow: 2,
    mostParsRow: 6,
    currentNo3PuttStreak: 3,
    longestNo3PuttStreak: 10,
    longestHoleOut: null,
    drivingDistanceAvg: 265,
    drivingDistanceDriverOnly: 270,
    drivingDistanceNonDriverOnly: 240,
    fairwayPercentage: 62,
    fairwayPctPar4: 60,
    fairwayPctPar5: 65,
    fairwayHits: 90,
    fairwayAttempts: 145,
    girPercentage: 58,
    girPctPar3: 50,
    girPctPar4: 55,
    girHits: 100,
    girAttempts: 172,
    scramblingPercentage: 45,
    sandSavePercentage: 40,
    puttsPerRound: 30,
    totalPutts: 360,
    holesWithPutts: 216,
    puttMakePct0_3: 92,
    puttMakePct5_10: 35,
    puttMakePct15_20: 15,
    truncated: false,
    ...overrides,
  } as unknown as GolfStats;
}

function fixtureStanding(): PlayerStandingRow[] {
  const row = (metric_id: string, player_value: number): PlayerStandingRow => ({
    metric_id,
    player_value,
    team_avg: player_value - 0.1,
    team_n: 8,
    team_pct: 55,
    pga_value: 0,
    pga_delta: player_value,
  });
  return [
    row('sg_total', -0.4),
    row('sg_ott', 0.1),
    row('sg_approach', -0.3),
    row('sg_around_green', 0.05),
    row('sg_putting', -0.2),
  ];
}

function fixtureTrend(): TrendAnalysisResponse {
  return {
    rounds: [{ id: 'r-1', date: '2026-07-01', score: 74, toPar: 2 } as never],
    trends: { score: [], gir: [], fairway: [], putts: [] },
    rollingAverages: { score5: [], score10: [], score20: [] },
    periodComparison: {
      last30Days: { roundCount: 6, scoringAvg: 74, girPct: 58, fairwayPct: 62, puttsPerRound: 30 },
      previous30Days: { roundCount: 6, scoringAvg: 75, girPct: 55, fairwayPct: 60, puttsPerRound: 31 },
    },
    personalBests: { bestScore: null, longestDrive: null, mostBirdies: null } as never,
  } as unknown as TrendAnalysisResponse;
}

function mockHealthyBundle() {
  getPlayerStatsDashboardBundle.mockResolvedValue({
    detailed: ok(fixtureStats()),
    trend: ok(fixtureTrend()),
    standing: ok({ success: true, data: fixtureStanding() }),
    leak: ok({
      success: true,
      data: { playerId: 'p-1', putting: [], approach: [], roundsIncluded: 6 },
    }),
    spray: ok({ shots: [] }),
    strengthsWeaknesses: ok({ strengths: [], weaknesses: [] }),
    worstHoles: ok({ holes: [], worstHoles: [], bestHoles: [], par3Average: null, par4Average: null, par5Average: null, closingHolesAverage: null }),
    patterns: ok({ success: true, patterns: [] }),
  });
}

/** Every real `?area=` stage view StatsSpineStage registers (buildStatsViewModel.ts's StatsArea union + 'home'). */
const AREAS = ['home', 'putting', 'driving', 'approach', 'short-game', 'scoring', 'standing', 'rounds'] as const;

const AREA_HEADING: Record<(typeof AREAS)[number], string> = {
  home: 'Core ball striking',
  putting: 'Putting',
  driving: 'Off the tee',
  approach: 'Approach',
  'short-game': 'Short game',
  scoring: 'Scoring',
  standing: 'Standing',
  rounds: 'Last 10 rounds',
};

describe('StatsSpineStage — hooks-order stability across ?area= switches', () => {
  beforeEach(() => {
    getPlayerStatsDashboardBundle.mockReset();
    mockHealthyBundle();
    window.history.replaceState({}, '', '/golf/dashboard/stats');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/golf/dashboard/stats');
  });

  it('mounts past cold-start into the real StageRouter + StatsBento home view', async () => {
    render(<StatsSpineStage playerId="p-1" />);

    expect(await screen.findByText('Core ball striking')).toBeInTheDocument();
  });

  it('cycles through every real area view (and back home) on ONE mounted instance without a hooks-order crash', async () => {
    render(<StatsSpineStage playerId="p-1" />);
    await screen.findByText('Core ball striking');

    const stage = document.querySelector('[data-slot="stage"]');
    expect(stage).not.toBeNull();

    // Some area labels (e.g. "Putting") appear more than once inside a
    // drill's own content (a BentoCell label reused as body copy, a chip,
    // etc.), so assert presence via `findAllByText` rather than requiring a
    // single unique match.
    const expectStageShows = async (text: string) => {
      const matches = await within(stage as HTMLElement).findAllByText(text);
      expect(matches.length).toBeGreaterThan(0);
    };

    // Forward: home -> putting -> driving -> approach -> short-game -> scoring
    // -> standing -> rounds, each via a real BentoCell `onOpen` click (the
    // same `stage.open('<area>')` path a production user drives). Every one
    // of these is a genuine UPDATE re-render of the SAME StageRouter/
    // StatsSpineStage fiber — exactly the condition under which a hooks-order
    // mismatch (never a fresh mount) throws.
    for (const area of AREAS.slice(1)) {
      const cell = screen.getAllByRole('button').find((btn) => btn.textContent?.includes(AREA_HEADING[area]));
      expect(cell, `expected a BentoCell/back-chip labeled "${AREA_HEADING[area]}" to open the ${area} drill`).toBeTruthy();
      fireEvent.click(cell!);
      await expectStageShows(AREA_HEADING[area]);

      // Every drill's DrillPanel exposes a "Home"/"All areas" back chip wired
      // to `useStage().home()` — round-trip through it so `home` is re-mounted
      // as an UPDATE too (not just the initial mount at the top of this test).
      const backChip = screen.getByRole('button', { name: /home|all areas/i });
      fireEvent.click(backChip);
      await expectStageShows('Core ball striking');

      // Re-open the same area a second time (open -> home -> open) to also
      // cover a REPEATED update on the same key, not just a first visit.
      const cellAgain = screen.getAllByRole('button').find((btn) => btn.textContent?.includes(AREA_HEADING[area]));
      fireEvent.click(cellAgain!);
      await expectStageShows(AREA_HEADING[area]);
      fireEvent.click(screen.getByRole('button', { name: /home|all areas/i }));
      await expectStageShows('Core ball striking');
    }
  });

  it('re-renders cleanly across a loading -> loaded -> retry-after-error transition (loadAll re-invoked on the SAME instance)', async () => {
    getPlayerStatsDashboardBundle.mockReset();
    getPlayerStatsDashboardBundle.mockRejectedValueOnce(new Error('network blip'));

    render(<StatsSpineStage playerId="p-1" />);

    expect(await screen.findByText("Couldn't load stats")).toBeInTheDocument();

    mockHealthyBundle();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // The SAME component instance now transitions loading -> loaded with a
    // fully different render branch (error state -> real StageRouter tree) —
    // another update-render pair that must call the same hooks in the same
    // order for React not to throw #310.
    expect(await screen.findByText('Core ball striking')).toBeInTheDocument();
  });
});
