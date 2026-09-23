// @vitest-environment jsdom
/**
 * ============================================================================
 * PredictionsSection — the drill-down's StatTiles must honor their own
 * `required` threshold, not just `resolved === 0` (Package 11)
 * ----------------------------------------------------------------------------
 * Bug: "Overall accuracy" and "Calibration" both declared
 * `required={GLOBAL_LOW_CONFIDENCE_RESOLVED}` (50) but only went starved at
 * `resolved === 0` — so a player with 2 resolved predictions (e.g. 2-for-2)
 * showed a confident, non-dimmed "100%" here, on the very page whose Cockpit
 * tab (`PrimaryInstrument`/`isAccuracyHeadlineLive`) already gates the SAME
 * field on a real minimum-sample floor and shows "Calibrating" instead.
 * "Mean abs. error" declares `required={BUCKET_MIN_RESOLVED}` (5) and must
 * match that floor instead.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PredictionPerformanceData } from '@/app/golf/actions/coachhelm-analytics';
import { PredictionsSection } from './FairwayEffectiveness';

function perf(overrides: Partial<PredictionPerformanceData['summary']> = {}): PredictionPerformanceData {
  return {
    accuracyOverTime: [],
    calibration: [],
    errorDistribution: [],
    summary: {
      totalPredictions: 100,
      validatedPredictions: 0,
      overallAccuracy: 1,
      meanAbsoluteError: 0.1,
      calibrationScore: 1,
      overconfidenceRate: 0,
      underconfidenceRate: 0,
      ...overrides,
    },
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
  };
}

function tileState(label: string): string | null {
  return screen.getByText(label).closest('[data-slot="stat-tile"]')?.getAttribute('data-state') ?? null;
}

describe('PredictionsSection — StatTile starved gate matches its own required threshold', () => {
  it('starves Overall accuracy and Calibration on a low sample (2 of 50 required), even though the raw value is 100%', () => {
    const data = perf({ validatedPredictions: 2, overallAccuracy: 1, calibrationScore: 1 });
    render(<PredictionsSection data={data} />);

    expect(tileState('Overall accuracy')).toBe('insufficient-data');
    expect(tileState('Calibration')).toBe('insufficient-data');
    // A confident "100%" must not render while starved.
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('starves Mean abs. error under its own 5-sample floor', () => {
    const data = perf({ validatedPredictions: 3 });
    render(<PredictionsSection data={data} />);

    expect(tileState('Mean abs. error')).toBe('insufficient-data');
  });

  it('goes live once resolved reaches the declared required threshold', () => {
    const data = perf({ validatedPredictions: 60, overallAccuracy: 0.8, calibrationScore: 0.75 });
    render(<PredictionsSection data={data} />);

    expect(tileState('Overall accuracy')).toBe('ready');
    expect(tileState('Calibration')).toBe('ready');
    expect(tileState('Mean abs. error')).toBe('ready');
  });
});
