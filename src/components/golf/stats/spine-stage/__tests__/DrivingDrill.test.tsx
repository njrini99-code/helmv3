// @vitest-environment jsdom
/**
 * ============================================================================
 * DrivingDrill — render tests
 * ----------------------------------------------------------------------------
 * Covers the new wiring on top of the pre-existing RailBars/DivergingBars/
 * SprayField layout: the top-of-drill CategoryInsightStrip (patterns filtered
 * to the `driving` category via `buildCategoryInsights`), the Fairways-hit
 * Readout's trend-aware delta (`buildCategoryTrends(trends).driving`), the
 * "N of M attempts" fuller-card caption, and the fairway% Ribbon trend.
 * Renders real framer-motion (CategoryInsightStrip needs no mock, matching
 * its own sibling test file). `useStage()` requires a real `StageRouter`
 * ancestor — `next/navigation` is globally mocked in src/test/setup.tsx.
 * ========================================================================== */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';

import { StageRouter } from '@/components/fairway/modules';
import { DrivingDrill } from '../DrivingDrill';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';
import type { CategorizablePatternWithImpact } from '../buildStatsViewModel';

type DrivingDrillProps = ComponentProps<typeof DrivingDrill>;

function renderDriving(props: Partial<DrivingDrillProps> = {}) {
  return render(
    <StageRouter
      param="area"
      homeKey="driving"
      views={[
        {
          key: 'driving',
          node: <DrivingDrill detailedStats={null} sprayData={null} {...props} />,
        },
      ]}
    />,
  );
}

function fixtureStats(overrides: Partial<GolfStats> = {}): GolfStats {
  return {
    fairwayPctPar4: 60,
    fairwayPctPar5: 65,
    fairwayPctDriver: 58,
    fairwayPctNonDriver: 70,
    missLeftPct: 55,
    missRightPct: 45,
    drivingDistanceAvg: 265,
    drivingDistanceDriverOnly: 270,
    drivingDistanceNonDriverOnly: 240,
    fairwayPercentage: 63,
    missLeftPctDriver: null,
    missRightPctDriver: null,
    missLeftPctNonDriver: null,
    missRightPctNonDriver: null,
    fairwaysHit: 90,
    fairwayOpportunities: 145,
    ...overrides,
  } as unknown as GolfStats;
}

function fixtureTrendPoint(date: string, value: number): TrendAnalysisResponse['trends']['fairway'][number] {
  return { date, value, roundId: `r-${date}`, courseName: 'Test Course' };
}

const DRIVING_PATTERN_DESCRIPTION = 'Misses fairways with the driver on tight par 4s';
const PUTTING_PATTERN_DESCRIPTION = 'Missing short putts under pressure';

const drivingPattern: CategorizablePatternWithImpact = {
  id: 'p-driving',
  strokeImpact: -0.9,
  patternType: 'conditional',
  description: DRIVING_PATTERN_DESCRIPTION,
  recommendation: 'Club down off the tee on tight holes.',
  outcome: { metric: 'fairway_pct' },
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

describe('DrivingDrill', () => {
  it('renders the core layout with no patterns/trends (defaults are safe)', () => {
    renderDriving({ detailedStats: fixtureStats() });
    expect(screen.getByText('Off the tee')).toBeInTheDocument();
    expect(screen.getByText('Fairways by tee type')).toBeInTheDocument();
  });

  it('surfaces only the driving-category insight from mixed-category patterns', () => {
    renderDriving({
      detailedStats: fixtureStats(),
      patterns: [drivingPattern, puttingPattern],
    });
    const strip = document.querySelector('[data-slot="category-insight-strip"]');
    expect(strip).not.toBeNull();
    expect(within(strip as HTMLElement).getByText(DRIVING_PATTERN_DESCRIPTION)).toBeInTheDocument();
    expect(within(strip as HTMLElement).queryByText(PUTTING_PATTERN_DESCRIPTION)).not.toBeInTheDocument();
  });

  it('wires the Fairways-hit Readout delta from the fairway trend series', () => {
    renderDriving({
      detailedStats: fixtureStats(),
      trends: {
        score: [],
        gir: [],
        fairway: [fixtureTrendPoint('2026-06-01', 55), fixtureTrendPoint('2026-07-01', 63)],
        putts: [],
      },
    });
    // ledgerDelta(63, 55, higherIsBetter=true, fmtPctDelta) => "+8%"
    const deltaLines = document.querySelectorAll('[data-slot="readout-delta"]');
    const deltaTexts = Array.from(deltaLines).map((el) => el.textContent ?? '');
    expect(deltaTexts.some((t) => t.includes('+8%'))).toBe(true);
  });

  it('shows the "N of M attempts" fuller-card caption when fairway attempt data exists', () => {
    renderDriving({ detailedStats: fixtureStats({ fairwaysHit: 90, fairwayOpportunities: 145 }) });
    expect(screen.getByText('90 of 145 attempts')).toBeInTheDocument();
  });

  it('omits the attempts caption when there are zero fairway opportunities', () => {
    renderDriving({ detailedStats: fixtureStats({ fairwaysHit: 0, fairwayOpportunities: 0 }) });
    expect(screen.queryByText(/of 0 attempts/)).not.toBeInTheDocument();
  });

  it('mounts the fairway-accuracy Ribbon trend as its own heading', () => {
    renderDriving({
      detailedStats: fixtureStats(),
      trends: {
        score: [],
        gir: [],
        fairway: [fixtureTrendPoint('2026-06-01', 55), fixtureTrendPoint('2026-07-01', 63)],
        putts: [],
      },
    });
    expect(screen.getByRole('heading', { name: 'Fairways hit', level: 3 })).toBeInTheDocument();
  });

  it('renders no flat/colorless table markup on this drill (nothing to band)', () => {
    renderDriving({ detailedStats: fixtureStats() });
    expect(document.querySelector('table')).toBeNull();
  });
});
