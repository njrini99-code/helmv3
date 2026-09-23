// @vitest-environment jsdom
/**
 * ============================================================================
 * PrimaryInstrument — the Climbing/Holding delta chip must not call a flat
 * (zero-delta) accuracy trend "Climbing" (Package 11)
 * ----------------------------------------------------------------------------
 * Bug: `climbing` used `lastPoint.accuracyRate >= firstPoint.accuracyRate`,
 * so an unchanged validated-accuracy rate across the series (delta exactly
 * 0) still rendered the up-arrow, the success-tinted chip, and the word
 * "Climbing" next to "+0%" — a direction claim the data doesn't support.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PredictionPerformanceData } from '@/app/golf/actions/coachhelm-analytics';
import { PrimaryInstrument } from './FairwayEffectiveness';

const BUCKET_MIN_RESOLVED = 5; // must stay live for the chip to render at all

function perf(accuracyOverTime: PredictionPerformanceData['accuracyOverTime']): PredictionPerformanceData {
  return {
    accuracyOverTime,
    calibration: [],
    errorDistribution: [],
    summary: {
      totalPredictions: 100,
      validatedPredictions: BUCKET_MIN_RESOLVED,
      overallAccuracy: 0.6,
      meanAbsoluteError: 0.1,
      calibrationScore: 0.6,
      overconfidenceRate: 0,
      underconfidenceRate: 0,
    },
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
  };
}

describe('PrimaryInstrument — Climbing/Holding delta chip', () => {
  it('shows Holding, not Climbing, when the validated accuracy rate is unchanged (delta 0)', () => {
    const data = perf([
      { date: '2026-01-01', accuracyRate: 0.6, predictionsMade: 5, predictionsValidated: 5 },
      { date: '2026-01-15', accuracyRate: 0.6, predictionsMade: 5, predictionsValidated: 5 },
    ]);
    render(<PrimaryInstrument data={data} days={30} />);

    expect(screen.getByText(/Holding/)).toBeInTheDocument();
    expect(screen.queryByText(/Climbing/)).toBeNull();
  });

  it('still shows Climbing when the validated accuracy rate genuinely rose', () => {
    const data = perf([
      { date: '2026-01-01', accuracyRate: 0.5, predictionsMade: 5, predictionsValidated: 5 },
      { date: '2026-01-15', accuracyRate: 0.7, predictionsMade: 5, predictionsValidated: 5 },
    ]);
    render(<PrimaryInstrument data={data} days={30} />);

    expect(screen.getByText(/Climbing/)).toBeInTheDocument();
    expect(screen.queryByText(/Holding/)).toBeNull();
  });
});
