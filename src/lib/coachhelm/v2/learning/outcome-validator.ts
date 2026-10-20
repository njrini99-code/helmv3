/**
 * Outcome Validator — Backward-compatible class wrapper.
 *
 * Self-contained implementation that matches the functional feedback module
 * but avoids circular dependency issues with the barrel export.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { logServerError } from '@/lib/server-error-logger';
import { isCountableRound } from '@/lib/golf/round-countable';

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
 * Why a ripe prediction did NOT produce a validation.
 *
 * These were all collapsed into a bare `null`, so `coachhelm-validation` could
 * only report one undifferentiated `skipped` count — and did, 66 of 66, for 72
 * consecutive runs, while 5 of those were resolvable and 64 had a window that
 * had closed empty. One number that is compatible with both a healthy backlog
 * and a permanently stuck queue is not an observable.
 */
export type ValidationSkipReason =
  /** Same-day or inverted horizon. `retireInvalidHorizon` has marked it; terminal. */
  | 'retired_invalid_horizon'
  /** Due date has passed and no completed round was PLAYED inside the window.
   *  Only a back-dated entry can still fill it — and this product back-dates
   *  often (80% of rounds are entered on a different day than played, averaging
   *  33.6 days later), so this is "stuck", not strictly "impossible". */
  | 'no_round_in_closed_window'
  /** Closed window, still empty NO_OUTCOME_GRACE_DAYS after the due date:
   *  retired as `no_outcome_in_window` (audit row 57) so the queue drains. */
  | 'retired_no_outcome'
  /** Due date is still ahead; a qualifying round may yet be played. */
  | 'awaiting_round';

export interface ValidationSkip {
  skipped: ValidationSkipReason;
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
  /**
   * The day the round was PLAYED (`golf_rounds.round_date`, a DATE, NOT NULL in
   * schema). This is what eligibility is measured on — `created_at` is when the
   * row was typed in, and in production those differ for 80% of rounds by an
   * average of 33.6 days (max 89). Optional here only so older callers that
   * have not added it to their select keep working via the fallback below.
   */
  round_date?: string | null;
  /**
   * Countable-round inputs (see `@/lib/golf/round-countable`) and the OD-03
   * QA flag. `gradeableRounds` drops a round that is `is_test` or not
   * countable, so a QA card or a half-entered one can never grade a prediction.
   */
  holes_played?: number | null;
  total_score?: number | null;
  front_nine?: number | null;
  back_nine?: number | null;
  is_test?: boolean | null;
}

/**
 * The rounds a prediction may be graded against: not flagged `is_test`, and
 * countable (full length, fully recorded, plausible score).
 *
 * Why (2026-09-28 audit): for one demo player, seven predictions (due
 * 2026-09-18..25) were graded against round 91301a75 (is_test, 37 strokes over
 * 18, −35) and four (due 2026-08-31..09-03) against QA Test Course rounds. The
 * query also filters `is_test = false`; this re-applies both rules to
 * prefetched rows and to any caller-supplied candidates.
 */
export function gradeableRounds<T extends RoundOutcomeRow>(rounds: readonly T[]): T[] {
  return rounds.filter(
    (r) =>
      r.is_test !== true &&
      isCountableRound({
        holes_played: r.holes_played ?? null,
        total_score: r.total_score ?? null,
        front_nine: r.front_nine ?? null,
        back_nine: r.back_nine ?? null,
        total_putts: r.total_putts,
      }),
  );
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
    case 'score_to_par': {
      // Forecasts are made on an 18-hole basis (performance-predictor.ts puts
      // 9-hole history on it), so a 9-hole outcome is graded on it too. Raw, a
      // +2 nine graded against a +5 forecast read as a 3-stroke miss.
      if (r.score_to_par == null) return null;
      const holes = r.holes_played ?? 18;
      return holes > 0 && holes !== 18 ? (r.score_to_par * 18) / holes : r.score_to_par;
    }
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
/**
 * The calendar day a round was played, as `YYYY-MM-DD`.
 *
 * `round_date` is the truth. `created_at` is only a fallback for rows (or
 * callers) that did not supply one — it is the INSERT timestamp, and grading on
 * it is the bug this function exists to not have: a coach entering last month's
 * card today produces a row whose `created_at` is today and whose `round_date`
 * is last month.
 */
function playDay(r: RoundOutcomeRow): string | null {
  if (r.round_date) return r.round_date.slice(0, 10);
  if (r.created_at) {
    const ms = new Date(r.created_at).getTime();
    if (Number.isFinite(ms)) return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

/**
 * The first round PLAYED strictly after the prediction was made and no later
 * than its due date.
 *
 * Compared as calendar days, not instants: `round_date` is a DATE with no time
 * or zone, and a prediction's `created_at` is a timestamp. Slicing both to a
 * UTC `YYYY-MM-DD` makes the comparison deterministic and zone-independent —
 * the same doctrine this codebase applies to every other date-only column.
 *
 * "Strictly after" is deliberate and matches `hasValidHorizon` already retiring
 * same-day horizons: a round played the same day a prediction was made cannot
 * test it.
 */
export function selectValidationRound<T extends RoundOutcomeRow>(
  rounds: T[],
  createdAt: string,
  dueDate: string,
): T | null {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return null;
  const createdDay = new Date(createdMs).toISOString().slice(0, 10);
  const dueDay = dueDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDay)) return null;

  const eligible = rounds
    .map((r) => ({ r, day: playDay(r) }))
    .filter((x): x is { r: T; day: string } => x.day !== null && x.day > createdDay && x.day <= dueDay)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  return eligible[0]?.r ?? null;
}

/** Columns `resolveActualValue` grades on. `player_id` lets a batch read be split per player. */
const ROUND_OUTCOME_COLUMNS =
  'id, player_id, score_to_par, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, created_at, round_date, holes_played, total_score, front_nine, back_nine, is_test';

/** Players per `golf_rounds` read, so the `in.(...)` filter stays a sane URL length. */
export const PREFETCH_PLAYER_CHUNK = 100;
/**
 * Row cap per chunk read. PostgREST truncates at its max-rows setting without
 * saying so, and a truncated read would make a gradeable prediction look
 * ungradeable. A chunk that reaches the cap is therefore discarded and its
 * players fall back to the per-prediction read, which is always correct.
 */
export const PREFETCH_ROW_CAP = 1000;

/** Completed rounds per player_id, window-filtered later by selectValidationRound. */
export type PrefetchedRounds = Map<string, Array<RoundOutcomeRow & { id: string }>>;

/**
 * One `golf_rounds` read for a whole batch of ripe predictions, instead of one
 * per prediction.
 *
 * The hourly `coachhelm-validation` cron re-checks every prediction whose
 * window closed empty (a back-dated round can still fill it), which was 115
 * predictions and 115 identical-shape reads every hour — Sentry's N+1 Query
 * JAVASCRIPT-NEXTJS-SV on `GET /api/cron/coachhelm-validation`.
 *
 * Reads the union window (earliest creation day, latest due day) across the
 * batch; `selectValidationRound` re-applies each prediction's own window, so
 * grading is unchanged. A player is present in the returned map only when
 * their chunk read succeeded untruncated — including with zero rows, which is
 * a real "no rounds" answer. Absent players fall back to the per-prediction
 * read. Never throws.
 */
export async function prefetchCandidateRounds(
  supabase: AdminSupabase,
  predictions: RipePrediction[],
): Promise<PrefetchedRounds> {
  const out: PrefetchedRounds = new Map();
  const players = new Set<string>();
  let minDay: string | null = null;
  let maxDay: string | null = null;

  for (const p of predictions) {
    if (!p.created_at || !p.due_date || !p.player_id) continue;
    if (!hasValidHorizon(p.created_at, p.due_date)) continue;
    const createdMs = new Date(p.created_at).getTime();
    if (!Number.isFinite(createdMs)) continue;
    const createdDay = new Date(createdMs).toISOString().slice(0, 10);
    const dueDay = p.due_date.slice(0, 10);
    players.add(p.player_id);
    if (minDay === null || createdDay < minDay) minDay = createdDay;
    if (maxDay === null || dueDay > maxDay) maxDay = dueDay;
  }
  if (players.size === 0 || minDay === null || maxDay === null) return out;

  const ids = [...players];
  for (let i = 0; i < ids.length; i += PREFETCH_PLAYER_CHUNK) {
    const chunk = ids.slice(i, i + PREFETCH_PLAYER_CHUNK);
    try {
      const { data, error } = await supabase
        .from('golf_rounds')
        .select(ROUND_OUTCOME_COLUMNS)
        .in('player_id', chunk)
        .eq('status', 'completed')
        .eq('is_test', false)
        .gt('round_date', minDay)
        .lte('round_date', maxDay)
        .order('round_date', { ascending: true })
        .limit(PREFETCH_ROW_CAP);
      if (error || !data || data.length >= PREFETCH_ROW_CAP) continue;
      for (const id of chunk) out.set(id, []);
      for (const row of data as Array<RoundOutcomeRow & { id: string; player_id: string }>) {
        out.get(row.player_id)?.push(row);
      }
    } catch {
      // Fall back to per-prediction reads for this chunk.
    }
  }
  return out;
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
  candidates?: Array<RoundOutcomeRow & { id: string }>,
): Promise<ActualOutcome> {
  if (!prediction.created_at || !prediction.due_date) return { kind: 'invalid' };

  // A prediction can only be graded against a round played AFTER it was made.
  // Same-day/inverted horizons can never validate honestly — retire them.
  if (!hasValidHorizon(prediction.created_at, prediction.due_date)) {
    return { kind: 'invalid' };
  }

  const end = endOfDueDate(prediction.due_date);
  if (end === null) return { kind: 'invalid' };

  // Filter on the day the round was PLAYED, not the day the row was inserted.
  // Measured 2026-08-18: 260 of 326 completed rounds (80%) were entered on a
  // different day than they were played, averaging 33.6 days apart and reaching
  // 89 — so the old `created_at` window both missed real outcomes and admitted
  // rounds played before the prediction existed.
  const createdDay = new Date(prediction.created_at).toISOString().slice(0, 10);
  const dueDay = prediction.due_date.slice(0, 10);

  // Prefetched by the caller (one read for the whole batch — see
  // prefetchCandidateRounds). The window is re-applied below by
  // selectValidationRound, so a superset is fine; an absent entry means this
  // player was not prefetched and we read their rounds ourselves.
  let rounds: Array<RoundOutcomeRow & { id: string }> | null = candidates ?? null;

  if (!candidates) {
    const { data, error } = await supabase
      .from('golf_rounds')
      .select(ROUND_OUTCOME_COLUMNS)
      .eq('player_id', prediction.player_id)
      .eq('status', 'completed')
      .eq('is_test', false)
      .gt('round_date', createdDay)
      .lte('round_date', dueDay)
      .order('round_date', { ascending: true });

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
    rounds = (data ?? []) as Array<RoundOutcomeRow & { id: string }>;
  }

  if (!rounds || rounds.length === 0) return { kind: 'pending' };

  // Grade against the FIRST gradeable round after the prediction was created.
  const round = selectValidationRound(
    gradeableRounds(rounds),
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
  prefetched?: PrefetchedRounds,
): Promise<ValidationPersistResult | ValidationSkip> {
  const outcome = await resolveActualValue(
    supabase,
    prediction,
    prefetched?.get(prediction.player_id),
  );

  // Same-day / inverted horizon: this prediction can never validate honestly.
  // Retire it so it is excluded from accuracy rollups and stops being re-fetched
  // by the cron (validated_at IS NULL filter), without recording a bogus result.
  if (outcome.kind === 'invalid') {
    await retireInvalidHorizon(supabase, prediction);
    return { skipped: 'retired_invalid_horizon' };
  }

  // No eligible round. Whether that is temporary or terminal depends entirely
  // on the due date, and the caller needs to be able to tell them apart — a
  // queue of the second kind never drains and used to look identical to the
  // first in the cron's output.
  if (outcome.kind === 'pending') {
    // `due_date` is non-null by the time we get here (resolveActualValue
    // returns `invalid` without one), but the type does not say so.
    const dueDay = prediction.due_date?.slice(0, 10) ?? '';
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (dueDay !== '' && isPastNoOutcomeGrace(dueDay, todayUtc)) {
      await retireNoOutcome(supabase, prediction);
      return { skipped: 'retired_no_outcome' };
    }
    return {
      skipped: dueDay !== '' && dueDay < todayUtc ? 'no_round_in_closed_window' : 'awaiting_round',
    };
  }

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
 * Sentinel for a prediction whose window closed with no round played in it
 * (audit row 57: 109 such rows sat unvalidated, the oldest 84 days past due).
 * Rounds are often entered weeks after they are played (mean 33.6 days), so
 * the retirement waits NO_OUTCOME_GRACE_DAYS past the due date.
 */
export const NO_OUTCOME_CATEGORY = 'no_outcome_in_window';
export const NO_OUTCOME_GRACE_DAYS = 60;

/** Categories that mark a retired, never-graded prediction. */
export const RETIRED_PREDICTION_CATEGORIES: ReadonlySet<string> = new Set([
  INVALID_HORIZON_CATEGORY,
  NO_OUTCOME_CATEGORY,
]);

/** True once `todayUtc` is more than the grace period past `dueDay` (YYYY-MM-DD). */
export function isPastNoOutcomeGrace(dueDay: string, todayUtc: string): boolean {
  const due = Date.parse(`${dueDay}T00:00:00Z`);
  const today = Date.parse(`${todayUtc}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(today)) return false;
  return today - due > NO_OUTCOME_GRACE_DAYS * 86_400_000;
}

async function retireNoOutcome(supabase: AdminSupabase, prediction: RipePrediction): Promise<void> {
  const { error } = await supabase
    .from('golf_predictions')
    .update({
      validated_at: new Date().toISOString(),
      actual_value: null,
      was_accurate: null,
      error_category: NO_OUTCOME_CATEGORY,
    })
    .eq('id', prediction.id);
  if (error) {
    await logServerError(
      `Failed to retire no-outcome prediction ${prediction.id}: ${error.message}`,
      {
        action: 'outcomeValidator.retireNoOutcome',
        featureArea: 'coachhelm',
        extra: { predictionId: prediction.id },
      },
      'warning',
    );
  }
}

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
