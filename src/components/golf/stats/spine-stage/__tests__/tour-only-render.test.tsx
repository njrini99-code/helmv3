// @vitest-environment jsdom
/**
 * ============================================================================
 * Golf stats screens — Tour only (owner decision Q-93)
 * ----------------------------------------------------------------------------
 * "Change it all to PGA moving forward": no golf stats screen renders a D1 /
 * division / college / NCAA benchmark, target, column, verdict or footnote, and
 * every Tour reference is labelled by the team's gender: the PGA Tour for a
 * men's team, the LPGA Tour for a women's team (never "PGA Tour").
 *
 * This is a RENDER test, not a source grep: it mounts the real benchmark sheet,
 * bento, Putting / Approach / Short game / Standing drills and the team board
 * with representative stats, opens every tab, and checks the text a user would
 * read. Every surface also asserts an anchor string first, so the negative
 * checks cannot pass against an empty render.
 *
 * Fixture team names are neutral on purpose: a real team can be called
 * "Guilford College", and that user-entered name is not a benchmark.
 * ========================================================================== */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/fairway/modules', async () => {
  const actual = await vi.importActual<typeof import('@/components/fairway/modules')>(
    '@/components/fairway/modules',
  );
  return { ...actual, useStage: () => ({ open: vi.fn(), home: vi.fn() }) };
});

import { StatsBento } from '../StatsBento';
import { PuttingDrill } from '../PuttingDrill';
import { ApproachDrill } from '../ApproachDrill';
import { ShortGameDrill } from '../ShortGameDrill';
import { StandingDrill } from '../StandingDrill';
import { PuttingBenchmarkSheet } from '../PuttingBenchmarkSheet';
import { TeamStatsBoard } from '@/components/golf/stats/team-board/TeamStatsBoard';
import { generateStatisticalStrengthsWeaknesses } from '@/lib/golf/strokes-gained';
import type { TourKey } from '@/lib/golf/benchmarks/tour';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type {
  LeakBucket,
  PlayerLeakMaps,
  PlayerStandingRow,
  TeamLeakMaps,
} from '@/app/golf/actions/stats-leak-maps-types';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

/** What no golf stats screen may say any more. */
const NOT_DIVISION = /\bD[123]\b|division|college|NCAA/i;
/** Any PGA reference that is not the tail of "LPGA". */
const MENS_TOUR = /(?<!L)PGA/;

afterEach(() => cleanup());

// ── fixtures ────────────────────────────────────────────────────────────────

function fixtureStats(): GolfStats {
  return {
    roundsPlayed: 12,
    holesPlayed: 216,
    scoringAverage: 76.2,
    // putting
    puttsPerRound: 31,
    puttsPerHole: 1.72,
    puttsPerGir: 1.85,
    threePuttsPerRound: 1.1,
    onePuttsTotal: 60,
    approachPuttAvgLeave: 3.4,
    puttMakePct0_3: 96,
    puttMakeCount0_3: 70,
    puttMakePct3_5: 68,
    puttMakeCount3_5: 40,
    puttMakePct5_10: 38,
    puttMakeCount5_10: 50,
    puttMakePct10_15: 22,
    puttMakeCount10_15: 36,
    puttMakePct15_20: 14,
    puttMakeCount15_20: 20,
    puttMakePct20_25: 9,
    puttMakePct25_30: 6,
    puttMakePct30_35: 4,
    puttMakePct35Plus: 2,
    firstPuttDistanceByBand: {},
    approachPuttAvgLeaveByBand: {},
    puttEff0_5: 1.2,
    puttEff5_10: 1.5,
    puttProximity0_5: 1.1,
    // approach
    girPercentage: 55,
    girPerRound: 9.9,
    approachProximityAvg: 38,
    approachProximityWhenHitGreen: 24,
    approachProximityWhenMissedGreen: 52,
    girPct50_75: 78,
    girPct75_100: 70,
    girPctFromFairway: 62,
    girPctFromRough: 38,
    girPctFromSand: 25,
    approachMissShortPct: 33,
    approachMissLongPct: 22,
    approachMissLeftPct: 25,
    approachMissRightPct: 20,
    approachMissTotal: 44,
    approachEff30_75: { fairway: 2.3, rough: 3.4, sand: 2.7 },
    approachProx30_75: 20,
    approachMissByBand: { '30_75': { short: 10, long: 5, left: 40, right: 45, total: 12 } },
    // short game
    scramblingPercentage: 48,
    scrambleAttempts: 70,
    scramblesMade: 34,
    scramblingPctFairway: 58,
    scramblingPctRough: 46,
    scramblingPctSand: 38,
    scramblingPctFringe: 52,
    scramblingPct0_10: 66,
    scramblingPct10_20: 48,
    scramblingPct20_30: 31,
    sandSavePercentage: 38,
    sandSaveAttempts: 16,
    sandSavesMade: 6,
    penaltiesPerRound: 0.9,
    atgEfficiencyAvg: 2.4,
    atgEfficiency0_10: 2.1,
    atgEfficiency10_20: 2.5,
    atgEfficiency20_30: 2.9,
    atgEffFairway: 2.3,
    atgEffRough: 2.5,
    atgEffSand: 2.7,
    atgEffByDistanceLie: {
      '0_10': { fairway: 2.1, rough: 2.2, sand: 2.3 },
      '10_20': { fairway: 2.4, rough: 2.5, sand: 2.6 },
      '20_30': { fairway: 2.7, rough: 2.8, sand: 2.9 },
    },
    scramblingByMissDirection: {
      short: { attempts: 10, made: 7, pct: 70, shareOfMisses: 50 },
      long: { attempts: 6, made: 2, pct: 33, shareOfMisses: 30 },
    },
    scrambleFairwayAttempts: 20,
    scrambleRoughAttempts: 22,
    scrambleSandAttempts: 16,
    scrambleFringeAttempts: 12,
    atgProximityAvg: 7,
    atgProximityByLie: { fairway: 5.4, rough: 7.1, sand: 8.2 },
    // scoring
    avgScoreToPar: 4.2,
    scoringByPar: {
      par3: { avgToPar: 0.2 },
      par4: { avgToPar: 0.4 },
      par5: { avgToPar: 0.1 },
    },
    totalDoublePlus: 24,
    doublePlusPerRound: 2,
    birdiesPerRound: 2.1,
    fairwayPercentage: 54,
    sgTeePerRound: -0.2,
    sgApproachPerRound: -1.1,
    sgAroundGreenPerRound: -0.4,
    sgPuttingPerRound: -0.9,
  } as unknown as GolfStats;
}

/** Standing rows carrying the Tour make-rate standards for the team's tour. */
function standingRows(tour: TourKey): PlayerStandingRow[] {
  const isWomens = tour === 'lpga';
  const pga =
    tour === 'lpga'
      ? { '3_5': 86, '5_10': 55, '10_15': 30, '15_25': 12, '25_plus': 5 }
      : { '3_5': 90.5, '5_10': 62.2, '10_15': 35.7, '15_25': 15.4, '25_plus': 5.5 };
  const row = (metric_id: string, player_value: number, pga_value: number): PlayerStandingRow => ({
    metric_id,
    player_value,
    team_avg: null,
    team_n: 0,
    team_pct: null,
    pga_value,
    pga_delta: null,
    is_womens: isWomens,
  });
  return [
    row('sg_total', -0.6, 0),
    row('sg_ott', -0.2, 0),
    row('sg_approach', -1.1, 0),
    row('sg_around_green', -0.4, 0),
    row('sg_putting', -0.9, 0),
    row('putts_made_3_5ft_pct', 68, pga['3_5']),
    row('putts_made_5_10ft_pct', 38, pga['5_10']),
    row('putts_made_10_15ft_pct', 22, pga['10_15']),
    row('putts_made_15_25ft_pct', 12, pga['15_25']),
    row('putts_made_25_plus_ft_pct', 5, pga['25_plus']),
    row('gir_pct', 55, tour === 'lpga' ? 70 : 66),
  ];
}

function bucket(bucket_id: string, label: string, team_value: number | null, pga_value: number | null, sample_n: number): LeakBucket {
  return { metric_id: null, bucket_id, label, team_value, pga_value, sample_n } as LeakBucket;
}

function leakMaps(tour: TourKey): PlayerLeakMaps {
  const w = tour === 'lpga';
  return {
    playerId: 'p1',
    putting: [
      bucket('0_3', '0-3 ft', 96, null, 70),
      bucket('3_5', '3-5 ft', 68, w ? 86 : 90.5, 40),
      bucket('5_10', '5-10 ft', 38, w ? 55 : 62.2, 50),
      bucket('10_15', '10-15 ft', 22, w ? 30 : 35.7, 36),
    ],
    approach: [
      bucket('50_125', '50-125 yd', 26, w ? 26 : 18, 40),
      bucket('125_175', '125-175 yd', 38, w ? 38 : 30, 30),
      bucket('175_plus', '175+ yd', 60, w ? 55 : 45, 20),
    ],
    roundsIncluded: 12,
    windowFrom: '2026-01-05',
    windowTo: '2026-09-20',
    tour,
  };
}

/** The team board with a leak map for `tour`'s references and the given standing rows. */
function renderBoard(
  tour: TourKey,
  standingByPlayer: Map<string, Map<MetricId, PlayerStanding>>,
  /** The team leak map's own `tour` (the team's gender); omitted = an older payload without it. */
  leakTour?: TourKey,
) {
  const leak = leakMaps(tour);
  const teamLeak: TeamLeakMaps = {
    teamId: 't1',
    putting: leak.putting,
    approach: leak.approach,
    roundsIncluded: 12,
    tour: leakTour,
  };
  return render(
    <TeamStatsBoard
      teamName="Riverside Golf"
      players={[]}
      intelligenceByPlayer={{}}
      leakMaps={teamLeak}
      standingByPlayer={standingByPlayer}
      teamRounds30d={4}
      freshness={{
        roundRefreshMinutes: 5,
        statsCacheAsOf: '2026-08-18T16:00:00.000Z',
        statsCacheStale: false,
        standingAsOf: '2026-08-18T02:20:46.000Z',
        oldestSignalInsightAsOf: null,
      }}
    />,
  );
}

const TEAMS: ReadonlyArray<{ name: string; tour: TourKey; label: string; isWomens: boolean }> = [
  { name: "men's team", tour: 'pga', label: 'PGA Tour', isWomens: false },
  { name: "women's team", tour: 'lpga', label: 'LPGA Tour', isWomens: true },
];

function bodyText(): string {
  return document.body.textContent ?? '';
}

/** Click each radio tab in turn; returns the page text after each. */
function textPerTab(tabs: readonly string[]): string[] {
  return tabs.map((name) => {
    fireEvent.click(screen.getByRole('radio', { name }));
    return bodyText();
  });
}

/**
 * Open a LeakMap's "View as table" view (the chart frame is found by its
 * subtitle, waiting for the next/dynamic chunk) and return that frame's text:
 * the table's caption and reference column name the tour too.
 */
async function leakTableText(subtitle: string): Promise<string> {
  const frame = (await screen.findByText(subtitle)).closest('[data-slot="chart-frame"]') as HTMLElement;
  fireEvent.click(within(frame).getByRole('button', { name: 'View as table' }));
  return frame.textContent ?? '';
}

/** The shared checks: real content, no division wording, tour by gender. */
function expectTourOnly(texts: readonly string[], team: (typeof TEAMS)[number], anchor: string | RegExp) {
  expect(texts.length).toBeGreaterThan(0);
  expect(texts.join(' ')).toMatch(anchor);
  for (const text of texts) {
    expect(text.length).toBeGreaterThan(200);
    expect(text).not.toMatch(NOT_DIVISION);
    if (team.isWomens) expect(text).not.toMatch(MENS_TOUR);
  }
}

// ── surfaces ────────────────────────────────────────────────────────────────

describe.each(TEAMS)('golf stats screens render Tour-only references: $name', (team) => {
  it('the StatsBento, with the real Priorities engine output', () => {
    const stats = fixtureStats();
    const { strengths, weaknesses } = generateStatisticalStrengthsWeaknesses(stats, team.tour);
    expect(weaknesses.length).toBeGreaterThan(0);
    render(
      <StatsBento
        detailedStats={stats}
        standingByMetric={new Map(standingRows(team.tour).map((r) => [r.metric_id, r]))}
        trendData={null}
        strengths={strengths}
        weaknesses={weaknesses}
        leakArea="putting"
        tour={team.tour}
      />,
    );
    expectTourOnly([bodyText()], team, `vs the ${team.label} tick`);
  });

  it('the Priorities engine text (detail + recommendation) names only the right tour', () => {
    const { strengths, weaknesses } = generateStatisticalStrengthsWeaknesses(fixtureStats(), team.tour);
    const text = [...strengths, ...weaknesses]
      .map((row) => [row.category, row.label, row.detail, row.recommendation ?? ''].join(' '))
      .join(' | ');
    expect(text).toContain(team.label);
    expect(text).not.toMatch(NOT_DIVISION);
    expect(text).not.toMatch(/target/i);
    if (team.isWomens) expect(text).not.toMatch(MENS_TOUR);
  });

  it('the Putting drill, every tab, and its benchmark sheet', async () => {
    const user = userEvent.setup();
    render(
      <PuttingDrill
        detailedStats={fixtureStats()}
        leakMaps={leakMaps(team.tour)}
        standingByMetric={new Map(standingRows(team.tour).map((r) => [r.metric_id, r]))}
        tour={team.tour}
      />,
    );
    // The LeakMap loads through next/dynamic (ssr: false): wait for it, so the
    // assertions below run against the real chart, not its loading skeleton.
    await screen.findByText(`Make rate by distance vs ${team.label}`);
    const texts = textPerTab(['Distance', 'Breaks', 'Misses']);
    expectTourOnly(texts, team, `Make rate by distance vs ${team.label}`);
    // The cost line lives on the Breaks tab and is priced against this tour.
    expect(texts[1]).toMatch(new RegExp(`costing an estimated [0-9.]+ strokes per round vs the ${team.label}\\.`));

    // The chart's table view names the tour in its caption and its reference column.
    const table = await leakTableText(`Make rate by distance vs ${team.label}`);
    expect(table).toContain(`Putt make % by distance vs ${team.label}`);
    expect(table).toContain(`Distance`);
    expect(table).toContain(`You${team.label}`);
    expect(table).not.toMatch(NOT_DIVISION);
    if (team.isWomens) expect(table).not.toMatch(MENS_TOUR);

    // The sheet renders in a portal: read the whole body after opening it.
    await user.click(screen.getByRole('button', { name: `Compare with ${team.label}` }));
    const sheet = bodyText();
    expect(sheet).toContain(`${team.label} averages`);
    expect(sheet).not.toMatch(NOT_DIVISION);
    if (team.isWomens) expect(sheet).not.toMatch(MENS_TOUR);
  });

  it('the putting benchmark sheet on its own', async () => {
    const user = userEvent.setup();
    render(
      <PuttingBenchmarkSheet
        buckets={leakMaps(team.tour).putting}
        roundsIncluded={12}
        tour={team.tour}
        window={{ from: '2026-01-05', to: '2026-09-20' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: `Compare with ${team.label}` }));
    const sheet = bodyText();
    expect(sheet).toContain('Putting benchmarks');
    expect(sheet).toContain(`${team.label} averages`);
    expect(sheet).not.toMatch(NOT_DIVISION);
    if (team.isWomens) expect(sheet).not.toMatch(MENS_TOUR);
  });

  it('the Approach drill, every tab', async () => {
    render(
      <ApproachDrill
        detailedStats={fixtureStats()}
        leakMaps={leakMaps(team.tour)}
        sprayData={null}
        tour={team.tour}
      />,
    );
    await screen.findByText(`Average proximity to the hole by approach distance vs ${team.label}`);
    const texts = textPerTab(['GIR detail', 'Efficiency', 'Misses']);
    expectTourOnly(texts, team, `Average proximity to the hole by approach distance vs ${team.label}`);
    // The Efficiency tab's old "target" legend is gone.
    expect(texts[1]).not.toMatch(/target/i);

    const table = await leakTableText(`Average proximity to the hole by approach distance vs ${team.label}`);
    expect(table).toContain(`Approach proximity by distance vs ${team.label}`);
    expect(table).toContain(`You (ft)${team.label}`);
    if (team.isWomens) expect(table).not.toMatch(MENS_TOUR);
  });

  it('the Short game drill, every tab', () => {
    render(<ShortGameDrill detailedStats={fixtureStats()} tour={team.tour} />);
    const texts = textPerTab(['Scrambling detail', 'Efficiency', 'Misses']);
    expectTourOnly(texts, team, `coloured against the ${team.label}`);
    expect(texts.join(' ')).toContain('20+ yds');
    expect(texts.join(' ')).toContain('20-50 yds');
    expect(texts.join(' ')).not.toContain('20-30 yds');
  });

  it('the Standing drill', () => {
    render(<StandingDrill standingRows={standingRows(team.tour)} standingViewerContext="self" />);
    const text = bodyText();
    expect(text).toContain('SG: Total');
    expect(text.length).toBeGreaterThan(200);
    expect(text).not.toMatch(NOT_DIVISION);
    if (team.isWomens) expect(text).not.toMatch(MENS_TOUR);
  });

  it('the team board', async () => {
    const player = (metric_id: MetricId, value: number): PlayerStanding =>
      ({
        player_id: 'p1',
        metric_id,
        player_value: value,
        team_avg: null,
        team_n: 0,
        team_pct: null,
        level_avg: null,
        level_n: 0,
        level_pct: null,
        pga_value: 0,
        pga_delta: null,
        is_womens: team.isWomens,
      }) as PlayerStanding;
    const { container } = renderBoard(
      team.tour,
      new Map([['p1', new Map([['sg_total' as MetricId, player('sg_total' as MetricId, -0.6)]])]]),
    );
    expectTourOnly([container.textContent ?? ''], team, `vs the ${team.label} baseline`);

    const table = await leakTableText(`Team make% vs ${team.label}`);
    expect(table).toContain(`by distance vs ${team.label}`);
    expect(table).toContain(team.label);
    if (team.isWomens) expect(table).not.toMatch(MENS_TOUR);
  });
});

describe('an unknown tour stays neutral, never a guessed PGA Tour', () => {
  it('the team board with no standing rows says "the Tour": it may be a women\'s team', async () => {
    // Its leak maps carry women's LPGA references here; the board cannot tell
    // the team's gender without a standing row, so it must not say "PGA Tour".
    const { container } = renderBoard('lpga', new Map());
    expect(container.textContent).toContain('vs the Tour baseline');
    expect(container.textContent).not.toMatch(MENS_TOUR);
    expect(container.textContent).not.toMatch(NOT_DIVISION);

    const table = await leakTableText('Team make% vs the Tour');
    expect(table).toContain('by distance vs the Tour');
    expect(table).not.toMatch(MENS_TOUR);
  });

  it('the team board names the LPGA Tour from its leak map alone, with no standing rows', async () => {
    const { container } = renderBoard('lpga', new Map(), 'lpga');
    expect(container.textContent).toContain('vs the LPGA Tour baseline');
    expect(container.textContent).not.toMatch(MENS_TOUR);
    const table = await leakTableText('Team make% vs LPGA Tour');
    expect(table).toContain('by distance vs LPGA Tour');
  });

  it('bento, putting, approach and short game all say "the Tour"', async () => {
    const stats = fixtureStats();
    const texts: string[] = [];

    render(
      <StatsBento
        detailedStats={stats}
        standingByMetric={new Map()}
        trendData={null}
        strengths={[]}
        weaknesses={[]}
        leakArea="putting"
        tour={null}
      />,
    );
    texts.push(bodyText());
    cleanup();

    render(<PuttingDrill detailedStats={stats} leakMaps={null} standingByMetric={new Map()} tour={null} />);
    await screen.findByText('Make rate by distance vs the Tour');
    texts.push(bodyText());
    cleanup();

    render(<ApproachDrill detailedStats={stats} leakMaps={null} sprayData={null} tour={null} />);
    await screen.findByText('Average proximity to the hole by approach distance vs the Tour');
    texts.push(bodyText());
    cleanup();

    render(<ShortGameDrill detailedStats={stats} tour={null} />);
    texts.push(bodyText());

    expect(texts[0]).toContain('vs the Tour tick');
    expect(texts[1]).toContain('Make rate by distance vs the Tour');
    expect(texts[2]).toContain('approach distance vs the Tour');
    for (const text of texts) {
      expect(text).not.toMatch(MENS_TOUR);
      expect(text).not.toMatch(NOT_DIVISION);
    }
  });
});
