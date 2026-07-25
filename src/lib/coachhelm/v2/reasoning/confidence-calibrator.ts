/**
 * Confidence Calibrator — Backward-compatible class wrapper.
 *
 * Self-contained implementation that matches the functional feedback module
 * but avoids circular dependency issues with the barrel export.
 *
 * Calibration state used to live only in per-request in-memory, which meant
 * cold-start wiped the buckets (LIVE-19). Persisted state now lives in
 * `golf_confidence_calibration` and the nightly cron
 * (`/api/cron/coachhelm-calibration`) recomputes it from
 * `golf_prediction_validations`. The `bootstrapFromDb()` + `loadBuckets()`
 * helpers below read that persisted state so the engine's first call after
 * cold-start is already calibrated.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { logServerError } from '@/lib/server-error-logger';

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

  /**
   * Replace in-memory buckets with a bootstrapped snapshot (from DB). Returns
   * this for chaining.
   */
  setRecord(record: CalibrationRecord): this {
    this.record = record;
    return this;
  }
}

// ============================================================================
// DB PERSISTENCE + BOOTSTRAP
// ============================================================================

type AdminSupabase = SupabaseClient<Database>;

/** Row shape stored in `golf_confidence_calibration`. */
export interface CalibrationBucketRow {
  bucket: number; // bucket start (0, 0.2, 0.4, 0.6, 0.8)
  prediction_type: string;
  predictions_count: number;
  correct_count: number;
  actual_accuracy: number;
  calibration_error: number;
  sample_size: number;
}

// Module-level cache so repeated calls inside the same cold-start don't
// re-hit the DB. 5-minute TTL is enough to smooth bursty traffic without
// starving the calibrator of fresh nightly-cron output.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedBuckets: CalibrationBucketRow[] | null = null;
let cachedAt = 0;

/**
 * Invalidate the in-process cache so the next `loadBuckets` call refetches
 * from DB. Called by the nightly cron right after it writes.
 */
export function invalidateCalibrationCache(): void {
  cachedBuckets = null;
  cachedAt = 0;
}

/**
 * Read the persisted calibration buckets. Cached for 5 minutes per process.
 */
export async function loadBuckets(
  supabase: AdminSupabase,
): Promise<CalibrationBucketRow[]> {
  if (cachedBuckets && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedBuckets;
  }

  const { data, error } = await supabase
    .from('golf_confidence_calibration')
    .select('bucket, prediction_type, predictions_count, correct_count, actual_accuracy, calibration_error, sample_size');

  if (error) {
    await logServerError(
      `loadBuckets failed: ${error.message}`,
      {
        action: 'confidenceCalibrator.loadBuckets',
        featureArea: 'coachhelm',
        extra: { code: error.code },
      },
      'warning',
    );
    return cachedBuckets ?? [];
  }

  cachedBuckets = (data ?? []).map((row) => ({
    bucket: Number(row.bucket),
    prediction_type: row.prediction_type,
    predictions_count: row.predictions_count,
    correct_count: row.correct_count,
    actual_accuracy: Number(row.actual_accuracy),
    calibration_error: Number(row.calibration_error),
    sample_size: row.sample_size,
  }));
  cachedAt = Date.now();
  return cachedBuckets;
}

/**
 * Build a `CalibrationRecord` from persisted bucket rows for a given
 * prediction_type. If no rows exist for the type, returns an empty record.
 */
export async function bootstrapFromDb(
  supabase: AdminSupabase,
  predictionType: string,
): Promise<CalibrationRecord> {
  const rows = await loadBuckets(supabase);
  const forType = rows.filter((r) => r.prediction_type === predictionType);
  const record = createEmptyRecord();

  // The stored `bucket` column IS the range start — see computeBucketRows
  // below, which derives it from BUCKET_STARTS. So match it by identity, not
  // by containment. The previous predicate (`row.bucket < b.rangeEnd + 1e-9`)
  // applied its epsilon to EVERY bucket's rangeEnd, so each stored start also
  // satisfied the range below it and findIndex returned that earlier, wrong
  // one: 0.2/0.4/0.6/0.8 all misfiled one band low, and only 0 was correct.
  for (const row of forType) {
    const rangeIdx = record.buckets.findIndex(
      (b) => Math.abs(row.bucket - b.rangeStart) < 1e-9,
    );
    if (rangeIdx === -1) continue;
    const bucket = record.buckets[rangeIdx]!;
    record.buckets[rangeIdx] = {
      ...bucket,
      predictedCount: row.predictions_count,
      actualCorrect: row.correct_count,
      actualAccuracy: row.actual_accuracy,
      calibrationError: row.calibration_error,
    };
    record.totalPredictions += row.predictions_count;
  }

  return record;
}

/**
 * Helper used by the nightly cron: given a set of (confidence, wasAccurate)
 * outcomes grouped by prediction_type, returns the bucket rows to upsert.
 *
 * Buckets are the canonical 5 ranges [0,0.2), [0.2,0.4), [0.4,0.6),
 * [0.6,0.8), [0.8,1.0]. The stored `bucket` column is the range start so the
 * PK `(bucket, prediction_type)` stays stable across recomputes.
 */
export function computeBucketRows(
  validations: Array<{ prediction_type: string; confidence: number; within_interval: boolean }>,
): CalibrationBucketRow[] {
  const BUCKET_STARTS = [0, 0.2, 0.4, 0.6, 0.8] as const;
  const bucketKeyFor = (c: number) => {
    const clamped = Math.max(0, Math.min(0.9999999, c));
    const idx = Math.min(BUCKET_STARTS.length - 1, Math.floor(clamped / 0.2));
    return BUCKET_STARTS[idx]!;
  };

  // key = `${prediction_type}|${bucket_start}`
  const agg = new Map<
    string,
    { type: string; bucket: number; count: number; correct: number }
  >();

  for (const v of validations) {
    const bucket = bucketKeyFor(v.confidence);
    const key = `${v.prediction_type}|${bucket}`;
    const entry = agg.get(key) ?? {
      type: v.prediction_type,
      bucket,
      count: 0,
      correct: 0,
    };
    entry.count += 1;
    if (v.within_interval) entry.correct += 1;
    agg.set(key, entry);
  }

  return Array.from(agg.values()).map((e) => {
    const accuracy = e.count > 0 ? e.correct / e.count : 0;
    const midpoint = e.bucket + 0.1; // range is width 0.2
    return {
      bucket: e.bucket,
      prediction_type: e.type,
      predictions_count: e.count,
      correct_count: e.correct,
      actual_accuracy: accuracy,
      calibration_error: Math.abs(midpoint - accuracy),
      sample_size: e.count,
    };
  });
}
