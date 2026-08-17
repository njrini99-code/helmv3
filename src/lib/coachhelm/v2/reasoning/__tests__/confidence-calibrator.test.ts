/**
 * `confidence-calibrator.ts` had no test naming any export. `computeBucketRows`
 * is live in production: the `coachhelm-calibration` cron
 * (`src/app/api/cron/coachhelm-calibration/route.ts:122`) calls it, and
 * `background_job_logs` shows 46 completed runs, most recent 2026-08-17 03:40.
 *
 * Expectations are hand-computed from the definitions, not captured from the
 * implementation. Filed as part of #1481.
 *
 * THE BOUNDARY THIS FILE IS REALLY ABOUT
 *
 * Three functions here classify a confidence into the same five buckets, whose
 * top range is [0.8, 1.0], and all three treat an input of EXACTLY 1.0
 * differently:
 *
 *   calibrateConfidence      `.find(...) ?? buckets[last]`   → top bucket  ✓
 *   computeBucketRows        clamps to 0.9999999             → top bucket  ✓
 *   updateCalibrationRecord  half-open test, no fallback     → NO bucket   ✗
 *
 * The third still increments `totalPredictions`, so the record silently stops
 * satisfying "the bucket counts add up to the total".
 *
 * NOT OBSERVED IN PRODUCTION: `golf_predictions` holds 563 rows with a maximum
 * confidence of 0.8 and none at or above 0.999, so nothing has hit this yet. It
 * is reachable through the public API rather than through unusual data — the
 * function clamps its own input to [0, 1], so 1.0 is a value its contract says
 * it accepts, and `calibrateConfidence` can itself RETURN exactly 1.0 when a
 * bucket's accuracy is 1.0.
 */
import { describe, it, expect } from 'vitest';
import {
  computeBucketRows,
  calculateBrierScore,
  updateCalibrationRecord,
  createEmptyCalibrationRecord,
} from '@/lib/coachhelm/v2/reasoning/confidence-calibrator';

const v = (confidence: number, within_interval: boolean, prediction_type = 'scoreToPar') => ({
  prediction_type,
  confidence,
  within_interval,
});

describe('computeBucketRows', () => {
  it('floors a confidence into its 0.2-wide bucket', () => {
    const rows = computeBucketRows([
      v(0.0, true), v(0.19, true), // → bucket 0
      v(0.2, true),                // → bucket 0.2 (boundary belongs to the upper bucket)
      v(0.85, true),               // → bucket 0.8
    ]);
    expect(rows.map((r) => r.bucket).sort()).toEqual([0, 0.2, 0.8]);
    expect(rows.find((r) => r.bucket === 0)!.predictions_count).toBe(2);
  });

  it('puts confidence exactly 1.0 in the top bucket rather than off the end', () => {
    // The 0.9999999 clamp exists for this; without it the index would be 5.
    const rows = computeBucketRows([v(1.0, true)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.bucket).toBe(0.8);
  });

  it('clamps out-of-range confidences into the end buckets', () => {
    expect(computeBucketRows([v(-0.5, true)])[0]!.bucket).toBe(0);
    expect(computeBucketRows([v(1.7, true)])[0]!.bucket).toBe(0.8);
  });

  it('computes accuracy and calibration error against the bucket midpoint', () => {
    // Bucket 0.6 → midpoint 0.7. Three predictions, two correct → accuracy 2/3.
    const rows = computeBucketRows([v(0.65, true), v(0.7, true), v(0.75, false)]);
    const row = rows.find((r) => r.bucket === 0.6)!;
    expect(row.predictions_count).toBe(3);
    expect(row.correct_count).toBe(2);
    expect(row.actual_accuracy).toBeCloseTo(2 / 3, 10);
    expect(row.calibration_error).toBeCloseTo(Math.abs(0.7 - 2 / 3), 10);
  });

  it('keeps prediction types in separate buckets', () => {
    const rows = computeBucketRows([
      v(0.85, true, 'scoreToPar'),
      v(0.85, false, 'putting'),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.predictions_count === 1)).toBe(true);
  });

  it('returns no rows for no validations', () => {
    expect(computeBucketRows([])).toEqual([]);
  });
});

describe('calculateBrierScore', () => {
  it('is 0 for a perfectly confident correct call and 1 for the inverse', () => {
    expect(calculateBrierScore([{ confidence: 1, outcome: 1 }])).toBe(0);
    expect(calculateBrierScore([{ confidence: 0, outcome: 1 }])).toBe(1);
  });

  it('is the mean squared error across predictions', () => {
    // (0.8-1)² = 0.04 ; (0.3-0)² = 0.09 ; mean = 0.065
    expect(
      calculateBrierScore([
        { confidence: 0.8, outcome: 1 },
        { confidence: 0.3, outcome: 0 },
      ]),
    ).toBeCloseTo(0.065, 10);
  });

  it('returns 0 on an empty set — which reads as a PERFECT score', () => {
    // Pinned as a known sharp edge, not endorsed. 0 is the best possible Brier
    // score, so "no predictions" and "flawless predictions" are the same value.
    // Currently harmless: nothing renders this (only barrel re-exports and the
    // ConfidenceCalibrator class consume it). If it ever reaches a surface, it
    // needs to become null-honest first.
    expect(calculateBrierScore([])).toBe(0);
  });
});

describe('updateCalibrationRecord', () => {
  const sumCounts = (r: ReturnType<typeof createEmptyCalibrationRecord>) =>
    r.buckets.reduce((s, b) => s + b.predictedCount, 0);

  it('files a prediction into the matching bucket and counts it once', () => {
    const r = updateCalibrationRecord(createEmptyCalibrationRecord(), {
      confidence: 0.65,
      wasAccurate: true,
    });
    const bucket = r.buckets.find((b) => b.rangeStart === 0.6)!;
    expect(bucket.predictedCount).toBe(1);
    expect(bucket.actualCorrect).toBe(1);
    expect(bucket.actualAccuracy).toBe(1);
    // midpoint 0.7 vs accuracy 1 → 0.3
    expect(bucket.calibrationError).toBeCloseTo(0.3, 10);
    expect(r.totalPredictions).toBe(1);
    expect(sumCounts(r)).toBe(1);
  });

  it('treats a bucket boundary as belonging to the upper bucket', () => {
    const r = updateCalibrationRecord(createEmptyCalibrationRecord(), {
      confidence: 0.6,
      wasAccurate: false,
    });
    expect(r.buckets.find((b) => b.rangeStart === 0.6)!.predictedCount).toBe(1);
    expect(r.buckets.find((b) => b.rangeStart === 0.4)!.predictedCount).toBe(0);
  });

  it('keeps bucket counts adding up to the total at confidence exactly 1.0', () => {
    // The invariant. The top bucket is [0.8, 1.0] and the match is half-open,
    // so 1.0 lands nowhere — while totalPredictions is incremented regardless.
    const r = updateCalibrationRecord(createEmptyCalibrationRecord(), {
      confidence: 1.0,
      wasAccurate: true,
    });
    expect(r.totalPredictions).toBe(1);
    expect(sumCounts(r), 'a counted prediction must land in some bucket').toBe(1);
    expect(r.buckets.find((b) => b.rangeStart === 0.8)!.predictedCount).toBe(1);
  });

  it('clamps an out-of-range confidence into an end bucket, still counted once', () => {
    const high = updateCalibrationRecord(createEmptyCalibrationRecord(), {
      confidence: 4.2,
      wasAccurate: true,
    });
    expect(sumCounts(high)).toBe(1);

    const low = updateCalibrationRecord(createEmptyCalibrationRecord(), {
      confidence: -3,
      wasAccurate: false,
    });
    expect(sumCounts(low)).toBe(1);
    expect(low.buckets.find((b) => b.rangeStart === 0)!.predictedCount).toBe(1);
  });
});
