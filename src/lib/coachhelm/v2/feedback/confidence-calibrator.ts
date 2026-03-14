/**
 * Confidence Calibrator — Real Confidence Calibration
 *
 * Ensures stated confidence matches actual accuracy using calibration buckets.
 * Pure functions for calibration logic; no database dependencies.
 */

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// BUCKET HELPERS
// ============================================================================

/** The 5 calibration buckets: [0,0.2), [0.2,0.4), [0.4,0.6), [0.6,0.8), [0.8,1.0] */
const BUCKET_RANGES: Array<[number, number]> = [
  [0, 0.2],
  [0.2, 0.4],
  [0.4, 0.6],
  [0.6, 0.8],
  [0.8, 1.0],
];

function getBucketIndex(confidence: number): number {
  if (confidence >= 1.0) return 4;
  if (confidence < 0) return 0;
  const idx = Math.floor(confidence / 0.2);
  return Math.min(idx, 4);
}

function bucketMidpoint(bucket: CalibrationBucket): number {
  return (bucket.rangeStart + bucket.rangeEnd) / 2;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Creates an empty CalibrationRecord with 5 buckets, all zeroed out.
 */
export function createEmptyCalibrationRecord(): CalibrationRecord {
  const buckets: CalibrationBucket[] = BUCKET_RANGES.map(([start, end]) => ({
    rangeStart: start,
    rangeEnd: end,
    predictedCount: 0,
    actualCorrect: 0,
    actualAccuracy: 0,
    calibrationError: 0,
  }));

  return {
    buckets,
    brierScore: 0,
    expectedCalibrationError: 0,
    totalPredictions: 0,
  };
}

/**
 * Calibrates a raw confidence value based on historical accuracy in the
 * matching bucket. If the bucket has fewer than 5 predictions, returns
 * rawConfidence unchanged.
 */
export function calibrateConfidence(
  rawConfidence: number,
  record: CalibrationRecord
): number {
  const idx = getBucketIndex(rawConfidence);
  const bucket = record.buckets[idx];

  if (!bucket || bucket.predictedCount < 5) {
    return rawConfidence;
  }

  return bucket.actualAccuracy;
}

/**
 * Updates a CalibrationRecord with a new prediction outcome.
 * Returns a new record (immutable).
 */
export function updateCalibrationRecord(
  record: CalibrationRecord,
  prediction: { confidence: number; wasAccurate: boolean }
): CalibrationRecord {
  const idx = getBucketIndex(prediction.confidence);
  const newBuckets = record.buckets.map((b, i) => {
    if (i !== idx) return { ...b };

    const predictedCount = b.predictedCount + 1;
    const actualCorrect = b.actualCorrect + (prediction.wasAccurate ? 1 : 0);
    const actualAccuracy = predictedCount > 0 ? actualCorrect / predictedCount : 0;
    const mid = bucketMidpoint(b);
    const calibrationError = Math.abs(mid - actualAccuracy);

    return {
      ...b,
      predictedCount,
      actualCorrect,
      actualAccuracy,
      calibrationError,
    };
  });

  const totalPredictions = record.totalPredictions + 1;

  // Recalculate ECE: weighted average of |midpoint - accuracy| across buckets
  let eceNumerator = 0;
  let eceWeight = 0;
  for (const bucket of newBuckets) {
    if (bucket.predictedCount > 0) {
      eceNumerator += bucket.calibrationError * bucket.predictedCount;
      eceWeight += bucket.predictedCount;
    }
  }
  const expectedCalibrationError = eceWeight > 0 ? eceNumerator / eceWeight : 0;

  return {
    buckets: newBuckets,
    brierScore: record.brierScore, // Brier score requires full history; unchanged here
    expectedCalibrationError,
    totalPredictions,
  };
}

/**
 * Calculates the Brier score: mean of (confidence - outcome)^2
 * Lower is better. Perfect calibration = 0.
 */
export function calculateBrierScore(
  predictions: Array<{ confidence: number; outcome: 0 | 1 }>
): number {
  if (predictions.length === 0) return 0;

  let sum = 0;
  for (const p of predictions) {
    sum += Math.pow(p.confidence - p.outcome, 2);
  }

  return sum / predictions.length;
}
