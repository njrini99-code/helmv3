import { describe, expect, it } from 'vitest';
import { bootstrapFromDb, invalidateCalibrationCache } from '../reasoning/confidence-calibrator';

/**
 * Prod contains buckets for prediction types no code produces any more
 * (`general` and `round_score`, frozen 2026-03-14 at 0/61 correct). They are
 * harmless ONLY because bootstrap filters by prediction_type. This test makes
 * that load-bearing filter explicit: without it, a 0%-accuracy bucket would
 * become live calibration and crush every high-confidence prediction.
 */
function supabaseReturning(rows: unknown[]) {
  return {
    from: () => ({ select: () => Promise.resolve({ data: rows, error: null }) }),
  } as never;
}

// NOTE: score_to_par uses bucket 0.85, not 0.8. bootstrapFromDb's range
// match (`row.bucket < b.rangeEnd + 1e-9`) applies its epsilon fudge to
// EVERY bucket's rangeEnd, not just the last one, so a value of exactly
// 0.8 satisfies both [0.6,0.8) and [0.8,1.0] and findIndex silently picks
// the earlier (wrong) one. That's a pre-existing quirk in the range-mapping
// step, unrelated to the prediction_type filter under test here — 0.85
// sidesteps it so this test isolates the filter, not that quirk. The dead
// types' bucket value is irrelevant since prediction_type excludes them
// before range-mapping ever runs.
const STALE_AND_LIVE = [
  { bucket: 0.8, prediction_type: 'general', predictions_count: 30, correct_count: 0, actual_accuracy: 0, calibration_error: 0.8 },
  { bucket: 0.8, prediction_type: 'round_score', predictions_count: 30, correct_count: 0, actual_accuracy: 0, calibration_error: 0.8 },
  { bucket: 0.85, prediction_type: 'score_to_par', predictions_count: 11, correct_count: 11, actual_accuracy: 1, calibration_error: 0.2 },
];

describe('calibration bootstrap type filter', () => {
  it('loads only the requested prediction type, never a dead one', async () => {
    invalidateCalibrationCache();
    const record = await bootstrapFromDb(supabaseReturning(STALE_AND_LIVE), 'score_to_par');
    // 11 from score_to_par only — NOT 71 (which would mean the two
    // 0%-accuracy types leaked in).
    expect(record.totalPredictions).toBe(11);
    const top = record.buckets.find((b) => b.rangeStart >= 0.8 - 1e-9)!;
    expect(top.actualCorrect).toBe(11);
  });

  it('returns an empty record for a type with no rows rather than falling back', async () => {
    invalidateCalibrationCache();
    const record = await bootstrapFromDb(supabaseReturning(STALE_AND_LIVE), 'nonexistent_type');
    expect(record.totalPredictions).toBe(0);
  });
});
