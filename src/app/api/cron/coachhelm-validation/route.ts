/**
 * Hourly CoachHelm outcome-validation cron.
 *
 * Pulls predictions whose `due_date` has passed but which have never been
 * validated, resolves each against the player's completed rounds inside the
 * prediction window, and persists the result to
 * `golf_prediction_validations`. Denormalizes `validated_at`, `actual_value`,
 * `was_accurate` back onto `golf_predictions` so cold-start readers see the
 * outcome without a join.
 *
 * Schedule: `15 * * * *` (see vercel.json).
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  validatePredictionAgainstOutcome,
  type RipePrediction,
} from '@/lib/coachhelm/v2/learning/outcome-validator';
import { logServerError } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BATCH_LIMIT = 500;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const supabase = createAdminClient();

  // Predictions whose due_date is >24h in the past and which still have
  // validated_at NULL. (golf_predictions has no validation_id column — it
  // uses validated_at IS NULL as the unvalidated sentinel.)
  const ripeBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: ripe, error } = await supabase
    .from('golf_predictions')
    .select(
      'id, player_id, metric, predicted_value, predicted_low, predicted_high, confidence_interval_low, confidence_interval_high, due_date, created_at, related_round_id',
    )
    .is('validated_at', null)
    .not('due_date', 'is', null)
    .lt('due_date', ripeBefore)
    .limit(BATCH_LIMIT);

  if (error) {
    await logServerError(
      `cron.validation.fetch failed: ${error.message}`,
      {
        action: 'cron.coachhelm.validation.fetch',
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

  let validated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of ripe ?? []) {
    const prediction: RipePrediction = {
      id: row.id,
      player_id: row.player_id,
      metric: row.metric,
      predicted_value: Number(row.predicted_value),
      predicted_low: row.predicted_low !== null ? Number(row.predicted_low) : null,
      predicted_high: row.predicted_high !== null ? Number(row.predicted_high) : null,
      confidence_interval_low:
        row.confidence_interval_low !== null ? Number(row.confidence_interval_low) : null,
      confidence_interval_high:
        row.confidence_interval_high !== null ? Number(row.confidence_interval_high) : null,
      due_date: row.due_date,
      created_at: row.created_at,
      related_round_id: row.related_round_id,
    };

    try {
      const result = await validatePredictionAgainstOutcome(supabase, prediction);
      if (result) {
        validated++;
      } else {
        skipped++;
      }
    } catch (err) {
      failed++;
      await logServerError(
        `cron.validation.validate failed: ${err instanceof Error ? err.message : String(err)}`,
        {
          action: 'cron.coachhelm.validation.validate',
          featureArea: 'coachhelm',
          extra: {
            predictionId: prediction.id,
            playerId: prediction.player_id,
            metric: prediction.metric,
            stack: err instanceof Error ? err.stack : undefined,
          },
        },
        'error',
      );
    }
  }

  return NextResponse.json({
    success: true,
    total: (ripe ?? []).length,
    validated,
    skipped,
    failed,
  });
}
