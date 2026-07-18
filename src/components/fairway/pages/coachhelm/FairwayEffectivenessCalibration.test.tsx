// @vitest-environment jsdom
/**
 * ============================================================================
 * CalibrationInstrument — one denominator for one starved metric (#950)
 * ----------------------------------------------------------------------------
 * Bug: the "Do the odds hold up?" panel stacks TWO readouts that are BOTH
 * starved off the exact same `summary.validatedPredictions` count — the
 * calibration dial ("Calibrating — 0 of 5") and, directly beneath it, the
 * "Predictions resolved" sub-readout. The sub-readout's `samples.need` was
 * wired to `GAUGE_MIN_RESOLVED` (2) instead of `BUCKET_MIN_RESOLVED` (5, the
 * SAME constant the dial above it uses), so a coach with zero resolved
 * predictions saw "0 of 5" stacked directly on top of "0 of 2" — two
 * different denominators for what reads as one progress toward one goal.
 *
 * This mirrors the exact class of bug FairwayEffectiveness.test.ts already
 * locked in for the primary accuracy headline (`isAccuracyHeadlineLive`) —
 * that fix didn't cover this second, easy-to-miss instance.
 *
 * Mocks only `Readout` (via the `@/components/fairway` barrel) so the rest of
 * the cockpit kit (InstrumentPanel, etc.) renders for real; NumberFlow /
 * custom-element quirks in `Readout` itself are irrelevant to this test.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PredictionPerformanceData } from '@/app/golf/actions/coachhelm-analytics';
import { CalibrationInstrument } from './FairwayEffectiveness';

interface CapturedReadout {
  label?: React.ReactNode;
  samples?: { have: number; need: number };
  state?: 'live' | 'awaiting';
}

const calls: CapturedReadout[] = [];

// vi.mock calls are hoisted above every import in this file (including the
// static `CalibrationInstrument` import above), so this still intercepts the
// `Readout` the component pulls from the shared barrel.
vi.mock('@/components/fairway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/fairway')>();
  return {
    ...actual,
    Readout: (props: CapturedReadout) => {
      calls.push({ label: props.label, samples: props.samples, state: props.state });
      return <div data-testid="readout-mock" />;
    },
  };
});

function perf(
  overrides: Partial<PredictionPerformanceData['summary']> = {},
  calibration: PredictionPerformanceData['calibration'] = [],
): PredictionPerformanceData {
  return {
    accuracyOverTime: [],
    calibration,
    errorDistribution: [],
    summary: {
      totalPredictions: 0,
      validatedPredictions: 0,
      overallAccuracy: 0,
      meanAbsoluteError: 0,
      calibrationScore: 0,
      overconfidenceRate: 0,
      underconfidenceRate: 0,
      ...overrides,
    },
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
  };
}

describe('CalibrationInstrument — consistent calibrating denominators', () => {
  it('gives the dial and the resolved-count sub-readout the SAME "need" while both are starved', () => {
    calls.length = 0;
    const data = perf({ validatedPredictions: 0, calibrationScore: 0 }, []);
    render(<CalibrationInstrument data={data} />);

    expect(calls).toHaveLength(2);
    const [dial, subReadout] = calls;

    expect(dial?.state).toBe('awaiting');
    expect(dial?.samples).toEqual({ have: 0, need: 5 });

    expect(subReadout?.state).toBe('awaiting');
    // The regression: this used to be `{ have: 0, need: 2 }` (GAUGE_MIN_RESOLVED).
    expect(subReadout?.samples).toEqual({ have: 0, need: 5 });
    expect(subReadout?.samples?.need).toBe(dial?.samples?.need);
  });

  it('the sub-readout goes live (no denominator at all) as soon as any prediction has resolved', () => {
    calls.length = 0;
    const data = perf({ validatedPredictions: 1, calibrationScore: 0 }, []);
    render(<CalibrationInstrument data={data} />);

    const subReadout = calls[1];
    expect(subReadout?.state).toBe('live');
    expect(subReadout?.samples).toBeUndefined();
  });
});
