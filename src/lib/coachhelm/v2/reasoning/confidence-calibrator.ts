// Wrapper class for backward compatibility — delegates to feedback module functions
import {
  calibrateConfidence as calibrateFn,
  updateCalibrationRecord as updateFn,
  calculateBrierScore as brierFn,
  createEmptyCalibrationRecord,
  type CalibrationRecord,
  type CalibrationBucket,
} from '../feedback/confidence-calibrator';

export { calibrateFn as calibrateConfidence, updateFn as updateCalibrationRecord, brierFn as calculateBrierScore, createEmptyCalibrationRecord };
export type { CalibrationBucket, CalibrationRecord };

/**
 * Backward-compatible class wrapper used by the orchestrator.
 * Delegates all logic to the functional feedback/confidence-calibrator module.
 */
export class ConfidenceCalibrator {
  private record: CalibrationRecord;

  constructor() {
    this.record = createEmptyCalibrationRecord();
  }

  calibrate(rawConfidence: number, _insightType?: string): number {
    return calibrateFn(rawConfidence, this.record);
  }

  update(prediction: { confidence: number; wasAccurate: boolean }): void {
    this.record = updateFn(this.record, prediction);
  }

  getBrierScore(predictions: Array<{ confidence: number; outcome: 0 | 1 }>): number {
    return brierFn(predictions);
  }

  getRecord(): CalibrationRecord {
    return this.record;
  }
}
