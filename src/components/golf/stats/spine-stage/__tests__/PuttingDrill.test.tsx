// @vitest-environment jsdom
/**
 * ============================================================================
 * PuttingDrill — render tests
 * ----------------------------------------------------------------------------
 * Covers the new wiring on top of the pre-existing distance/breaks/misses
 * tabs + MakeCurve/LeakMap visuals: the top-of-drill CategoryInsightStrip
 * (patterns filtered to the `putting` category via `buildCategoryInsights`),
 * the new "Putts / round" headline Readout's trend-aware delta
 * (`buildCategoryTrends(trends).putting`, good-direction-aware so a FALLING
 * putts-per-round reads as an improvement, not a false decline), the
 * putts-per-round Ribbon trend, and the Distance tab's RampMatrix-style
 * per-cell color banding on the Make column (mirroring the Breaks tab's
 * `RampMatrix`, same band thresholds/classes, plus a compact shared legend).
 * Renders real framer-motion (CategoryInsightStrip needs no mock, matching
 * its own sibling test file). `useStage()` requires a real `StageRouter`
 * ancestor — `next/navigation` is globally mocked in src/test/setup.tsx.
 * ========================================================================== */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';

import { StageRouter } from '@/components/fairway/modules';
import { PuttingDrill } from '../PuttingDrill';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';
import type { CategorizablePatternWithImpact } from '../buildStatsViewModel';

type PuttingDrillProps = ComponentProps<typeof PuttingDrill>;

function renderPutting(props: Partial<PuttingDrillProps> = {}) {
  return render(
    <StageRouter
      param="area"
      homeKey="putting"
      views={[
        {
          key: 'putting',
          node: (
            <PuttingDrill
              detailedStats={null}
              leakMaps={null}
              standingByMetric={new Map()}
              weaknesses={[]}
              {...props}
            />
          ),
        },
      ]}
    />,
  );
}

function fixtureStats(overrides: Partial<GolfStats> = {}): GolfStats {
  return {
    puttsPerRound: 30,
    puttsPerHole: 1.7,
    puttsPerGir: 1.8,
    threePuttsPerRound: 0.2,
    onePuttsTotal: 40,
    approachPuttAvgLeave: 3.2,
    // 0-3ft: no PGA standard (flat [70,85,95] scale) — 95% lands band 4.
    puttMakePct0_3: 95,
    puttMakeCount0_3: 20,
    puttMakePct3_5: 60,
    puttMakeCount3_5: 15,
    puttMakePct5_10: 35,
    puttMakeCount5_10: 12,
    puttMakePct10_15: 20,
    puttMakeCount10_15: 10,
    puttMakePct15_20: 15,
    puttMakeCount15_20: 8,
    puttMakePct20_25: 10,
    puttMakePct25_30: 8,
    puttMakePct30_35: 5,
    puttMakePct35Plus: 2,
    firstPuttDistanceByBand: {},
    approachPuttAvgLeaveByBand: {},
    puttEff0_5: 1.2,
    puttEff5_10: 1.4,
    puttEff10_15: 1.6,
    puttEff15_20: 1.8,
    puttEff20_25: 2.0,
    puttEff25_30: 2.1,
    puttEff30_35: 2.2,
    puttEff35Plus: 2.3,
    puttProximity0_5: 1.0,
    puttProximity5_10: 3.0,
    puttProximity10_15: 5.0,
    puttProximity15_20: 7.0,
    puttProximity20Plus: 12.0,
    ...overrides,
  } as unknown as GolfStats;
}

function fixtureTrendPoint(date: string, value: number): TrendAnalysisResponse['trends']['putts'][number] {
  return { date, value, roundId: `r-${date}`, courseName: 'Test Course' };
}

const PUTTING_PATTERN_DESCRIPTION = 'Missing short putts under pressure';
const DRIVING_PATTERN_DESCRIPTION = 'Misses fairways with the driver on tight par 4s';

const puttingPattern: CategorizablePatternWithImpact = {
  id: 'p-putting',
  strokeImpact: -1.2,
  patternType: 'conditional',
  description: PUTTING_PATTERN_DESCRIPTION,
  recommendation: 'Slow down on the takeaway.',
  outcome: { metric: 'putts_per_round' },
  conditions: [],
};

const drivingPattern: CategorizablePatternWithImpact = {
  id: 'p-driving',
  strokeImpact: -0.9,
  patternType: 'conditional',
  description: DRIVING_PATTERN_DESCRIPTION,
  outcome: { metric: 'fairway_pct' },
  conditions: [],
};

describe('PuttingDrill', () => {
  it('renders the core layout with no patterns/trends (defaults are safe)', () => {
    renderPutting({ detailedStats: fixtureStats() });
    expect(screen.getByText('Putting')).toBeInTheDocument();
    expect(screen.getByText('Putting by distance')).toBeInTheDocument();
    // Honest empty state: no patterns/trends => the strip renders nothing.
    expect(document.querySelector('[data-slot="category-insight-strip"]')).toBeNull();
  });

  it('renders all six efficiency readout cards, including the new "Putts / round" headline', () => {
    renderPutting({ detailedStats: fixtureStats() });
    for (const label of [
      'Putts / round',
      'Putts / hole',
      'Putts / GIR',
      '3-putts / round',
      '1-putts (total)',
      'Approach-putt avg leave',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows an honest awaiting state per card when there are no stats yet', () => {
    renderPutting({ detailedStats: null });
    expect(screen.getByText('No leave data')).toBeInTheDocument();
  });

  it('surfaces only the putting-category insight from mixed-category patterns', () => {
    renderPutting({
      detailedStats: fixtureStats(),
      patterns: [puttingPattern, drivingPattern],
    });
    const strip = document.querySelector('[data-slot="category-insight-strip"]');
    expect(strip).not.toBeNull();
    expect(within(strip as HTMLElement).getByText(PUTTING_PATTERN_DESCRIPTION)).toBeInTheDocument();
    expect(within(strip as HTMLElement).queryByText(DRIVING_PATTERN_DESCRIPTION)).not.toBeInTheDocument();
  });

  it('wires the Putts/round Readout delta from the putts trend series, good-direction-aware', () => {
    renderPutting({
      detailedStats: fixtureStats(),
      trends: {
        score: [],
        gir: [],
        fairway: [],
        putts: [fixtureTrendPoint('2026-06-01', 32), fixtureTrendPoint('2026-07-01', 28)],
      },
    });
    // ledgerDelta(28, 32, higherIsBetter=false, fmtNumDelta) => "−4.0", good=true
    // (fewer putts is an improvement) => mapped to the green "up" direction,
    // never the raw-sign "down"/amber a naive delta would render.
    const deltaLines = document.querySelectorAll('[data-slot="readout-delta"]');
    const deltaTexts = Array.from(deltaLines).map((el) => el.textContent ?? '');
    expect(deltaTexts.some((t) => t.includes('−4.0') && t.includes('vs prior period'))).toBe(true);
    const upDelta = document.querySelector('[data-slot="readout-delta"][data-direction="up"]');
    expect(upDelta).not.toBeNull();
  });

  it('mounts the putts-per-round Ribbon trend as its own heading', () => {
    renderPutting({
      detailedStats: fixtureStats(),
      trends: {
        score: [],
        gir: [],
        fairway: [],
        putts: [fixtureTrendPoint('2026-06-01', 32), fixtureTrendPoint('2026-07-01', 28)],
      },
    });
    expect(screen.getByRole('heading', { name: 'Putts by round', level: 3 })).toBeInTheDocument();
  });

  it('bands the Distance tab Make column with the same ramp classes the Breaks tab uses, plus a compact legend', () => {
    renderPutting({ detailedStats: fixtureStats() });

    // 95% at 0-3ft with no PGA standard (flat [70,85,95] scale) lands band 4
    // — RampMatrix's own `RAMP_CLASSES[4]` — the SAME color language as the
    // Breaks tab's matrix, not an independently-invented one.
    const badge = screen.getByText('95%');
    expect(badge.className).toContain('bg-accent-700');
    // The exact top-level attempt count (`puttMakeCount0_3`) backs the n=
    // badge under it, same n the hero MakeCurve reads.
    expect(screen.getByText('n=20')).toBeInTheDocument();

    // Compact legend — the SAME 4 band labels the Breaks tab's RampMatrix
    // legend uses, scoped to the Make % column.
    expect(screen.getByText(/Make %/)).toBeInTheDocument();
    for (const label of ['Well behind Tour', 'Behind', 'Near Tour', 'Ahead of Tour']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('bands the Breaks tab RampMatrix off the SAME shared legend wording', () => {
    renderPutting({ detailedStats: fixtureStats() });
    // Switch to the Breaks sub-tab.
    fireEvent.click(screen.getByRole('radio', { name: 'Breaks' }));
    // RampMatrix's own legend renders the same 4 labels.
    const legendLabels = screen.getAllByText('Ahead of Tour');
    expect(legendLabels.length).toBeGreaterThan(0);
  });
});
