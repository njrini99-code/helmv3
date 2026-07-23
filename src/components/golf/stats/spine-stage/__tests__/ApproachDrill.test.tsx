// @vitest-environment jsdom
/**
 * ============================================================================
 * ApproachDrill — render tests
 * ----------------------------------------------------------------------------
 * Covers the new premium wiring on top of the pre-existing BandHistogram/
 * RailBars/LeakMap/SprayField layout: the top-of-drill CategoryInsightStrip
 * (patterns filtered to the `approach` category via `buildCategoryInsights`),
 * the GIR Readout's trend-aware delta + inline sparkline
 * (`buildCategoryTrends(trends).approach`), the RampMatrix-banded Efficiency
 * and Misses tables (replacing the old flat tables), and the GIR-by-round
 * Ribbon trend. Renders real framer-motion (CategoryInsightStrip needs no
 * mock, matching its sibling drills' test files). `useStage()` requires a
 * real `StageRouter` ancestor — `next/navigation` is globally mocked in
 * src/test/setup.tsx.
 * ========================================================================== */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';

import { StageRouter } from '@/components/fairway/modules';
import { ApproachDrill } from '../ApproachDrill';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';
import type { CategorizablePatternWithImpact } from '../buildStatsViewModel';

type ApproachDrillProps = ComponentProps<typeof ApproachDrill>;

function renderApproach(props: Partial<ApproachDrillProps> = {}) {
  return render(
    <StageRouter
      param="area"
      homeKey="approach"
      views={[
        {
          key: 'approach',
          node: <ApproachDrill detailedStats={null} leakMaps={null} sprayData={null} {...props} />,
        },
      ]}
    />,
  );
}

function fixtureStats(overrides: Partial<GolfStats> = {}): GolfStats {
  return {
    girPercentage: 58,
    girPerRound: 10.4,
    approachProximityAvg: 34.5,
    approachProximityWhenHitGreen: 22.1,
    approachProximityWhenMissedGreen: 48.9,
    girPct50_75: 80,
    girPct75_100: 70,
    girPctFromFairway: 65,
    girPctFromRough: 40,
    girPctFromSand: 30,
    approachMissShortPct: 35,
    approachMissLongPct: 25,
    approachMissLeftPct: 20,
    approachMissRightPct: 20,
    approachMissTotal: 40,
    approachEff30_75: { fairway: 2.2, rough: 3.6, sand: 2.55 },
    approachProx30_75: 18,
    approachMissByBand: {
      '30_75': { short: 10, long: 5, left: 40, right: 45, total: 12 },
    },
    ...overrides,
  } as unknown as GolfStats;
}

function fixtureTrendPoint(date: string, value: number): TrendAnalysisResponse['trends']['gir'][number] {
  return { date, value, roundId: `r-${date}`, courseName: 'Test Course' };
}

const APPROACH_PATTERN_DESCRIPTION = 'Leaves approach shots short from 150-175 yds';
const PUTTING_PATTERN_DESCRIPTION = 'Missing short putts under pressure';

const approachPattern: CategorizablePatternWithImpact = {
  id: 'p-approach',
  strokeImpact: -0.7,
  patternType: 'conditional',
  description: APPROACH_PATTERN_DESCRIPTION,
  recommendation: 'Take one more club into the wind.',
  outcome: { metric: 'gir_pct' },
  conditions: [],
};

const puttingPattern: CategorizablePatternWithImpact = {
  id: 'p-putting',
  strokeImpact: -1.2,
  patternType: 'conditional',
  description: PUTTING_PATTERN_DESCRIPTION,
  outcome: { metric: 'putts_per_round' },
  conditions: [],
};

describe('ApproachDrill', () => {
  it('renders the core layout with no patterns/trends (defaults are safe)', () => {
    renderApproach({ detailedStats: fixtureStats() });
    expect(screen.getByText('Approach')).toBeInTheDocument();
    expect(screen.getByText('GIR by distance')).toBeInTheDocument();
  });

  it('surfaces only the approach-category insight from mixed-category patterns', () => {
    renderApproach({
      detailedStats: fixtureStats(),
      patterns: [approachPattern, puttingPattern],
    });
    const strip = document.querySelector('[data-slot="category-insight-strip"]');
    expect(strip).not.toBeNull();
    expect(within(strip as HTMLElement).getByText(APPROACH_PATTERN_DESCRIPTION)).toBeInTheDocument();
    expect(within(strip as HTMLElement).queryByText(PUTTING_PATTERN_DESCRIPTION)).not.toBeInTheDocument();
  });

  it('wires the GIR Readout delta from the gir trend series', () => {
    renderApproach({
      detailedStats: fixtureStats(),
      trends: {
        score: [],
        gir: [fixtureTrendPoint('2026-06-01', 50), fixtureTrendPoint('2026-07-01', 58)],
        fairway: [],
        putts: [],
      },
    });
    // ledgerDelta(58, 50, higherIsBetter=true, fmtPctDelta) => "+8%"
    const deltaLines = document.querySelectorAll('[data-slot="readout-delta"]');
    const deltaTexts = Array.from(deltaLines).map((el) => el.textContent ?? '');
    expect(deltaTexts.some((t) => t.includes('+8%'))).toBe(true);
  });

  it('shows the round-count eyebrow + inline sparkline on the GIR card when a real (>=2 point) trend exists', () => {
    renderApproach({
      detailedStats: fixtureStats(),
      trends: {
        score: [],
        gir: [fixtureTrendPoint('2026-06-01', 50), fixtureTrendPoint('2026-07-01', 58)],
        fairway: [],
        putts: [],
      },
    });
    expect(screen.getByText('2-round trend')).toBeInTheDocument();
  });

  it('omits the round-count eyebrow when there is no gir trend', () => {
    renderApproach({ detailedStats: fixtureStats() });
    expect(screen.queryByText(/-round trend/)).not.toBeInTheDocument();
  });

  it('bands the Efficiency table with RampMatrix (legend + strongest/weakest cells)', async () => {
    const user = userEvent.setup();
    renderApproach({ detailedStats: fixtureStats() });
    await user.click(screen.getByRole('radio', { name: 'Efficiency' }));

    expect(screen.getByText('Ahead of target')).toBeInTheDocument();
    expect(screen.getByText('Well behind target')).toBeInTheDocument();

    const matrix = document.querySelector('[data-slot="ramp-matrix"]');
    expect(matrix).not.toBeNull();
    // Fairway @ 30-75yds = 2.2 strokes, well under the 2.3 "good" cutoff → band 4 (darkest).
    const bestCell = within(matrix as HTMLElement).getByText('2.20');
    expect(bestCell.closest('td')?.className).toContain('accent-700');
    // Rough @ 30-75yds = 3.6 strokes, well past the 2.85 "poor" cutoff → band 1 (lightest colored).
    const worstCell = within(matrix as HTMLElement).getByText('3.60');
    expect(worstCell.closest('td')?.className).toContain('accent-100');
  });

  it('bands the Misses table with RampMatrix (n column + direction legend)', async () => {
    const user = userEvent.setup();
    renderApproach({ detailedStats: fixtureStats() });
    await user.click(screen.getByRole('radio', { name: 'Misses' }));

    expect(screen.getByText('Dominant tendency')).toBeInTheDocument();
    const matrix = document.querySelector('[data-slot="ramp-matrix"]');
    expect(matrix).not.toBeNull();
    // The row's total tracked-miss count renders as a plain, unbanded cell.
    expect(within(matrix as HTMLElement).getByText('12')).toBeInTheDocument();
  });

  it('renders no flat/colorless table markup on this drill (nothing left to band)', () => {
    renderApproach({ detailedStats: fixtureStats() });
    expect(document.querySelector('table')).toBeNull();
  });

  it('mounts the GIR-by-round Ribbon trend as its own heading', () => {
    renderApproach({
      detailedStats: fixtureStats(),
      trends: {
        score: [],
        gir: [fixtureTrendPoint('2026-06-01', 50), fixtureTrendPoint('2026-07-01', 58)],
        fairway: [],
        putts: [],
      },
    });
    expect(screen.getByRole('heading', { name: 'Greens in regulation by round', level: 3 })).toBeInTheDocument();
  });

  it('renders the Ribbon in its honest awaiting state when there is no gir trend', () => {
    renderApproach({ detailedStats: fixtureStats() });
    expect(screen.getByRole('heading', { name: 'Greens in regulation by round', level: 3 })).toBeInTheDocument();
    expect(screen.getByText(/Awaiting points/)).toBeInTheDocument();
  });
});
