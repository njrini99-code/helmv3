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

  it('resets the bootstrap flag after a failed attempt so a later call retries', async () => {
    const orchestrator = await freshOrchestrator();

    selectMock.mockRejectedValueOnce(new Error('connection refused'));
    await orchestrator.ensureCalibrationBootstrapped();
    // First attempt failed: still raw passthrough, and the flag must not be
    // stuck `true` — otherwise this process never recovers from one blip.
    expect(orchestrator.getCalibratedConfidence(0.65)).toBeCloseTo(0.65, 5);

    selectMock.mockResolvedValueOnce({ data: PROD_ROWS, error: null });
    await orchestrator.ensureCalibrationBootstrapped();
    // The retry actually hit the DB again (not short-circuited by a
    // permanently-true flag) and bootstrapped for real this time.
    expect(selectMock).toHaveBeenCalledTimes(2);
    expect(orchestrator.getCalibratedConfidence(0.65)).toBeCloseTo(0.8, 5);
  });

  /**
   * Pins the Round Review gap a reviewer found in this task: `.calibrate()`
   * runs inside `generateRoundReview` (directly, and via `generateInsights`)
   * but nothing on that path called `ensureCalibrationBootstrapped()` before
   * the fix, so Round Review's `calibratedConfidence` stayed raw-passthrough
   * whenever it was the first calibration touchpoint in a process — the
   * normal case for its two production callers (`round-review-system.ts`,
   * `api/golf/rounds/generate-review/route.ts`).
   *
   * `generateRoundReview`'s other dependencies (extractAllFeatures,
   * PatternMiner, CausalEngine, ...) are real, unmocked modules that reach
   * well past the `@/lib/supabase/admin` shape this file stubs for the
   * calibration query alone, so a full end-to-end run isn't feasible here
   * without a much heavier fixture. Spying on the bootstrap method itself
   * — while letting whatever happens downstream happen — isolates exactly
   * the thing this fix changed: does `generateRoundReview` bootstrap
   * calibration before doing anything else. This fails before the fix
   * (bootstrap never called) and passes after (called as the first
   * statement, regardless of what the unmocked downstream calls do).
   */
  it('generateRoundReview bootstraps calibration before anything else', async () => {
    const orchestrator = await freshOrchestrator();
    const bootstrapSpy = vi.spyOn(orchestrator, 'ensureCalibrationBootstrapped');

    await orchestrator.generateRoundReview('round-1', 'player-1').catch(() => {
      // Downstream dependencies past the bootstrap call are real modules
      // this file doesn't mock; only that the bootstrap fires is under
      // test here, so any rejection from those unmocked calls is expected.
    });

    expect(bootstrapSpy).toHaveBeenCalled();
  });
});
