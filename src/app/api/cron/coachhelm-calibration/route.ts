/**
 * Nightly CoachHelm calibration cron.
 *
 * Recomputes confidence-calibration buckets from the last 90 days of
 * `golf_prediction_validations` joined to `golf_predictions`, then upserts
 * into `golf_confidence_calibration` (PK `bucket, prediction_type`). Engine
 * cold-starts read these rows via `bootstrapFromDb` so the calibrator is
 * warm from the first analyzePlayer call.
 *
 * Schedule: `40 3 * * *` (see vercel.json).
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  computeBucketRows,
  invalidateCalibrationCache,
} from '@/lib/coachhelm/v2/reasoning/confidence-calibrator';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const LOOKBACK_DAYS = 90;
/**
 * PostgREST caps every response at 1000 rows, so 5000 here was a number that
 * lied — it returned 1000. Calibration is a statistical aggregate, so a
 * truncated, unordered sample would skew the curve silently. 29 validations
 * exist in total (12 in the last 30 days), so this bound has never bitten; if
 * it ever could, paginate with fetchAllRowsResult rather than raising it.
 */
const BATCH_LIMIT = 1000;

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('coachhelm-calibration', () => handleCalibration());
}

async function handleCalibration(): Promise<NextResponse> {
  const supabase = createAdminClient();
  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // golf_prediction_validations has no metric/confidence columns of its own,
  // so fetch validations and parent predictions separately and zip in memory.
  // (An FK now links the two tables; doing two queries keeps the type system
  // honest while still allowing a future migration to push this into a view.)
  const { data: validations, error: vErr } = await supabase
    .from('golf_prediction_validations')
    .select('prediction_id, within_interval')
    .gte('validated_at', sinceIso)
    .not('prediction_id', 'is', null)
    .limit(BATCH_LIMIT);

  if (vErr) {
    await logServerError(
      `cron.calibration.fetchValidations failed: ${vErr.message}`,
      {
        action: 'cron.coachhelm.calibration.fetch',
        featureArea: 'coachhelm',
        extra: { code: vErr.code },
      },
      'error',
    );
    return NextResponse.json(
      { success: false, error: vErr.message },
      { status: 500 },
    );
  }

  const predictionIds = Array.from(
    new Set((validations ?? []).map((v) => v.prediction_id).filter((id): id is string => !!id)),
  );

  let predictionsById = new Map<string, { confidence: number; metric: string }>();
  if (predictionIds.length > 0) {
    const { data: predictions, error: pErr } = await supabase
      .from('golf_predictions')
      .select('id, confidence, metric')
      .in('id', predictionIds);

    if (pErr) {
      await logServerError(
        `cron.calibration.fetchPredictions failed: ${pErr.message}`,
        {
          action: 'cron.coachhelm.calibration.fetch',
          featureArea: 'coachhelm',
          extra: { code: pErr.code, predictionIdsCount: predictionIds.length },
        },
        'error',
      );
      return NextResponse.json(
        { success: false, error: pErr.message },
        { status: 500 },
      );
    }

    predictionsById = new Map(
      (predictions ?? [])
        .filter((p) => p.confidence !== null && p.metric !== null)
        .map((p) => [p.id, { confidence: Number(p.confidence), metric: p.metric }]),
    );
  }

  const normalized = (validations ?? [])
    .map((v) => {
      if (!v.prediction_id) return null;
      const pred = predictionsById.get(v.prediction_id);
      if (!pred) return null;
      return {
        prediction_type: pred.metric,
        confidence: pred.confidence,
        within_interval: v.within_interval === true,
      };
    })
    .filter((x): x is { prediction_type: string; confidence: number; within_interval: boolean } => x !== null);

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
