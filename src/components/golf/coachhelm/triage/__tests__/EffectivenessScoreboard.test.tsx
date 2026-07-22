// @vitest-environment jsdom
/**
 * ============================================================================
 * EffectivenessScoreboard — Adoption intrinsic-height + triple-empty
 * consolidation (Wave 2 dead-space fix)
 * ----------------------------------------------------------------------------
 * Live-QA: the Adoption card stretched to match its Ribbon row-mate's height
 * and centered its compact ring+caption in the resulting empty middle; and
 * when a fresh team had zero resolved outcomes AND zero validated
 * predictions, Working / Not working / the calibration line each
 * independently rendered their own "no data yet" copy — three boxes saying
 * the same non-finding. Pins: the grid no longer stretches rows
 * (`items-start`), and the triple-empty case collapses to ONE EmptyState.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EffectivenessScoreboard, type EffectivenessScoreboardProps } from '../EffectivenessScoreboard';
import type { InsightEffectivenessData, PredictionPerformanceData } from '@/app/golf/actions/coachhelm-analytics';

function effectiveness(overrides: Partial<InsightEffectivenessData> = {}): InsightEffectivenessData {
  return {
    byType: [],
    overall: {
      totalGenerated: 0,
      totalActedUpon: 0,
      totalWithOutcome: 0,
      totalImproved: 0,
      overallActionRate: 0,
      overallImprovementRate: 0,
      overallEffectivenessScore: 0,
    },
    periodStart: '2026-06-01',
    periodEnd: '2026-07-01',
    ...overrides,
  };
}

function performance(overrides: Partial<PredictionPerformanceData> = {}): PredictionPerformanceData {
  return {
    accuracyOverTime: [],
    calibration: [],
    errorDistribution: [],
    summary: {
      totalPredictions: 0,
      validatedPredictions: 0,
      overallAccuracy: 0,
      meanAbsoluteError: 0,
      calibrationScore: 0,
      overconfidenceRate: 0,
      underconfidenceRate: 0,
    },
    periodStart: '2026-06-01',
    periodEnd: '2026-07-01',
    ...overrides,
  };
}

function renderBoard(props: Partial<EffectivenessScoreboardProps> = {}) {
  return render(
    <EffectivenessScoreboard
      initialOverview={undefined}
      initialEffectiveness={effectiveness()}
      initialPerformance={performance()}
      {...props}
    />,
  );
}

describe('EffectivenessScoreboard — Adoption intrinsic height', () => {
  it('no longer vertically centers the Adoption card content inside a stretched row', () => {
    const { container } = renderBoard();
    // The row-level fix: grid stops stretching each card to match its
    // tallest row-mate (was the implicit CSS Grid default).
    const grid = container.querySelector('[class*="grid-cols-1"]');
    expect(grid?.className).toContain('items-start');
    // The card-level fix: no more `justify-center` fighting the intrinsic
    // content height inside an artificially tall card.
    expect(screen.getByText('Adoption').closest('[data-slot="surface"]')?.className).not.toContain(
      'justify-center',
    );
  });
});

describe('EffectivenessScoreboard — triple "no data" consolidation', () => {
  it('collapses Working / Not working / calibration into ONE state when all three are starved', () => {
    renderBoard({
      initialEffectiveness: effectiveness({ byType: [] }),
      initialPerformance: performance({ summary: { ...performance().summary, validatedPredictions: 0 } }),
    });

    expect(screen.getByText('Not enough resolved outcomes yet')).toBeInTheDocument();
    expect(screen.queryByText('Working')).not.toBeInTheDocument();
    expect(screen.queryByText('Not working')).not.toBeInTheDocument();
    expect(screen.queryByText(/Calibration — awaiting/)).not.toBeInTheDocument();
  });

  it('keeps the three separate cards when only ONE of them is starved (not a repeated message)', () => {
    renderBoard({
      initialEffectiveness: effectiveness({
        byType: [
          {
            insightType: 'putting_leak',
            insightsGenerated: 10,
            insightsDismissed: 1,
            insightsActedUpon: 8,
            insightsWithOutcome: 6,
            outcomesImproved: 5,
            outcomesNoChange: 1,
            outcomesWorsened: 0,
            actionRate: 0.8,
            improvementRate: 0.83,
            effectivenessScore: 0.83,
          },
        ],
      }),
      initialPerformance: performance({ summary: { ...performance().summary, validatedPredictions: 0 } }),
    });

    expect(screen.queryByText('Not enough resolved outcomes yet')).not.toBeInTheDocument();
    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.getByText('Not working')).toBeInTheDocument();
    expect(screen.getByText(/Calibration — awaiting/)).toBeInTheDocument();
  });

  it('renders a normal, non-consolidated calibration line once enough validated predictions exist', () => {
    renderBoard({
      initialPerformance: performance({
        summary: {
          totalPredictions: 20,
          validatedPredictions: 8,
          overallAccuracy: 0.7,
          meanAbsoluteError: 1.1,
          calibrationScore: 0.82,
          overconfidenceRate: 0.4,
          underconfidenceRate: 0.1,
        },
      }),
    });

    expect(screen.queryByText('Not enough resolved outcomes yet')).not.toBeInTheDocument();
    expect(screen.getByText(/Calibration 82% — trends overconfident\./)).toBeInTheDocument();
  });
});
