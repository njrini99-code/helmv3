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
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import type { CategorizablePatternWithImpact } from '../buildStatsViewModel';

type PuttingDrillProps = ComponentProps<typeof PuttingDrill>;

/** Standing rows carrying the Tour make-rate standards (PGA Tour values). */
function tourStanding(overrides: Partial<PlayerStandingRow> = {}): Map<string, PlayerStandingRow> {
  const row = (metric_id: string, pga_value: number): [string, PlayerStandingRow] => [
    metric_id,
    { metric_id, player_value: 0, team_avg: null, team_n: 0, team_pct: null, pga_value, pga_delta: null, ...overrides },
  ];
  return new Map([
    row('putts_made_3_5ft_pct', 90.5),
    row('putts_made_5_10ft_pct', 62.2),
    row('putts_made_10_15ft_pct', 35.7),
    row('putts_made_15_25ft_pct', 15.4),
    row('putts_made_25_plus_ft_pct', 5.5),
  ]);
}

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
    // 0-3ft: the Tour publishes no standard, so it draws neutral.
    holesPlayed: 180,
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

  it('captions 3-putts / round with what the calculator counts (holes with 3+ putts, per 18)', () => {
    renderPutting({ detailedStats: fixtureStats() });
    expect(screen.getByText('Holes with 3+ putts, per 18')).toBeInTheDocument();
    expect(screen.queryByText(/Two-plus putts/)).not.toBeInTheDocument();
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
        // The delta is now last-3 vs prior-3 (needs >= 3 per side), not
        // newest vs oldest, so the fixture carries six rounds.
        putts: [
          fixtureTrendPoint('2026-06-01', 32),
          fixtureTrendPoint('2026-06-08', 32),
          fixtureTrendPoint('2026-06-15', 32),
          fixtureTrendPoint('2026-06-22', 28),
          fixtureTrendPoint('2026-06-29', 28),
          fixtureTrendPoint('2026-07-01', 28),
        ],
      },
    });
    // mean(28,28,28) − mean(32,32,32) => "−4.0", good=true
    // (fewer putts is an improvement) => mapped to the green "up" direction,
    // never the raw-sign "down"/amber a naive delta would render.
    const deltaLines = document.querySelectorAll('[data-slot="readout-delta"]');
    const deltaTexts = Array.from(deltaLines).map((el) => el.textContent ?? '');
    expect(deltaTexts.some((t) => t.includes('−4.0') && t.includes('last 3 vs prior 3 rounds'))).toBe(true);
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

  it('bands the Distance tab Make column off the Tour with the ramp classes the Breaks tab uses, plus a compact legend', () => {
    renderPutting({ detailedStats: fixtureStats(), standingByMetric: tourStanding() });

    // 60% at 3-5ft against the Tour's 90.5% (thresholds 54.3 / 76.9 / 95.0)
    // lands band 2 — RampMatrix's own `RAMP_CLASSES[2]` — the SAME color
    // language as the Breaks tab's matrix, not an independently-invented one.
    expect(screen.getByText('60%').className).toContain('bg-ramp-2');
    // 0-3ft has no Tour standard, so its 95% draws neutral: it used to land on
    // an invented flat [70,85,95] scale (band 4) under a legend that says Tour.
    const flat = screen.getByText('95%');
    expect(flat.className).toContain('bg-surface-sunken');
    expect(flat.className).not.toContain('bg-ramp-');
    // 15-20ft is the shorter half of the Tour's 15-25ft band; grading it
    // against that blended average would be unfair, so it draws neutral too.
    expect(screen.getByText('15%').className).not.toContain('bg-ramp-');
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

  it('offers the putting benchmark sheet only when the leak map loaded rounds (DASH-12)', async () => {
    const leakMaps = {
      playerId: 'p1',
      putting: [],
      approach: [],
      roundsIncluded: 3,
      windowFrom: '2026-01-05',
      windowTo: '2026-09-20',
      tour: 'lpga' as const,
    };
    const { unmount } = renderPutting({ leakMaps });
    expect(screen.getByRole('button', { name: 'Compare with LPGA Tour' })).toBeInTheDocument();
    // The LeakMap names the tour the server routed the references to.
    expect(await screen.findByText('Make rate by distance vs LPGA Tour')).toBeInTheDocument();
    unmount();

    renderPutting({ leakMaps, leakError: true });
    expect(screen.queryByRole('button', { name: /Compare with/ })).not.toBeInTheDocument();
  });

  describe('the putting cost line (Tour only)', () => {
    // fixtureStats: 3-5ft 60% on 15 putts, 5-10ft 35% on 12, 10-15ft 20% on 10,
    // over 180 holes (putts per 18 = 1.5 / 1.2 / 1.0).
    //   PGA Tour:  -0.4575 - 0.3264 - 0.157 = -0.94
    //   LPGA Tour: -0.39   - 0.24   - 0.10  = -0.73
    function openBreaks() {
      fireEvent.click(screen.getByRole('radio', { name: 'Breaks' }));
    }

    it("prices the gap to the PGA Tour for a men's team, never 'the field'", () => {
      renderPutting({ detailedStats: fixtureStats(), tour: 'pga' });
      openBreaks();
      expect(
        screen.getByText('Putts from 3 to 15 ft are costing an estimated 0.9 strokes per round vs the PGA Tour.'),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/vs the field/);
    });

    it("prices the gap to the LPGA Tour for a women's team", () => {
      renderPutting({ detailedStats: fixtureStats(), tour: 'lpga' });
      openBreaks();
      expect(
        screen.getByText('Putts from 3 to 15 ft are costing an estimated 0.7 strokes per round vs the LPGA Tour.'),
      ).toBeInTheDocument();
    });

    it('takes the tour from the leak map when the stage passes none', () => {
      renderPutting({
        detailedStats: fixtureStats(),
        leakMaps: { playerId: 'p1', putting: [], approach: [], roundsIncluded: 3, tour: 'lpga' as const },
      });
      openBreaks();
      expect(screen.getByText(/vs the LPGA Tour\.$/)).toBeInTheDocument();
    });

    it('is omitted when the tour is unknown (it is only true for one tour) or putting beats the Tour', () => {
      const { unmount } = renderPutting({ detailedStats: fixtureStats(), tour: null });
      openBreaks();
      expect(screen.queryByText(/costing an estimated/)).not.toBeInTheDocument();
      unmount();

      renderPutting({
        detailedStats: fixtureStats({ puttMakePct3_5: 95, puttMakePct5_10: 70, puttMakePct10_15: 40 }),
        tour: 'pga',
      });
      openBreaks();
      expect(screen.queryByText(/costing an estimated/)).not.toBeInTheDocument();
    });
  });
});
