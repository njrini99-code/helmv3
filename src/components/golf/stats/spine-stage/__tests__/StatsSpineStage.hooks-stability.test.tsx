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
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StatsSpineStage, coldStartCopy } from '../StatsSpineStage';
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

const getPlayerRoundOptions = vi.fn();

// The scope-picker round list (StatsSpineStage.tsx:192) is a SEPARATE fetch
// from the stats bundle above — loaded in its own effect, independent of
// `getPlayerStatsDashboardBundle`. Left unmocked, it falls through to the
// real `stats-data.ts` implementation, which does a live env-var-dependent
// Supabase read — a race under CI load, not a jsdom-safe stub (#1484).
vi.mock('@/app/golf/actions/stats-data', () => ({
  getPlayerRoundOptions: (...args: unknown[]) => getPlayerRoundOptions(...args),
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
      windowDays: 30,
      last30Days: { roundCount: 6, scoringAvg: 74, girPct: 58, fairwayPct: 62, puttsPerRound: 30 },
      previous30Days: { roundCount: 6, scoringAvg: 75, girPct: 55, fairwayPct: 60, puttsPerRound: 31 },
    },
    personalBests: { bestScore: null, longestDrive: null, mostBirdies: null } as never,
  } as unknown as TrendAnalysisResponse;
}

/**
 * The production action always returns a complete group, including the empty
 * points and sector arrays. Keep the stage fixture truthful: the Driving and
 * Approach drills render SprayField even when nothing is plotted.
 */
function fixtureEmptySprayGroup(family: 'driving' | 'approach') {
  return {
    family,
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
}

function mockHealthyBundle() {
  getPlayerStatsDashboardBundle.mockResolvedValue(healthyBundle());
}

function healthyBundle() {
  return {
    detailed: ok(fixtureStats()),
    trend: ok(fixtureTrend()),
    standing: ok({ success: true, data: fixtureStanding() }),
    leak: ok({
      success: true,
      data: { playerId: 'p-1', putting: [], approach: [], roundsIncluded: 6 },
    }),
    spray: ok({
      driving: fixtureEmptySprayGroup('driving'),
      approach: fixtureEmptySprayGroup('approach'),
      scope: { roundId: 'overall', roundsIncluded: 12, filterApplied: false },
    }),
    strengthsWeaknesses: ok({ strengths: [], weaknesses: [] }),
    worstHoles: ok({ holes: [], worstHoles: [], bestHoles: [], par3Average: null, par4Average: null, par5Average: null, closingHolesAverage: null }),
    patterns: ok({ success: true, patterns: [] }),
  };
}

/** Every real `?area=` stage view StatsSpineStage registers (buildStatsViewModel.ts's StatsArea union + 'home'). */
/**
 * How long an async lookup waits for a re-render to land.
 *
 * Testing Library's default is 1s, which is generous locally and not generous
 * enough in CI: the area cycle below drives ~28 lookups through a full
 * StageRouter re-render, and on 2026-07-25 the back-chip lookup lost that race
 * on a shared runner while passing every time locally. This test asserts that
 * hooks order survives an update — it asserts nothing about how fast the
 * update arrives — so a one-second wall-clock budget is the wrong thing for it
 * to fail on. The same race was patched once before in #1043 by switching
 * these lookups from sync to async; the budget is the half that was left.
 */
const FIND_TIMEOUT_MS = 15_000;

/**
 * Find the DrillPanel's "Home"/"All areas" back chip, and say what the stage
 * ACTUALLY shows when it is not there.
 *
 * #1484's complaint is not that this test is flaky — it is that when it fails
 * it blames the wrong thing. On 2026-08-17 it reddened main on `80472667a`
 * (Pacific/Kiritimati shard 2, 15,449ms) with:
 *
 *     TestingLibraryElementError: Unable to find role="button" and
 *     name `/home|all areas/i`
 *
 * That names the symptom. Whether the drill never mounted, mounted and
 * re-rendered back to home, or simply lost the wall-clock race under a
 * four-shard-by-two-zone CI fan-out is invisible from it — and those want
 * different fixes. Failing with the stage's own headings and button names
 * attached makes the next occurrence diagnosable from the log alone, without
 * reproducing a load condition that does not exist locally (this file passes in
 * ~4s here and burned its entire 15s budget on ONE lookup there).
 *
 * The assertion is unchanged: the chip must still be found. Only the failure
 * message is richer.
 *
 * Scoped to `stage`, not `screen` (2026-09-23, ci-flakes): the back chip only
 * ever renders inside a drill's `DrillPanel`, which only ever mounts inside
 * `<div data-slot="stage">` (StageRouter.tsx) — it can never appear anywhere
 * else in the document. `findByRole` polls via a MutationObserver + interval,
 * re-querying its ENTIRE search root's accessibility tree on every DOM
 * mutation until it matches; an unscoped `screen.findByRole` re-scans the
 * whole `document.body` — the spine's own BentoCell grid, every drill's own
 * interactive content (charts, chips, tooltips) — on every one of those
 * re-checks, for a lookup that could only ever match inside `stage`. Under
 * real CI load (a four-shard-by-two-zone runner, per the comment above) that
 * extra traversal work is exactly the kind of cost that turns a few hundred
 * fast local polls into ones slow enough to blow a wall-clock budget. Scoping
 * to `stage` cuts every poll down to the one subtree that could ever contain
 * a match, with no change to what is asserted (same role, same name, same
 * required element).
 */
async function findBackChip(stage: HTMLElement): Promise<HTMLElement> {
  try {
    return await within(stage).findByRole(
      'button',
      { name: /home|all areas/i },
      { timeout: FIND_TIMEOUT_MS },
    );
  } catch (err) {
    const headings = Array.from(stage.querySelectorAll('h1, h2, h3'))
      .map((h) => h.textContent?.trim())
      .filter(Boolean);
    const buttons = within(stage)
      .queryAllByRole('button')
      .map((b) => b.textContent?.trim().slice(0, 40))
      .filter(Boolean);
    throw new Error(
      `Back chip (/home|all areas/i) not found within ${FIND_TIMEOUT_MS}ms.\n` +
        `Stage mounted: yes\n` +
        `Stage headings: ${headings.length ? headings.join(' | ') : '(none)'}\n` +
        `Buttons in stage (${buttons.length}): ${buttons.join(' | ') || '(none)'}\n` +
        `Original: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

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

// The per-lookup budget above is worthless if the test itself is killed first:
// the area cycle drives eight views through open → home → re-open, and one slow
// re-render on a shared runner can exceed the 5s default on its own.
describe('StatsSpineStage — hooks-order stability across ?area= switches', { timeout: 60_000 }, () => {
  beforeEach(() => {
    getPlayerStatsDashboardBundle.mockReset();
    mockHealthyBundle();
    getPlayerRoundOptions.mockReset();
    getPlayerRoundOptions.mockResolvedValue([]);
    window.history.replaceState({}, '', '/golf/dashboard/stats');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/golf/dashboard/stats');
  });

  it('mounts past cold-start into the real StageRouter + StatsBento home view', async () => {
    render(<StatsSpineStage playerId="p-1" />);

    expect(await screen.findByText('Core ball striking')).toBeInTheDocument();
  });

  it('loads a qualifier as a coach-adjustable multi-round scope', async () => {
    getPlayerRoundOptions.mockResolvedValue([
      {
        id: 'qualifier-1',
        date: '2026-07-01',
        courseName: 'North Course',
        totalScore: 72,
        roundType: 'qualifier',
        qualifierId: 'fall-qualifier',
        qualifierName: 'Fall qualifier',
        qualifierRoundNumber: 1,
      },
      {
        id: 'qualifier-2',
        date: '2026-07-08',
        courseName: 'South Course',
        totalScore: 74,
        roundType: 'qualifier',
        qualifierId: 'fall-qualifier',
        qualifierName: 'Fall qualifier',
        qualifierRoundNumber: 2,
      },
    ]);

    render(<StatsSpineStage playerId="p-1" />);
    await screen.findByText('Core ball striking');

    // DASH-07 (changed on purpose): "All rounds", the qualifier presets and
    // "Choose rounds…" are ONE Select named by its "Stats for" label; the
    // per-round Combobox only appears once a round set is in scope.
    expect(screen.queryByRole('combobox', { name: 'Select rounds for stats' })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Stats for' }));
    await user.click(await screen.findByRole('option', { name: 'Fall qualifier · 2 rounds' }));

    await waitFor(() => {
      expect(getPlayerStatsDashboardBundle).toHaveBeenLastCalledWith('p-1', ['qualifier-1', 'qualifier-2']);
    });
    expect(await screen.findByText('Selected-round stats')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove 7\/1\/26 · north course/i }));
    await waitFor(() => {
      expect(getPlayerStatsDashboardBundle).toHaveBeenLastCalledWith('p-1', ['qualifier-2']);
    });
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
      const matches = await within(stage as HTMLElement).findAllByText(text, undefined, {
        timeout: FIND_TIMEOUT_MS,
      });
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
      // `expectStageShows` can resolve while the home Bento grid is still
      // mounted (the area label lives on its own cell too), so it is NOT a
      // reliable "navigation finished" signal. Await the back chip itself —
      // it only exists inside a drill's DrillPanel — otherwise a synchronous
      // lookup here races the click's re-render under CI load.
      const backChip = await findBackChip(stage as HTMLElement);
      fireEvent.click(backChip);
      await expectStageShows('Core ball striking');

      // Re-open the same area a second time (open -> home -> open) to also
      // cover a REPEATED update on the same key, not just a first visit.
      const cellAgain = screen.getAllByRole('button').find((btn) => btn.textContent?.includes(AREA_HEADING[area]));
      fireEvent.click(cellAgain!);
      await expectStageShows(AREA_HEADING[area]);
      fireEvent.click(await findBackChip(stage as HTMLElement));
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

  it('PERF-R11: a player switch loads the new player once, in the career scope', async () => {
    getPlayerRoundOptions.mockResolvedValue([
      {
        id: 'qualifier-1',
        date: '2026-07-01',
        courseName: 'North Course',
        totalScore: 72,
        roundType: 'qualifier',
        qualifierId: 'fall-qualifier',
        qualifierName: 'Fall qualifier',
        qualifierRoundNumber: 1,
      },
    ]);
    const { rerender } = render(<StatsSpineStage playerId="p-1" />);
    await screen.findByText('Core ball striking');

    // Put p-1 into a round-set scope first, so a stale scope is available to leak.
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Stats for' }));
    await user.click(await screen.findByRole('option', { name: 'Fall qualifier · 1 round' }));
    await waitFor(() => {
      expect(getPlayerStatsDashboardBundle).toHaveBeenLastCalledWith('p-1', ['qualifier-1']);
    });

    getPlayerStatsDashboardBundle.mockClear();
    rerender(<StatsSpineStage playerId="p-2" />);
    await screen.findByText('Core ball striking');

    const p2Calls = getPlayerStatsDashboardBundle.mock.calls.filter(([id]) => id === 'p-2');
    expect(p2Calls).toEqual([['p-2', 'overall']]);
    // Never a read of the new player with the previous player's round set.
    expect(getPlayerStatsDashboardBundle).not.toHaveBeenCalledWith('p-2', ['qualifier-1']);
  });

  it('PERF-R3: an older, slower response never overwrites the newer one', async () => {
    getPlayerStatsDashboardBundle.mockReset();
    let resolveSlow: ((v: unknown) => void) | null = null;
    // First load (p-1) hangs; the second (p-2) answers immediately with data
    // whose cold-start copy differs, so a late p-1 answer would be visible.
    getPlayerStatsDashboardBundle.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSlow = resolve; }),
    );
    const { rerender } = render(<StatsSpineStage playerId="p-1" />);
    await waitFor(() => expect(resolveSlow).not.toBeNull());

    getPlayerStatsDashboardBundle.mockResolvedValueOnce({
      detailed: ok(fixtureStats({ roundsPlayed: 0 })),
      trend: ok(fixtureTrend()),
      standing: ok({ success: true, data: [] }),
      leak: ok({ success: true, data: { playerId: 'p-2', putting: [], approach: [], roundsIncluded: 0 } }),
      spray: ok(null),
      strengthsWeaknesses: ok({ strengths: [], weaknesses: [] }),
      worstHoles: ok(null),
      patterns: ok({ success: true, patterns: [] }),
    });
    rerender(<StatsSpineStage playerId="p-2" isOwnStats />);
    expect((await screen.findAllByText('Log your first round')).length).toBeGreaterThan(0);

    // The stale p-1 response lands last. It must be dropped.
    await act(async () => {
      resolveSlow!(healthyBundle());
    });
    expect(screen.queryByText('Core ball striking')).toBeNull();
    expect(screen.getAllByText('Log your first round').length).toBeGreaterThan(0);
  });
});

describe('StatsSpineStage — PERF-R10 critical/deferred seed', () => {
  const deferredPart = { ok: false as const, reason: 'deferred' as const };
  function criticalOnly() {
    const full = healthyBundle();
    return {
      ...full,
      leak: deferredPart,
      spray: deferredPart,
      strengthsWeaknesses: deferredPart,
      worstHoles: deferredPart,
      patterns: deferredPart,
    };
  }

  beforeEach(() => {
    getPlayerStatsDashboardBundle.mockReset();
    mockHealthyBundle();
    getPlayerRoundOptions.mockReset();
    getPlayerRoundOptions.mockResolvedValue([]);
  });

  it('paints the critical half at once and fills the deferred half without a client read', async () => {
    let resolveDeferred: ((v: ReturnType<typeof healthyBundle>) => void) | null = null;
    const deferred = new Promise<ReturnType<typeof healthyBundle>>((resolve) => {
      resolveDeferred = resolve;
    });
    render(
      <StatsSpineStage
        playerId="p-1"
        initialData={{ playerId: 'p-1', bundle: criticalOnly() as never, roundOptions: [], deferred: deferred as never }}
      />,
    );
    // The spine renders from the critical half; a pending part is not an error.
    expect(await screen.findByText('Core ball striking')).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load stats/)).toBeNull();
    await act(async () => {
      resolveDeferred!(healthyBundle());
    });
    expect(getPlayerStatsDashboardBundle).not.toHaveBeenCalled();
  });

  it('fetches the whole bundle when the deferred half failed on the server', async () => {
    render(
      <StatsSpineStage
        playerId="p-1"
        initialData={{ playerId: 'p-1', bundle: criticalOnly() as never, roundOptions: [], deferred: Promise.resolve(null) }}
      />,
    );
    await waitFor(() => expect(getPlayerStatsDashboardBundle).toHaveBeenCalledWith('p-1', 'overall'));
  });
});

describe('coldStartCopy (STATE-01, STATE-02)', () => {
  it('asks a player with zero rounds to log their FIRST round, not "5+"', () => {
    const copy = coldStartCopy({ isOwnStats: true, roundsLogged: 0 });
    expect(copy.title).toBe('Log your first round');
    expect(copy.description).not.toMatch(/5\+/);
  });

  it('keeps "More rounds needed" once rounds exist, and says how many', () => {
    const copy = coldStartCopy({ isOwnStats: true, roundsLogged: 2 });
    expect(copy.title).toBe('More rounds needed');
    expect(copy.description).toContain('2 logged so far');
  });

  it('gives a coach coach-directed copy and a message action', () => {
    const copy = coldStartCopy({ isOwnStats: false, playerName: 'Cole Ruff', roundsLogged: 0 });
    expect(copy.title).toBe('Cole has not logged a round yet');
    expect(copy.actionLabel).toBe('Message Cole to log a first round');
  });
});
