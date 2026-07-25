// @vitest-environment jsdom
/**
 * ============================================================================
 * ScoringDrill — render tests
 * ----------------------------------------------------------------------------
 * Covers the new wiring layered on the pre-existing SegmentBar/BarCompare/
 * worst-holes layout: the top-of-drill CategoryInsightStrip (patterns
 * filtered to the `scoring` category), the Scoring-average Readout's
 * periodComparison-driven delta (direction-aware for a lower-is-better
 * metric), the Best-round Readout's personalBests course/date caption, and
 * the Toughest-holes list's `RankCell` severity banding (replacing the flat
 * mono rank numeral). `useStage()` requires a real `StageRouter` ancestor —
 * `next/navigation` is globally mocked in src/test/setup.tsx.
 * ========================================================================== */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';

import { StageRouter } from '@/components/fairway/modules';
import { ScoringDrill } from '../ScoringDrill';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { WorstHoleResponse } from '@/app/golf/actions/stats-data-types';
import type { CategorizablePatternWithImpact } from '../buildStatsViewModel';

type ScoringDrillProps = ComponentProps<typeof ScoringDrill>;

function renderScoring(props: Partial<ScoringDrillProps> = {}) {
  return render(
    <StageRouter
      param="area"
      homeKey="scoring"
      views={[
        {
          key: 'scoring',
          node: <ScoringDrill detailedStats={null} worstHoles={null} {...props} />,
        },
      ]}
    />,
  );
}

function fixtureStats(overrides: Partial<GolfStats> = {}): GolfStats {
  return {
    roundsPlayed: 12,
    scoringAverage: 74.2,
    avgScoreToPar: 2.2,
    bestRound: 70,
    worstRound: 79,
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
      par3: { avgToPar: 0.3, count: 36, eagle: 0, birdie: 4, par: 20, bogey: 10, doublePlus: 2, total: 36 },
      par4: { avgToPar: 0.2, count: 108, eagle: 0, birdie: 10, par: 60, bogey: 30, doublePlus: 8, total: 108 },
      par5: { avgToPar: 0.1, count: 72, eagle: 1, birdie: 10, par: 40, bogey: 18, doublePlus: 3, total: 72 },
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
    longestNo3PuttStreak: 10,
    longestHoleOut: null,
    ...overrides,
  } as unknown as GolfStats;
}

function fixtureWorstHoles(count: number): WorstHoleResponse {
  const worstHoles = Array.from({ length: count }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    averageToPar: 0.5 + i * 0.2,
    timesPlayed: 10,
  }));
  return {
    holes: worstHoles,
    worstHoles,
    bestHoles: [],
    par3Average: null,
    par4Average: null,
    par5Average: null,
    closingHolesAverage: null,
  } as unknown as WorstHoleResponse;
}

const SCORING_PATTERN_DESCRIPTION = 'Opening-hole bogeys drag the round average down';
const DRIVING_PATTERN_DESCRIPTION = 'Misses fairways with the driver on tight par 4s';

const scoringPattern: CategorizablePatternWithImpact = {
  id: 'p-scoring',
  strokeImpact: -0.7,
  patternType: 'conditional',
  description: SCORING_PATTERN_DESCRIPTION,
  recommendation: 'Play the opening hole conservatively.',
  outcome: { metric: 'score_to_par' },
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

describe('ScoringDrill', () => {
  it('renders the core layout with no patterns/trends/period data (defaults are safe)', () => {
    renderScoring({ detailedStats: fixtureStats() });
    expect(screen.getByText('Score mix')).toBeInTheDocument();
    expect(screen.getByText('Streaks & records')).toBeInTheDocument();
  });

  it('surfaces only the scoring-category insight from mixed-category patterns', () => {
    renderScoring({
      detailedStats: fixtureStats(),
      patterns: [scoringPattern, drivingPattern],
    });
    const strip = document.querySelector('[data-slot="category-insight-strip"]');
    expect(strip).not.toBeNull();
    expect(within(strip as HTMLElement).getByText(SCORING_PATTERN_DESCRIPTION)).toBeInTheDocument();
    expect(within(strip as HTMLElement).queryByText(DRIVING_PATTERN_DESCRIPTION)).not.toBeInTheDocument();
  });

  it('wires the Scoring-average Readout delta from periodComparison, direction-aware for lower-is-better', () => {
    renderScoring({
      detailedStats: fixtureStats(),
      periodComparison: {
        windowDays: 30,
        last30Days: { roundCount: 6, scoringAvg: 73, girPct: null, fairwayPct: null, puttsPerRound: null },
        previous30Days: { roundCount: 6, scoringAvg: 75, girPct: null, fairwayPct: null, puttsPerRound: null },
      },
    });
    // 73 - 75 = -2 (scoring average FELL, which is GOOD for a lower-is-better
    // metric) — the delta line must render the ▲ good glyph, not a false ▼.
    const deltaLine = document.querySelector('[data-slot="readout-delta"]');
    expect(deltaLine).not.toBeNull();
    expect(deltaLine?.getAttribute('data-direction')).toBe('up');
    expect(deltaLine?.textContent).toContain('−2.0');
  });

  it('omits the Scoring-average delta when periodComparison is not supplied', () => {
    renderScoring({ detailedStats: fixtureStats() });
    expect(document.querySelector('[data-slot="readout-delta"]')).toBeNull();
  });

  it('shows the Best-round course/date caption when personalBests.bestScore exists', () => {
    renderScoring({
      detailedStats: fixtureStats({ bestRound: 68 }),
      personalBests: {
        bestScore: { value: 68, date: '2026-05-10', course: 'Pinehurst No. 2' },
        bestToPar: null,
        bestGir: null,
        lowestPutts: null,
      },
    });
    expect(screen.getByText(/Pinehurst No\. 2/)).toBeInTheDocument();
  });

  it('omits the Best-round caption when personalBests is not supplied', () => {
    renderScoring({ detailedStats: fixtureStats({ bestRound: 68 }) });
    expect(screen.queryByText(/Pinehurst/)).not.toBeInTheDocument();
  });

  it('bands the Toughest-holes rank chips by severity instead of a flat mono numeral', () => {
    renderScoring({
      detailedStats: fixtureStats(),
      worstHoles: fixtureWorstHoles(5),
    });
    expect(screen.getByText('Toughest holes')).toBeInTheDocument();
    // RankCell renders an accessible "Rank N of M" label per chip, one per
    // ranked hole — the worst (rank 1 of 5) gets the darkest band.
    const worstChip = screen.getByLabelText('Rank 1 of 5');
    expect(worstChip.className).toContain('bg-accent-700');
    const leastBadChip = screen.getByLabelText('Rank 5 of 5');
    expect(leastBadChip.className).not.toContain('bg-accent-700');
  });
});
