/**
 * Prediction performance writer: rolls up `golf_predictions` validation
 * outcomes into the `golf_prediction_model_performance` aggregation table.
 *
 * Schema (live, see database.types.ts):
 *   period_start (date), period_end (date), team_id, model_type,
 *   model_version, predictions_made, predictions_validated,
 *   accuracy_rate, mean_absolute_error, root_mean_square_error,
 *   systematic_bias, calibration_score,
 *   accuracy_by_confidence (jsonb), error_distribution (jsonb),
 *   overconfidence_rate, underconfidence_rate
 *
 * One row per (team_id, model_type, period_start, period_end). We use a
 * rolling 30-day window ending at the run instant, written daily. The
 * `coachhelm-validation` cron already populates validated_at/was_accurate/
 * actual_value on golf_predictions; we just snapshot the rollup.
 *
 * NOTE: there is no team_id column on golf_predictions (player-scoped),
 * so we look up team_id via golf_team_members.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logServerError } from '@/lib/server-error-logger';
import { INVALID_HORIZON_CATEGORY } from '@/lib/coachhelm/v2/learning/outcome-validator';

const ROLLING_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface PredictionRow {
  player_id: string;
  metric: string | null;
  model_version: string | null;
  predicted_value: number | null;
  predicted_low: number | null;
  predicted_high: number | null;
  actual_value: number | null;
  was_accurate: boolean | null;
  validated_at: string | null;
  created_at: string | null;
  confidence: number | null;
  error_category: string | null;
  confidence_factors: unknown;
}

/**
 * The one rule every reader of prediction outcomes uses: a prediction is
 * graded only when it has a finite actual and is not a retired
 * invalid-horizon row. `validated_at` alone is not enough — 415 legacy rows
 * carry a validated_at with no actual (all invalid_horizon), and counting them
 * as validated misses halved the reported accuracy (38% vs 77%).
 */
export function isGradedPrediction(p: {
  validated_at?: string | null;
  actual_value?: number | string | null;
  error_category?: string | null;
}): boolean {
  if (!p.validated_at) return false;
  if (p.error_category === INVALID_HORIZON_CATEGORY) return false;
  if (p.actual_value == null) return false;
  return Number.isFinite(Number(p.actual_value));
}

/** Whether the actual landed inside the stored band; null when no band was stored. */
export function landedInInterval(p: {
  actual_value?: number | string | null;
  predicted_low?: number | string | null;
  predicted_high?: number | string | null;
}): boolean | null {
  if (p.actual_value == null || p.predicted_low == null || p.predicted_high == null) return null;
  const a = Number(p.actual_value);
  const lo = Number(p.predicted_low);
  const hi = Number(p.predicted_high);
  if (![a, lo, hi].every(Number.isFinite)) return null;
  return a >= lo && a <= hi;
}

function naiveLast5Of(p: PredictionRow): number | null {
  const f = p.confidence_factors;
  if (!f || typeof f !== 'object') return null;
  const v = (f as { naive_last5?: unknown }).naive_last5;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

interface TeamMemberRow {
  player_id: string;
  team_id: string;
}

interface BucketAccum {
  predictions_made: number;
  predictions_validated: number;
  accurate_count: number;
  abs_error_sum: number;
  squared_error_sum: number;
  signed_error_sum: number;
  error_sample_count: number;
  naive_abs_error_sum: number;
  naive_sample_count: number;
  interval_within: number;
  interval_graded: number;
  overconfident: number;
  underconfident: number;
  confidence_buckets: Record<string, { count: number; accurate: number }>;
  error_distribution: Record<string, number>;
}

function emptyBucket(): BucketAccum {
  return {
    predictions_made: 0,
    predictions_validated: 0,
    accurate_count: 0,
    abs_error_sum: 0,
    squared_error_sum: 0,
    signed_error_sum: 0,
    error_sample_count: 0,
    naive_abs_error_sum: 0,
    naive_sample_count: 0,
    interval_within: 0,
    interval_graded: 0,
    overconfident: 0,
    underconfident: 0,
    confidence_buckets: {},
    error_distribution: {},
  };
}

function confidenceBucketLabel(confidence: number): string {
  const c = Math.max(0, Math.min(1, confidence));
  if (c < 0.2) return '0-20%';
  if (c < 0.4) return '20-40%';
  if (c < 0.6) return '40-60%';
  if (c < 0.8) return '60-80%';
  return '80-100%';
}

function expectedAccuracyForBucket(label: string): number {
  const map: Record<string, number> = {
    '0-20%': 0.1,
    '20-40%': 0.3,
    '40-60%': 0.5,
    '60-80%': 0.7,
    '80-100%': 0.9,
  };
  return map[label] ?? 0.5;
}

/**
 * Compute and write a 30-day rolling-window performance snapshot per team
 * and model_type. Idempotent on (team_id, model_type, period_start, period_end).
 *
 * Returns counts for cron observability. Errors are logged, not thrown.
 */
export async function rollupPredictionPerformanceRolling30d(
  supabase: SupabaseClient,
  nowMs: number = Date.now(),
): Promise<{ written: number; failed: number }> {
  const windowEnd = new Date(nowMs);
  windowEnd.setUTCHours(0, 0, 0, 0);
  const windowStart = new Date(windowEnd.getTime() - ROLLING_WINDOW_DAYS * MS_PER_DAY);
  const startIso = windowStart.toISOString();
  const endIso = windowEnd.toISOString();

  const { data: predData, error: predErr } = await supabase
    .from('golf_predictions')
    .select(
      'player_id, metric, model_version, predicted_value, predicted_low, predicted_high, actual_value, was_accurate, validated_at, created_at, confidence, error_category, confidence_factors',
    )
    .gte('created_at', startIso)
    .lt('created_at', endIso);

  if (predErr) {
    await logServerError(
      `analytics.prediction_perf.fetch_predictions failed: ${predErr.message}`,
      {
        action: 'analytics.prediction_perf.fetch_predictions',
        featureArea: 'coachhelm_analytics',
        extra: { code: predErr.code },
      },
      'error',
    );
    return { written: 0, failed: 1 };
  }

  const predictions = (predData ?? []) as unknown as PredictionRow[];
  if (predictions.length === 0) {
    return { written: 0, failed: 0 };
  }

  const playerIds = Array.from(new Set(predictions.map((p) => p.player_id).filter((id): id is string => !!id)));
  if (playerIds.length === 0) {
    return { written: 0, failed: 0 };
  }

  // Map player_id -> team_id (a player can be on multiple teams; we attribute
  // their predictions to ALL their active teams).
  const { data: memberData, error: memberErr } = await supabase
    .from('golf_team_members')
    .select('player_id, team_id')
    .in('player_id', playerIds)
    .eq('status', 'active');

  if (memberErr) {
    await logServerError(
      `analytics.prediction_perf.fetch_members failed: ${memberErr.message}`,
      {
        action: 'analytics.prediction_perf.fetch_members',
        featureArea: 'coachhelm_analytics',
        extra: { code: memberErr.code },
      },
      'error',
    );
    return { written: 0, failed: 1 };
  }

  const members = (memberData ?? []) as unknown as TeamMemberRow[];
  const playerToTeams = new Map<string, string[]>();
  for (const m of members) {
    if (!m.player_id || !m.team_id) continue;
    const list = playerToTeams.get(m.player_id) ?? [];
    list.push(m.team_id);
    playerToTeams.set(m.player_id, list);
  }

  // Aggregate by (team_id, model_type). model_type is the prediction `metric`
  // (one row per metric, e.g. "scoring_average", "putts_per_round"). This
  // mirrors how readers slice the data.
  type Key = string; // `${team}::${metric}`
  const buckets = new Map<Key, { team_id: string; model_type: string; model_version: string | null; b: BucketAccum }>();

  for (const p of predictions) {
    if (!p.player_id || !p.metric) continue;
    // Retired same-day/invalid-horizon predictions can never validate honestly
    // (P0-02) — exclude them from rollups entirely so they don't depress the
    // validated count or accuracy rate.
    if (p.error_category === INVALID_HORIZON_CATEGORY) continue;
    const teams = playerToTeams.get(p.player_id) ?? [];
    if (teams.length === 0) continue;

    for (const team_id of teams) {
      const key: Key = `${team_id}::${p.metric}`;
      let entry = buckets.get(key);
      if (!entry) {
        entry = {
          team_id,
          model_type: p.metric,
          model_version: p.model_version ?? null,
          b: emptyBucket(),
        };
        buckets.set(key, entry);
      }
      const b = entry.b;

      b.predictions_made++;

      if (isGradedPrediction(p)) {
        b.predictions_validated++;
        const actual = Number(p.actual_value);
        // Accuracy = the actual landed inside the stored band. Falls back to
        // was_accurate only for a row that stored no band.
        const inBand = landedInInterval(p);
        const accurate = inBand ?? p.was_accurate === true;
        if (accurate) b.accurate_count++;
        if (inBand !== null) {
          b.interval_graded++;
          if (inBand) b.interval_within++;
        }

        // MAE / RMSE / signed bias
        if (typeof p.predicted_value === 'number') {
          const err = p.predicted_value - actual;
          b.abs_error_sum += Math.abs(err);
          b.squared_error_sum += err * err;
          b.signed_error_sum += err;
          b.error_sample_count++;
        }

        // The naive comparator: mean of the last 5 rounds at prediction time.
        const naive = naiveLast5Of(p);
        if (naive !== null) {
          b.naive_abs_error_sum += Math.abs(naive - actual);
          b.naive_sample_count++;
        }

        // Confidence calibration buckets
        if (typeof p.confidence === 'number') {
          const label = confidenceBucketLabel(p.confidence);
          const cb = b.confidence_buckets[label] ?? { count: 0, accurate: 0 };
          cb.count++;
          if (accurate) cb.accurate++;
          b.confidence_buckets[label] = cb;
        }

        // Error category distribution
        if (p.error_category) {
          b.error_distribution[p.error_category] =
            (b.error_distribution[p.error_category] ?? 0) + 1;
          if (p.error_category === 'overconfident') b.overconfident++;
          if (p.error_category === 'underconfident') b.underconfident++;
        }
      }
    }
  }

  if (buckets.size === 0) {
    return { written: 0, failed: 0 };
  }

  const periodStart = startIso.split('T')[0];
  const periodEnd = endIso.split('T')[0];

  const inserts = Array.from(buckets.values()).map(({ team_id, model_type, model_version, b }) => {
    const validated = b.predictions_validated || 0;
    const accuracy_rate = validated > 0 ? b.accurate_count / validated : 0;
    const mean_absolute_error = b.error_sample_count > 0 ? b.abs_error_sum / b.error_sample_count : 0;
    const root_mean_square_error =
      b.error_sample_count > 0 ? Math.sqrt(b.squared_error_sum / b.error_sample_count) : 0;
    const systematic_bias = b.error_sample_count > 0 ? b.signed_error_sum / b.error_sample_count : 0;
    const overconfidence_rate = validated > 0 ? b.overconfident / validated : 0;
    const underconfidence_rate = validated > 0 ? b.underconfident / validated : 0;

    // Calibration score = 1 - mean(|actual - expected|) across populated buckets.
    const calibPairs = Object.entries(b.confidence_buckets);
    let calibration_score = 0;
    if (calibPairs.length > 0) {
      let sumErr = 0;
      for (const [label, c] of calibPairs) {
        if (c.count === 0) continue;
        const actual = c.accurate / c.count;
        const expected = expectedAccuracyForBucket(label);
        sumErr += Math.abs(actual - expected);
      }
      calibration_score = Math.max(0, 1 - sumErr / calibPairs.length);
    }

    // Serialize confidence buckets as { label: actual_accuracy } for readers
    // that already aggregate this shape (coachhelm-analytics.ts does this).
    const accuracy_by_confidence: Record<string, number> = {};
    for (const [label, c] of Object.entries(b.confidence_buckets)) {
      accuracy_by_confidence[label] = c.count > 0 ? c.accurate / c.count : 0;
    }

    return {
      team_id,
      model_type,
      model_version: model_version ?? null,
      period_start: periodStart,
      period_end: periodEnd,
      predictions_made: b.predictions_made,
      predictions_validated: validated,
      accuracy_rate,
      mean_absolute_error,
      root_mean_square_error,
      systematic_bias,
      calibration_score,
      accuracy_by_confidence,
      error_distribution: b.error_distribution,
      overconfidence_rate,
      underconfidence_rate,
      updated_at: new Date().toISOString(),
      // Extended columns (additive migration; the upsert below falls back
      // without them until it is applied). MAE means little without
      // the naive comparator beside it, and coverage is what the band claims.
      naive_mean_absolute_error:
        b.naive_sample_count > 0 ? b.naive_abs_error_sum / b.naive_sample_count : null,
      naive_sample_count: b.naive_sample_count,
      interval_coverage: b.interval_graded > 0 ? b.interval_within / b.interval_graded : null,
    };
  });

  // Idempotent rewrite via upsert against the natural-key unique index
  // `golf_prediction_model_performance_natural_key` on
  // (team_id, model_type, period_start, period_end). Replaces the prior
  // delete-then-insert, which was racy and a wasted round-trip.
  let { error: upsertErr } = await upsertSnapshots(supabase, inserts);
  // Code can ship before the additive migration: retry without the extended
  // columns when PostgREST says one of them does not exist.
  if (upsertErr && isMissingColumnError(upsertErr)) {
    const base = inserts.map(
      ({ naive_mean_absolute_error: _n, naive_sample_count: _c, interval_coverage: _i, ...rest }) => rest,
    );
    ({ error: upsertErr } = await upsertSnapshots(supabase, base));
  }

  if (upsertErr) {
    await logServerError(
      `analytics.prediction_perf.upsert failed: ${upsertErr.message}`,
      {
        action: 'analytics.prediction_perf.upsert',
        featureArea: 'coachhelm_analytics',
        extra: { code: upsertErr.code, count: inserts.length },
      },
      'error',
    );
    return { written: 0, failed: 1 };
  }

  return { written: inserts.length, failed: 0 };
}

const EXTENDED_COLUMNS = ['naive_mean_absolute_error', 'naive_sample_count', 'interval_coverage'];

function isMissingColumnError(err: { code?: string; message?: string }): boolean {
  if (err.code === 'PGRST204' || err.code === '42703') return true;
  return EXTENDED_COLUMNS.some((c) => (err.message ?? '').includes(c));
}

function upsertSnapshots(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): PromiseLike<{ error: { code?: string; message: string } | null }> {
  // Idempotent rewrite via upsert against the natural-key unique index
  // `golf_prediction_model_performance_natural_key` on
  // (team_id, model_type, period_start, period_end).
  return supabase
    .from('golf_prediction_model_performance')
    .upsert(rows as unknown as Record<string, never>[], {
      onConflict: 'team_id,model_type,period_start,period_end',
    });
}
