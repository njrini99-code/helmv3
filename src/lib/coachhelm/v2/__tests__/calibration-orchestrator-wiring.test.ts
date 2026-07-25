import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateCalibrationCache } from '../reasoning/confidence-calibrator';

/**
 * Pins the actual production bug this task fixes: the orchestrator never
 * bootstrapped its calibrator, so `calibratedConfidence` was raw confidence
 * wearing a label. Every assertion here goes through the real orchestrator
 * singleton (dynamically re-imported per test for isolation) with only the
 * admin Supabase client stubbed — no real DB, no network.
 */

/** Prod's live score_to_par rows, verbatim: 0.4=1/1, 0.6=5/4, 0.8=11/11. */
const PROD_ROWS = [
  { bucket: 0.4, prediction_type: 'score_to_par', predictions_count: 1, correct_count: 1, actual_accuracy: 1, calibration_error: 0.5 },
  { bucket: 0.6, prediction_type: 'score_to_par', predictions_count: 5, correct_count: 4, actual_accuracy: 0.8, calibration_error: 0.1 },
  { bucket: 0.8, prediction_type: 'score_to_par', predictions_count: 11, correct_count: 11, actual_accuracy: 1, calibration_error: 0.1 },
];

const selectMock = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: selectMock }) }),
}));

/**
 * `coachHelmIntelligence` is an exported singleton, so a fresh
 * `calibrationBootstrapped` flag (and empty calibrator) per test requires a
 * fresh module instance, not just a fresh mock.
 */
async function freshOrchestrator() {
  vi.resetModules();
  const mod = await import('../orchestrator');
  return mod.coachHelmIntelligence;
}

describe('orchestrator calibration bootstrap wiring', () => {
  beforeEach(() => {
    selectMock.mockReset();
    selectMock.mockResolvedValue({ data: PROD_ROWS, error: null });
    invalidateCalibrationCache();
  });

  it('before bootstrapping, calibration returns the raw value', async () => {
    const orchestrator = await freshOrchestrator();
    expect(orchestrator.getCalibratedConfidence(0.65)).toBeCloseTo(0.65, 5);
  });

  it('after ensureCalibrationBootstrapped, 0.65 calibrates to the 0.6 band (4/5)', async () => {
    const orchestrator = await freshOrchestrator();
    await orchestrator.ensureCalibrationBootstrapped();
    // 0.8 (the wrong, misfiled band) would render as 1.0 if Step 0's mapping
    // fix regressed; 0.65 (unchanged) would mean this task's wiring regressed.
    // Only the fixed mapping + live wiring together produce 0.8.
    expect(orchestrator.getCalibratedConfidence(0.65)).toBeCloseTo(0.8, 5);
  });

  it('is idempotent: a second call does not refetch', async () => {
    const orchestrator = await freshOrchestrator();
    await orchestrator.ensureCalibrationBootstrapped();
    await orchestrator.ensureCalibrationBootstrapped();
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('degrades to raw passthrough when the DB call fails, without throwing', async () => {
    selectMock.mockRejectedValue(new Error('connection refused'));
    const orchestrator = await freshOrchestrator();
    await expect(orchestrator.ensureCalibrationBootstrapped()).resolves.toBeUndefined();
    expect(orchestrator.getCalibratedConfidence(0.65)).toBeCloseTo(0.65, 5);
  });
});
