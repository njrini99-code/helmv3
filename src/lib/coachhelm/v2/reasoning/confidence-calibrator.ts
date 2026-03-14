/**
 * Confidence Calibrator — Backward-compatible class wrapper.
 *
 * Self-contained implementation that matches the functional feedback module
 * but avoids circular dependency issues with the barrel export.
 */

export interface CalibrationBucket {
  rangeStart: number;
  rangeEnd: number;
  predictedCount: number;
  actualCorrect: number;
  actualAccuracy: number;
  calibrationError: number;
}

export interface CalibrationRecord {
  buckets: CalibrationBucket[];
  brierScore: number;
  expectedCalibrationError: number;
  totalPredictions: number;
}

function createEmptyRecord(): CalibrationRecord {
  const ranges = [
    [0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.0],
  ] as const;
  return {
    buckets: ranges.map(([start, end]) => ({
      rangeStart: start,
      rangeEnd: end,
      predictedCount: 0,
      actualCorrect: 0,
      actualAccuracy: 0,
      calibrationError: 0,
    })),
    brierScore: 0,
    expectedCalibrationError: 0,
    totalPredictions: 0,
  };
}

export function calibrateConfidence(rawConfidence: number, record: CalibrationRecord): number {
  const clamped = Math.max(0, Math.min(1, rawConfidence));
  const bucket = record.buckets.find(
    (b) => clamped >= b.rangeStart && clamped < b.rangeEnd,
  ) ?? record.buckets[record.buckets.length - 1]!;
  if (!bucket || bucket.predictedCount < 5) return clamped;
  return bucket.actualAccuracy;
}

export function updateCalibrationRecord(
  record: CalibrationRecord,
  prediction: { confidence: number; wasAccurate: boolean },
): CalibrationRecord {
  const clamped = Math.max(0, Math.min(1, prediction.confidence));
  const newBuckets = record.buckets.map((b) => {
    if (clamped < b.rangeStart || clamped >= b.rangeEnd) return b;
    const count = b.predictedCount + 1;
    const correct = b.actualCorrect + (prediction.wasAccurate ? 1 : 0);
    const accuracy = count > 0 ? correct / count : 0;
    const midpoint = (b.rangeStart + b.rangeEnd) / 2;
    return {
      ...b,
      predictedCount: count,
      actualCorrect: correct,
      actualAccuracy: accuracy,
      calibrationError: Math.abs(midpoint - accuracy),
    };
  });
  const total = record.totalPredictions + 1;
  return { ...record, buckets: newBuckets, totalPredictions: total };
}

export function calculateBrierScore(
  predictions: Array<{ confidence: number; outcome: 0 | 1 }>,
): number {
  if (predictions.length === 0) return 0;
  const sum = predictions.reduce(
    (acc, p) => acc + (p.confidence - p.outcome) ** 2,
    0,
  );
  return sum / predictions.length;
}

export const createEmptyCalibrationRecord = createEmptyRecord;

/**
 * Backward-compatible class used by the orchestrator via `new ConfidenceCalibrator()`.
 */
export class ConfidenceCalibrator {
  private record: CalibrationRecord;

  constructor() {
    this.record = createEmptyRecord();
  }

  calibrate(rawConfidence: number, _insightType?: string): number {
    return calibrateConfidence(rawConfidence, this.record);
  }

  update(prediction: { confidence: number; wasAccurate: boolean }): void {
    this.record = updateCalibrationRecord(this.record, prediction);
  }

  getBrierScore(predictions: Array<{ confidence: number; outcome: 0 | 1 }>): number {
    return calculateBrierScore(predictions);
  }

  getRecord(): CalibrationRecord {
    return this.record;
  }
}
