import { describe, expect, it } from 'vitest';
import {
  bootstrapFromDb,
  invalidateCalibrationCache,
  loadBuckets,
} from '../reasoning/confidence-calibrator';

/**
 * Sentry JAVASCRIPT-NEXTJS-SB: `GET /golf/dashboard` issued one
 * `golf_confidence_calibration` read per insight. The feed ranker scores every
 * insight inside one `Promise.all` (insight-delivery-ranking.ts), and each
 * score calls `bootstrapFromDb` -> `loadBuckets`. The 5-minute cache is only
 * filled AFTER the read resolves, so on a cold process every concurrent caller
 * missed it and ran its own identical query.
 */
const ROWS = [
  { bucket: 0.8, prediction_type: 'score_to_par', predictions_count: 11, correct_count: 11, actual_accuracy: 1, calibration_error: 0.2, sample_size: 11 },
];

function countingSupabase(result: { data: unknown[] | null; error: { message: string; code?: string } | null }) {
  let reads = 0;
  const client = {
    from: () => ({
      select: () => {
        reads += 1;
        return new Promise((resolve) => setTimeout(() => resolve(result), 5));
      },
    }),
  } as never;
  return { client, reads: () => reads };
}

describe('calibration bucket load under concurrency', () => {
  it('concurrent cold-cache callers share one read', async () => {
    invalidateCalibrationCache();
    const sb = countingSupabase({ data: ROWS, error: null });

    const records = await Promise.all(
      Array.from({ length: 8 }, () => bootstrapFromDb(sb.client, 'score_to_par')),
    );

    expect(sb.reads()).toBe(1);
    for (const record of records) expect(record.totalPredictions).toBe(11);
  });

  it('a failed read is not cached: the next call reads again', async () => {
    invalidateCalibrationCache();
    const failing = countingSupabase({ data: null, error: { message: 'boom', code: 'XX000' } });
    await expect(Promise.all([loadBuckets(failing.client), loadBuckets(failing.client)])).resolves.toEqual([[], []]);
    expect(failing.reads()).toBe(1);

    const ok = countingSupabase({ data: ROWS, error: null });
    await expect(loadBuckets(ok.client)).resolves.toHaveLength(1);
    expect(ok.reads()).toBe(1);
  });
});
