/**
 * Nightly CoachHelm calibration cron.
 *
 * Recomputes confidence-calibration buckets from the last 90 days of
 * `golf_prediction_validations` joined to `golf_predictions`, then upserts
 * into `golf_confidence_calibration` (PK `bucket, prediction_type`). Engine
 * cold-starts read these rows via `bootstrapFromDb` so the calibrator is
 * warm from the first analyzePlayer call.
 *
 * Schedule: `30 3 * * *` (see vercel.json).
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  computeBucketRows,
  invalidateCalibrationCache,
} from '@/lib/coachhelm/v2/reasoning/confidence-calibrator';
import { logServerError } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const LOOKBACK_DAYS = 90;
const BATCH_LIMIT = 5000;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const supabase = createAdminClient();
  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Pull validations with the parent prediction's confidence + metric
  // (prediction_type). `golf_prediction_validations` has no metric column of
  // its own so we join via the FK.
  const { data: rows, error } = await supabase
    .from('golf_prediction_validations')
    .select(
      'within_interval, predicted_value, actual_value, golf_predictions!inner(confidence, metric)',
    )
    .gte('validated_at', sinceIso)
    .limit(BATCH_LIMIT);

  if (error) {
    await logServerError(
      `cron.calibration.fetch failed: ${error.message}`,
      {
        action: 'cron.coachhelm.calibration.fetch',
        featureArea: 'coachhelm',
        extra: { code: error.code },
      },
      'error',
    );
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  type Row = {
    within_interval: boolean | null;
    golf_predictions:
      | { confidence: number | null; metric: string | null }
      | Array<{ confidence: number | null; metric: string | null }>
      | null;
  };

  const normalized = ((rows ?? []) as Row[])
    .map((r) => {
      const pred = Array.isArray(r.golf_predictions) ? r.golf_predictions[0] : r.golf_predictions;
      const confidence = pred?.confidence;
      const metric = pred?.metric;
      if (confidence === null || confidence === undefined || !metric) return null;
      return {
        prediction_type: metric,
        confidence: Number(confidence),
        within_interval: r.within_interval === true,
      };
    })
    .filter((v): v is { prediction_type: string; confidence: number; within_interval: boolean } => v !== null);

  const bucketRows = computeBucketRows(normalized);

  if (bucketRows.length === 0) {
    return NextResponse.json({
      success: true,
      totalValidations: normalized.length,
      bucketsWritten: 0,
    });
  }

  const nowIso = new Date().toISOString();
  const payload = bucketRows.map((b) => ({
    ...b,
    updated_at: nowIso,
  }));

  const { error: upsertErr } = await supabase
    .from('golf_confidence_calibration')
    .upsert(payload, { onConflict: 'bucket,prediction_type' });

  if (upsertErr) {
    await logServerError(
      `cron.calibration.upsert failed: ${upsertErr.message}`,
      {
        action: 'cron.coachhelm.calibration.upsert',
        featureArea: 'coachhelm',
        extra: { code: upsertErr.code, bucketsCount: bucketRows.length },
      },
      'error',
    );
    return NextResponse.json(
      { success: false, error: upsertErr.message },
      { status: 500 },
    );
  }

  invalidateCalibrationCache();

  return NextResponse.json({
    success: true,
    totalValidations: normalized.length,
    bucketsWritten: bucketRows.length,
  });
}
