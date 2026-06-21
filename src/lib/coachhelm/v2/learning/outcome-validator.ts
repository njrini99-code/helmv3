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

/** Minimal shape of a completed round row used to resolve an actual outcome. */
export interface RoundOutcomeRow {
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  created_at: string | null;
}

/**
 * Extract the value for a prediction's metric from a single completed round.
 * Pure + exported so the matching logic is unit-testable. Returns null when the
 * round lacks the inputs needed for that metric.
 */
export function extractMetricValue(
  metric: string,
  r: RoundOutcomeRow,
): number | null {
  switch (metric) {
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
}

/**
 * A prediction can only validate against a round PLAYED AFTER it was created.
 * Returns true when the prediction's horizon is valid (its due date is on a
 * strictly later day than its creation day).
 *
 * Root cause of P0-02: legacy predictions were created with `due_date = today`,
 * so the validation window `[created_at, due_date]` was same-day (and often
 * inverted once due_date is coerced to midnight). Such rows can never be
 * validated honestly and must be excluded from rollups, not matched against a
 * pre-prediction round.
 */
export function hasValidHorizon(
  createdAt: string | null,
  dueDate: string | null,
): boolean {
  if (!createdAt || !dueDate) return false;
  const created = new Date(createdAt);
  const due = endOfDueDate(dueDate);
  if (!Number.isFinite(created.getTime()) || due === null) return false;
  // Due day must be strictly after the creation day.
  const createdDay = createdAt.slice(0, 10);
  return dueDate.slice(0, 10) > createdDay && due.getTime() > created.getTime();
}

/**
 * End-of-day (23:59:59.999 UTC) for a YYYY-MM-DD due date. The due date is a
 * DATE, so "due by D" means any round through the END of day D, not midnight at
 * its start. Using the start-of-day (the old `new Date(due).toISOString()`)
 * silently excluded same-day rounds.
 */
export function endOfDueDate(dueDate: string): Date | null {
  const day = dueDate.slice(0, 10);
  const d = new Date(`${day}T23:59:59.999Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Pick the FIRST completed round strictly after `createdAt` and no later than
 * the end of `dueDate`. This is the outcome a prediction should be graded
 * against — not an average over a window that can include rounds played before
 * the prediction existed.
 */
export function selectValidationRound<T extends RoundOutcomeRow>(
  rounds: T[],
  createdAt: string,
  dueDate: string,
): T | null {
  const createdMs = new Date(createdAt).getTime();
  const end = endOfDueDate(dueDate);
  if (!Number.isFinite(createdMs) || end === null) return null;
  const endMs = end.getTime();

  const eligible = rounds
    .filter((r) => {
      if (!r.created_at) return false;
      const ms = new Date(r.created_at).getTime();
      return Number.isFinite(ms) && ms > createdMs && ms <= endMs;
    })
    .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

  return eligible[0] ?? null;
}

/**
 * Sentinel returned by `resolveActualValue` to distinguish "outcome not yet
 * resolvable" from "this prediction can never validate".
 *
 * - `{ kind: 'pending' }`     — horizon valid, no eligible round yet; leave ripe.
 * - `{ kind: 'invalid' }`     — same-day/inverted horizon; retire, do not grade.
 * - `{ kind: 'resolved', .. }`— graded against the first eligible round.
 */
export type ActualOutcome =
  | { kind: 'pending' }
  | { kind: 'invalid' }
  | { kind: 'resolved'; value: number; roundId: string | null; roundCreatedAt: string | null };

/**
 * Resolves the actual value for a prediction by grading it against the FIRST
 * completed round played strictly after `created_at` and no later than the end
 * of `due_date`. Returns:
 *
 * - `invalid`  when the prediction has a same-day/inverted horizon (legacy rows
 *   that can never validate honestly — see P0-02). These are retired, not
 *   matched against a pre-prediction round.
 * - `pending`  when the horizon is valid but no eligible round exists yet.
 * - `resolved` with the metric value from the first eligible round.
 *
 * Filters on `golf_rounds.created_at` (the round's actual submission timestamp)
 * rather than `round_date` (DATE only, truncated to midnight). The window upper
 * bound is the END of the due date, so a round submitted at any time on the due
 * day still counts.
 */
async function resolveActualValue(
  supabase: AdminSupabase,
  prediction: RipePrediction,
): Promise<ActualOutcome> {
  if (!prediction.created_at || !prediction.due_date) return { kind: 'invalid' };

  // A prediction can only be graded against a round played AFTER it was made.
  // Same-day/inverted horizons can never validate honestly — retire them.
  if (!hasValidHorizon(prediction.created_at, prediction.due_date)) {
    return { kind: 'invalid' };
  }

  const start = new Date(prediction.created_at).toISOString();
  const end = endOfDueDate(prediction.due_date);
  if (end === null) return { kind: 'invalid' };

  const { data: rounds, error } = await supabase
    .from('golf_rounds')
    .select('id, score_to_par, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, created_at')
    .eq('player_id', prediction.player_id)
    .eq('status', 'completed')
    .gt('created_at', start)
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: true });

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
    return { kind: 'pending' };
  }

  if (!rounds || rounds.length === 0) return { kind: 'pending' };

  // Grade against the FIRST completed round after the prediction was created.
  const round = selectValidationRound(
    rounds as Array<RoundOutcomeRow & { id: string }>,
    prediction.created_at,
    prediction.due_date,
  );
  if (!round) return { kind: 'pending' };

  const value = extractMetricValue(prediction.metric, round);
  if (value === null || !Number.isFinite(value)) return { kind: 'pending' };

  return {
    kind: 'resolved',
    value,
    roundId: round.id ?? null,
    roundCreatedAt: round.created_at,
  };
}

/**
 * Validates a single ripe prediction against the actual outcome, persists the
 * result to `golf_prediction_validations`, and denormalizes the outcome onto
 * `golf_predictions` (validated_at, actual_value, was_accurate).
 *
 * The outcome is the FIRST completed round played strictly after `created_at`
 * (P0-02), not an average over a window that could include pre-prediction
 * rounds.
 *
 * Returns null when the actual outcome cannot be resolved yet (no eligible round
 * yet — leave ripe) OR when the prediction is retired for an invalid horizon.
 */
export async function validatePredictionAgainstOutcome(
  supabase: AdminSupabase,
  prediction: RipePrediction,
): Promise<ValidationPersistResult | null> {
  const outcome = await resolveActualValue(supabase, prediction);

  // Same-day / inverted horizon: this prediction can never validate honestly.
  // Retire it so it is excluded from accuracy rollups and stops being re-fetched
  // by the cron (validated_at IS NULL filter), without recording a bogus result.
  if (outcome.kind === 'invalid') {
    await retireInvalidHorizon(supabase, prediction);
    return null;
  }

  // Horizon valid but no eligible round yet — leave ripe for the next cron.
  if (outcome.kind === 'pending') return null;

  const actual = outcome.value;

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
      // Trace which round graded this prediction (first round after created_at).
      related_round_id: outcome.roundId ?? prediction.related_round_id,
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

/** Sentinel category stamped on retired same-day/invalid-horizon predictions. */
export const INVALID_HORIZON_CATEGORY = 'invalid_horizon';

/**
 * Retire a prediction that can never validate honestly (same-day/inverted
 * horizon). Stamps `validated_at` so the hourly cron stops re-fetching it, marks
 * `was_accurate = null` and `error_category = 'invalid_horizon'` so accuracy
 * rollups can exclude it. No validation row is written and no bogus outcome is
 * recorded.
 */
async function retireInvalidHorizon(
  supabase: AdminSupabase,
  prediction: RipePrediction,
): Promise<void> {
  const { error } = await supabase
    .from('golf_predictions')
    .update({
      validated_at: new Date().toISOString(),
      actual_value: null,
      was_accurate: null,
      error_category: INVALID_HORIZON_CATEGORY,
    })
    .eq('id', prediction.id);

  if (error) {
    await logServerError(
      `Failed to retire invalid-horizon prediction ${prediction.id}: ${error.message}`,
      {
        action: 'outcomeValidator.retireInvalidHorizon',
        featureArea: 'coachhelm',
        extra: { predictionId: prediction.id },
      },
      'warning',
    );
  }
}
