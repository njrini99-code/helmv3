import { describe, expect, it } from 'vitest';
import {
  bootstrapFromDb,
  calibrateConfidence,
  invalidateCalibrationCache,
} from '../reasoning/confidence-calibrator';
import type { CalibrationRecord } from '../reasoning/confidence-calibrator';

function supabaseReturning(rows: unknown[]) {
  return {
    from: () => ({ select: () => Promise.resolve({ data: rows, error: null }) }),
  } as never;
}

/** Prod's live score_to_par rows, verbatim: 0.4=1/1, 0.6=5/4, 0.8=11/11. */
const PROD_ROWS = [
  { bucket: 0.4, prediction_type: 'score_to_par', predictions_count: 1, correct_count: 1, actual_accuracy: 1, calibration_error: 0.5 },
  { bucket: 0.6, prediction_type: 'score_to_par', predictions_count: 5, correct_count: 4, actual_accuracy: 0.8, calibration_error: 0.1 },
  { bucket: 0.8, prediction_type: 'score_to_par', predictions_count: 11, correct_count: 11, actual_accuracy: 1, calibration_error: 0.1 },
];

const at = (record: CalibrationRecord, start: number) =>
  record.buckets.find((b) => Math.abs(b.rangeStart - start) < 1e-9)!;

describe('bootstrapFromDb bucket mapping', () => {
  it('files each stored range-start into its OWN range, not the band below', async () => {
    invalidateCalibrationCache();
    const record = await bootstrapFromDb(supabaseReturning(PROD_ROWS), 'score_to_par');
    expect(at(record, 0.4).predictedCount).toBe(1);
    expect(at(record, 0.6).predictedCount).toBe(5);
    expect(at(record, 0.8).predictedCount).toBe(11);
    // Bands with no stored row stay empty.
    expect(at(record, 0).predictedCount).toBe(0);
    expect(at(record, 0.2).predictedCount).toBe(0);
    expect(record.totalPredictions).toBe(17);
  });

  it('calibrates 0.65 from the 0.6 band (4/5), not the 0.8 band (11/11)', async () => {
    invalidateCalibrationCache();
    const record = await bootstrapFromDb(supabaseReturning(PROD_ROWS), 'score_to_par');
    // The 0.6 band is 4/5 = 0.80 and clears the 5-sample floor exactly.
    // Pre-fix this returned 1.0 — the 11/11 bucket misfiled one band low.
    expect(calibrateConfidence(0.65, record)).toBeCloseTo(0.8, 5);
  });
});
