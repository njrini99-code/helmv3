/**
 * Outcome Validator — Backward-compatible class wrapper.
 *
 * Self-contained implementation that matches the functional feedback module
 * but avoids circular dependency issues with the barrel export.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { logServerError } from '@/lib/server-error-logger';

export interface ValidationResult {
  predictionId: string;
  playerId: string;
  predictedValue: number;
  actualValue: number;
  error: number;
  errorPct: number;
  withinInterval: boolean;
  direction: 'overestimate' | 'underestimate' | 'accurate';
}

export interface PredictionAccuracyMetrics {
  totalValidated: number;
  meanAbsoluteError: number;
  withinIntervalRate: number;
  overestimateRate: number;
  underestimateRate: number;
  accurateRate: number;
}

export interface PredictionAdjustments {
  biasCorrection: number;
  confidenceMultiplier: number;
}

export function validatePrediction(
  predicted: { value: number; low: number; high: number },
  actual: number,
): ValidationResult {
  const error = Math.abs(predicted.value - actual);
  const errorPct = actual !== 0 ? (error / Math.abs(actual)) * 100 : 0;
  const withinInterval = actual >= predicted.low && actual <= predicted.high;
  let direction: ValidationResult['direction'] = 'accurate';
  if (error >= 0.5) {
    direction = predicted.value > actual ? 'overestimate' : 'underestimate';
  }
  return {
    predictionId: '',
    playerId: '',
    predictedValue: predicted.value,
    actualValue: actual,
    error,
    errorPct,
    withinInterval,
    direction,
  };
}

export function calculateAccuracyMetrics(
  validations: ValidationResult[],
): PredictionAccuracyMetrics {
  if (validations.length === 0) {
    return { totalValidated: 0, meanAbsoluteError: 0, withinIntervalRate: 0, overestimateRate: 0, underestimateRate: 0, accurateRate: 0 };
  }
  const total = validations.length;
  const mae = validations.reduce((s, v) => s + v.error, 0) / total;
  const within = validations.filter((v) => v.withinInterval).length / total;
  const over = validations.filter((v) => v.direction === 'overestimate').length / total;
  const under = validations.filter((v) => v.direction === 'underestimate').length / total;
  const accurate = validations.filter((v) => v.direction === 'accurate').length / total;
  return { totalValidated: total, meanAbsoluteError: mae, withinIntervalRate: within, overestimateRate: over, underestimateRate: under, accurateRate: accurate };
}

export function calculateAdjustments(
  validations: ValidationResult[],
): PredictionAdjustments {
  if (validations.length < 3) {
    return { biasCorrection: 0, confidenceMultiplier: 1.0 };
  }
  const bias = validations.reduce((s, v) => s + (v.predictedValue - v.actualValue), 0) / validations.length;
  const withinRate = validations.filter((v) => v.withinInterval).length / validations.length;
  let multiplier = 1.0;
  if (withinRate < 0.7) multiplier = 1.2;
  else if (withinRate > 0.95) multiplier = 0.8;
  return { biasCorrection: bias, confidenceMultiplier: multiplier };
}

/**
 * Backward-compatible class used by the orchestrator via `new OutcomeValidator()`.
 */
export class OutcomeValidator {
  private validations: ValidationResult[] = [];

  validate(predicted: { value: number; low: number; high: number }, actual: number): ValidationResult {
    const result = validatePrediction(predicted, actual);
    this.validations.push(result);
    return result;
  }

  getAccuracyMetrics(): PredictionAccuracyMetrics {
    return calculateAccuracyMetrics(this.validations);
  }

  getAdjustments(): PredictionAdjustments {
    return calculateAdjustments(this.validations);
  }

  getValidations(): ValidationResult[] {
    return this.validations;
  }
}

// ============================================================================
// DB-AWARE VALIDATION (used by /api/cron/coachhelm-validation)
// ============================================================================

type AdminSupabase = SupabaseClient<Database>;

export interface RipePrediction {
  id: string;
  player_id: string;
  metric: string;
  predicted_value: number;
  predicted_low: number | null;
  predicted_high: number | null;
  confidence_interval_low: number | null;
  confidence_interval_high: number | null;
  due_date: string | null;
  created_at: string | null;
  related_round_id: string | null;
}

export interface ValidationPersistResult {
  predictionId: string;
  validationId: string;
  actualValue: number;
  error: number;
  withinInterval: boolean;
  direction: ValidationResult['direction'];
}

/**
 * Resolves the actual value for a prediction by averaging the same metric
 * across the player's completed rounds inside the prediction window
 * (created_at .. due_date). Returns null if no round lands in the window.
 *
 * Filters on `golf_rounds.created_at` (the round's actual submission
 * timestamp) rather than `round_date` (DATE only, truncated to midnight).
 * Using round_date silently excluded same-day rounds whenever the
 * prediction was created after 00:00 UTC of that day, because Postgres
 * coerces the date to midnight when comparing against a timestamp.
 */
async function resolveActualValue(
  supabase: AdminSupabase,
  prediction: RipePrediction,
): Promise<number | null> {
  if (!prediction.created_at || !prediction.due_date) return null;

  const start = new Date(prediction.created_at).toISOString();
  const end = new Date(prediction.due_date).toISOString();

  const { data: rounds, error } = await supabase
    .from('golf_rounds')
    .select('score_to_par, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, created_at')
    .eq('player_id', prediction.player_id)
    .eq('status', 'completed')
    .gte('created_at', start)
    .lte('created_at', end);

  if (error) {
    await logServerError(
      `resolveActualValue: rounds fetch failed: ${error.message}`,
      {
        action: 'outcomeValidator.resolveActual',
        featureArea: 'coachhelm',
        extra: { predictionId: prediction.id, playerId: prediction.player_id },
      },
      'warning',
    );
    return null;
  }

  if (!rounds || rounds.length === 0) return null;

  // Map metric name to an extractor on the round row. Names kept loose
  // (matches what the predictor writes today).
  const extract = (r: (typeof rounds)[number]): number | null => {
    switch (prediction.metric) {
      case 'scoreToPar':
      case 'score_to_par':
        return r.score_to_par ?? null;
      case 'putts':
      case 'total_putts':
        return r.total_putts ?? null;
      case 'fairwayPct':
      case 'fairway_pct':
        return (r.total_fairways ?? 0) > 0
          ? ((r.total_fairways_hit ?? 0) / (r.total_fairways ?? 1)) * 100
          : null;
      case 'girPct':
      case 'gir_pct':
        return (r.total_gir_possible ?? 0) > 0
          ? ((r.total_gir ?? 0) / (r.total_gir_possible ?? 1)) * 100
          : null;
      default:
        return null;
    }
  };

  const values = rounds.map(extract).filter((v): v is number => v !== null && Number.isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Validates a single ripe prediction against the actual outcome, persists the
 * result to `golf_prediction_validations`, and denormalizes the outcome onto
 * `golf_predictions` (validated_at, actual_value, was_accurate).
 *
 * Returns null if the actual outcome cannot be resolved yet (no rounds inside
 * the window) — caller should leave the prediction ripe for the next cron.
 */
export async function validatePredictionAgainstOutcome(
  supabase: AdminSupabase,
  prediction: RipePrediction,
): Promise<ValidationPersistResult | null> {
  const actual = await resolveActualValue(supabase, prediction);
  if (actual === null) return null;

  const low = prediction.predicted_low ?? prediction.confidence_interval_low ?? prediction.predicted_value;
  const high = prediction.predicted_high ?? prediction.confidence_interval_high ?? prediction.predicted_value;
  const base = validatePrediction(
    { value: Number(prediction.predicted_value), low: Number(low), high: Number(high) },
    actual,
  );

  const nowIso = new Date().toISOString();

  const { data: inserted, error: insertErr } = await supabase
    .from('golf_prediction_validations')
    .insert({
      prediction_id: prediction.id,
      player_id: prediction.player_id,
      predicted_value: Number(prediction.predicted_value),
      actual_value: actual,
      error: base.error,
      error_pct: base.errorPct,
      within_interval: base.withinInterval,
      direction: base.direction,
      validated_at: nowIso,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    throw new Error(
      `Failed to insert golf_prediction_validations row for prediction ${prediction.id}: ${
        insertErr?.message ?? 'no row returned'
      }`,
    );
  }

  // Denormalize onto the prediction row so cold-start callers can read the
  // outcome without a join, and so the hourly cron naturally skips this row
  // next time (`validated_at IS NULL` filter).
  const { error: updateErr } = await supabase
    .from('golf_predictions')
    .update({
      validated_at: nowIso,
      actual_value: actual,
      was_accurate: base.direction === 'accurate' || base.withinInterval,
    })
    .eq('id', prediction.id);

  if (updateErr) {
    await logServerError(
      `Failed to mark prediction ${prediction.id} validated: ${updateErr.message}`,
      {
        action: 'outcomeValidator.markValidated',
        featureArea: 'coachhelm',
        extra: { predictionId: prediction.id },
      },
      'warning',
    );
  }

  return {
    predictionId: prediction.id,
    validationId: inserted.id,
    actualValue: actual,
    error: base.error,
    withinInterval: base.withinInterval,
    direction: base.direction,
  };
}
