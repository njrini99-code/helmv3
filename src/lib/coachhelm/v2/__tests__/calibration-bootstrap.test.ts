import { describe, expect, it } from 'vitest';
import {
  ConfidenceCalibrator,
  calibrateConfidence,
  createEmptyCalibrationRecord,
} from '../reasoning/confidence-calibrator';
import type { CalibrationRecord } from '../reasoning/confidence-calibrator';

/** Mirrors prod: score_to_par bucket 0.8 is 11/11 correct. */
function recordWithLiveBucket(): CalibrationRecord {
  const record = createEmptyCalibrationRecord();
  const idx = record.buckets.findIndex((b) => b.rangeStart >= 0.8 - 1e-9);
  record.buckets[idx] = {
    ...record.buckets[idx]!,
    predictedCount: 11,
    actualCorrect: 11,
    actualAccuracy: 1.0,
    calibrationError: 0,
  };
  record.totalPredictions = 11;
  return record;
}

describe('confidence calibration bootstrap', () => {
  it('an un-bootstrapped calibrator is a no-op (the bug)', () => {
    const cal = new ConfidenceCalibrator();
    expect(cal.calibrate(0.85)).toBeCloseTo(0.85, 5);
  });

  it('a bootstrapped calibrator actually moves the number', () => {
    const cal = new ConfidenceCalibrator().setRecord(recordWithLiveBucket());
    const calibrated = cal.calibrate(0.85);
    expect(calibrated).not.toBeCloseTo(0.85, 5);
  });

  it('buckets under the 5-sample floor still pass through unchanged', () => {
    const record = createEmptyCalibrationRecord();
    const idx = record.buckets.findIndex((b) => b.rangeStart >= 0.4 - 1e-9);
    record.buckets[idx] = { ...record.buckets[idx]!, predictedCount: 1, actualCorrect: 1 };
    expect(calibrateConfidence(0.45, record)).toBeCloseTo(0.45, 5);
  });
});
