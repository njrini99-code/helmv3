/**
 * Performance Predictor
 *
 * Predicts player performance for upcoming rounds including:
 * - Point estimate with confidence interval
 * - Key factors driving the prediction
 * - Sensitivity analysis
 * - Tail risk (probability of blowup/great round)
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  PerformancePrediction,
  PredictionFactor,
  PredictionContext,
  ExtractedFeatures,
  MinedPattern,
} from '../types';
import { extractAllFeatures } from '../features';
import { PatternMiner } from '../mining';
import { isCountableRound } from '@/lib/golf/round-countable';
import { withCanonicalRoundTotal } from '@/lib/golf/round-total';

const WEIGHTS = {
  recentFormAdjustment: 0.6,
  trendMomentum: 0.2,
  restRustFactor: 0.1,
  pressureAdjustment: 0.05,
  formCycleAdjustment: 0.05,
};

/** Pattern adjustment is capped at this fraction of the CI half-width. */
export const PATTERN_ADJ_CI_FRACTION = 0.5;

/** Clamp the summed pattern adjustment so it can't exceed half the CI. */
export function clampPatternAdjustment(rawAdj: number, ciHalfWidth: number): number {
  if (!Number.isFinite(rawAdj) || ciHalfWidth <= 0) return 0;
  const cap = ciHalfWidth * PATTERN_ADJ_CI_FRACTION;
  return Math.max(-cap, Math.min(cap, rawAdj));
}

/** Force a point estimate to lie within its own confidence interval. */
export function bracketEstimate(estimate: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, estimate));
}

/** Predictions off data older than this many days are refused (too stale). */
export const STALENESS_DAYS = 21;
export function isStale(daysSinceMostRecent: number): boolean {
  return daysSinceMostRecent > STALENESS_DAYS;
}

/**
 * Default forecast horizon. A prediction must be due on a FUTURE day so it can
 * ever validate against a round played after it was created. When no explicit
 * future target round/event date is supplied, `due_date` is set to
 * `created_at + PREDICTION_WINDOW_DAYS`.
 *
 * Root cause of P0-02: predictions defaulted to `due_date = today`, so the
 * validation window `[created_at, due_date]` was same-day (often inverted),
 * leaving ~all predictions structurally impossible to validate.
 */
export const PREDICTION_WINDOW_DAYS = 14;

const MS_PER_DAY = 86_400_000;

/**
 * Resolve the prediction's `due_date` (a YYYY-MM-DD string) from the caller's
 * requested target date relative to creation time.
 *
 * Invariant: the returned due date is ALWAYS at least one full day after
 * `createdAt` so a subsequent round can validate it. A caller may request a
 * later target (a known future event); a same-day or past target is ignored in
 * favor of the default `PREDICTION_WINDOW_DAYS` horizon.
 */
export function resolveDueDate(
  targetDate: Date,
  createdAt: Date = new Date(),
  windowDays = PREDICTION_WINDOW_DAYS,
): string {
  const minDue = new Date(createdAt.getTime() + Math.max(1, windowDays) * MS_PER_DAY);
  // Honor an explicitly-requested future target only if it is genuinely after
  // creation; otherwise fall back to the default future horizon so the
  // prediction is validatable.
  const due =
    Number.isFinite(targetDate.getTime()) && targetDate.getTime() > createdAt.getTime()
      ? targetDate
      : minDue;
  return due.toISOString().split('T')[0] ?? '';
}

/**
 * CI multiplier for an ~80% two-sided interval. Asymptotic value 1.28 (normal);
 * small samples need widening so nominal-80% covers ~80%. t-style inflation.
 */
export function ciMultiplier(n: number): number {
  if (n < 4) return 1.28 * 1.5;
  return 1.28 * Math.sqrt(n / (n - 2));
}

/**
 * The point-and-interval core of the score forecast. Pure.
 *
 * `scores` are 18-hole-basis score_to_par values, newest first, already
 * restricted to countable rounds. The centre is the MEDIAN of the last
 * {@link FORECAST_WINDOW} rounds, not the mean: a player's rounds are
 * right-skewed (one blow-up drags a mean up for twenty rounds). Graded against
 * the next countable round (prod backtest 2026-09-28, 367 predictions), the
 * median-of-20 had MAE 3.16 / bias +0.14 against 3.15 / +0.54 for the mean and
 * 3.32 for the last-5 mean. The interval half-width is the SAMPLE standard
 * deviation times {@link ciMultiplier}; centred on the median it covered 77.9%
 * of those outcomes against a nominal 80%.
 */
export const FORECAST_WINDOW = 20;
export const FORECAST_MIN_ROUNDS = 5;

export interface ScoreForecast {
  center: number;
  low: number;
  high: number;
  sd: number;
  n: number;
}

export function forecastScoreToPar(scores: readonly number[]): ScoreForecast | null {
  const window = scores.filter((s) => Number.isFinite(s)).slice(0, FORECAST_WINDOW);
  const n = window.length;
  if (n < FORECAST_MIN_ROUNDS) return null;
  const sorted = [...window].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const center = n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const mean = window.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(window.reduce((a, s) => a + (s - mean) ** 2, 0) / (n - 1));
  const margin = sd * ciMultiplier(n);
  return { center, low: center - margin, high: center + margin, sd, n };
}

/** The naive comparator every forecast is reported against: mean of the last 5. */
export function naiveLast5(scores: readonly number[]): number | null {
  const last = scores.filter((s) => Number.isFinite(s)).slice(0, 5);
  if (last.length < FORECAST_MIN_ROUNDS) return null;
  return last.reduce((a, b) => a + b, 0) / last.length;
}

/** Nominal two-sided coverage of the stored interval. */
export const INTERVAL_NOMINAL_COVERAGE = 0.8;
/** Measured coverage must sit within this many points of nominal to show a band. */
export const INTERVAL_CALIBRATION_TOLERANCE = 0.05;
/** Graded predictions needed before the measured coverage is trusted. */
export const INTERVAL_CALIBRATION_MIN_N = 30;

/**
 * Whether the band is calibrated enough to show. The interval is only worth
 * drawing when graded outcomes land inside it about as often as it claims; an
 * unmeasured or off-nominal band is hidden (the point estimate still shows).
 */
export function isIntervalCalibrated(
  coverage: { within: number; total: number } | null,
  nominal = INTERVAL_NOMINAL_COVERAGE,
): boolean {
  if (!coverage || coverage.total < INTERVAL_CALIBRATION_MIN_N) return false;
  const rate = coverage.within / coverage.total;
  return Math.abs(rate - nominal) <= INTERVAL_CALIBRATION_TOLERANCE + 1e-9;
}

/**
 * Round-level pattern fields the predictor can evaluate for the upcoming
 * round. Every other field (lie, distance_range, ...) describes a SHOT, so it
 * can never hold "for the next round" and the pattern does not apply.
 */
const ROUND_LEVEL_PATTERN_FIELDS = new Set(['days_since_last', 'round_type']);

/**
 * Strict pattern applicability: every condition must be a round-level field
 * whose value is known for the upcoming round, and must hold. Pure.
 *
 * Root cause of the forecast's positive bias (prod, 2026-09-28): the old check
 * skipped any condition it could not evaluate, so shot-level patterns (lie /
 * distance_range, 971 active conditions) and `round_type` patterns (no event
 * type is ever passed) applied to EVERY prediction. The summed "Active
 * Patterns" term averaged +0.94 strokes where present; without it MAE fell
 * from 3.24 to 3.11 on 378 graded predictions.
 */
export function isPatternApplicableTo(
  conditions: ReadonlyArray<{ field: string; operator: string; value: unknown }>,
  known: { daysSinceLast?: number | null; roundType?: string | null },
): boolean {
  if (conditions.length === 0) return false;
  for (const c of conditions) {
    if (!ROUND_LEVEL_PATTERN_FIELDS.has(c.field)) return false;
    const actual = c.field === 'days_since_last' ? known.daysSinceLast : known.roundType;
    if (actual == null) return false;
    if (!evaluatePatternCondition(c, actual)) return false;
  }
  return true;
}

function evaluatePatternCondition(
  condition: { operator: string; value: unknown },
  actualValue: unknown,
): boolean {
  switch (condition.operator) {
    case 'eq':
      return actualValue === condition.value;
    case 'gte':
      return (actualValue as number) >= (condition.value as number);
    case 'lte':
      return (actualValue as number) <= (condition.value as number);
    case 'gt':
      return (actualValue as number) > (condition.value as number);
    case 'lt':
      return (actualValue as number) < (condition.value as number);
    default:
      // An operator we cannot evaluate is not evidence the pattern holds.
      return false;
  }
}

/**
 * A signed stroke delta for driver text (NUM-07): always carries its sign
 * ("+0.4", "−1.2", true minus), one decimal. Positive = more strokes.
 */
function signedStrokes(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return '0.0';
  return r > 0 ? `+${r.toFixed(1)}` : `\u2212${Math.abs(r).toFixed(1)}`;
}

/** Build a data-backed driver description naming the actual numbers. */
export function describeFactor(
  key: string,
  contribution: number,
  features: ExtractedFeatures,
): { name: string; explanation: string } {
  const worse = contribution > 0; // positive contribution raises score_to_par = worse
  switch (key) {
    case 'recentForm': {
      // NUM-07 / OD-02: this is not the 0–100 Form score, so it must not be
      // called "form score". Say what it does to the estimate, in strokes.
      const dir = worse ? 'below your baseline' : 'sharper than your baseline';
      return {
        name: 'Recent Form',
        explanation: `Your last 5 rounds are scoring ${dir} (${signedStrokes(contribution)} strokes on the estimate).`,
      };
    }
    case 'trendMomentum':
      return {
        name: 'Trend Momentum',
        explanation: worse
          ? 'Your scoring trend is sliding the wrong way over recent rounds.'
          : 'Your scoring trend is improving over recent rounds.',
      };
    case 'restRust': {
      const days = features.temporal.daysSinceLastRound;
      return {
        name: 'Rest / Rust',
        explanation: `It has been ${days} day${days === 1 ? '' : 's'} since your last round. ${worse ? 'A rust penalty applies.' : 'Rest is optimal.'}`,
      };
    }
    case 'pressure':
      return {
        name: 'Competitive Pressure',
        explanation: worse
          ? 'You have historically scored worse in competitive rounds than casual ones.'
          : 'You have historically held up well in competitive rounds.',
      };
    case 'formCycle':
      return {
        name: 'Form Cycle',
        explanation: `You are in a ${features.contextual.formCycle} phase of your scoring cycle.`,
      };
    case 'patterns':
      return {
        name: 'Active Patterns',
        explanation: worse
          ? 'A historical context pattern (rest/round-type) that costs you strokes applies here.'
          : 'A historical context pattern that helps your scoring applies here.',
      };
    default:
      return { name: key, explanation: `Adjusts the estimate by ${signedStrokes(contribution)} strokes.` };
  }
}

/**
 * Graded-inside-interval over graded, summed across the calibration cron's
 * buckets for this metric. Null when the read fails or nothing is graded.
 */
async function loadIntervalCoverage(
  supabase: ReturnType<typeof createAdminClient>,
  metric: string,
): Promise<{ within: number; total: number } | null> {
  try {
    const { data, error } = await supabase
      .from('golf_confidence_calibration')
      .select('predictions_count, correct_count')
      .eq('prediction_type', metric);
    if (error || !data) return null;
    let within = 0;
    let total = 0;
    for (const row of data) {
      within += row.correct_count ?? 0;
      total += row.predictions_count ?? 0;
    }
    return total > 0 ? { within, total } : null;
  } catch {
    return null;
  }
}

/** Stated confidence falls as the player's round-to-round spread widens. */
function confidenceForSpread(sd: number): number {
  if (sd > 5) return 0.6;
  if (sd > 3) return 0.7;
  return 0.8;
}

/**
 * Performance Predictor class for forecasting round scores
 */
export class PerformancePredictor {
  private playerId: string;
  private features: ExtractedFeatures | null = null;
  private patterns: MinedPattern[] = [];
  private baselineScore: number = 0;
  private naiveBaseline: number | null = null;

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  /**
   * Predicts performance for a target date
   *
   * @param targetDate - Date of the predicted round
   * @param context - Optional context (course, event type, etc.)
   */
  async predictPerformance(
    targetDate?: Date,
    context?: Partial<PredictionContext>
  ): Promise<PerformancePrediction | null> {
    const supabase = createAdminClient();
    // Creation time anchors the validation horizon. A prediction is only
    // validatable against a round played AFTER it is created, so the due date
    // must be a future day (see resolveDueDate / P0-02).
    const createdAt = new Date();

    // Load features and baseline
    this.features = await extractAllFeatures(this.playerId);
    if (!this.features) return null;

    // Baseline = last 20 COUNTABLE rounds (src/lib/golf/round-countable.ts).
    // A partial or implausible round (e.g. 37 strokes "over 18") used to sit
    // in this window and blow the interval out to a 25-stroke band. Over-fetch
    // so the filter still leaves 20, and put 9-hole rounds on an 18-hole basis.
    const { data: rawRounds } = await supabase
      .from('golf_rounds')
      .select('score_to_par, round_date, holes_played, total_score, front_nine, back_nine, total_putts')
      .eq('player_id', this.playerId)
      .eq('is_test', false)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(60);

    const rounds = (rawRounds ?? [])
      .map(withCanonicalRoundTotal)
      .filter(isCountableRound)
      .slice(0, 20)
      .map((r) => {
        const holes = r.holes_played ?? 18;
        return {
          round_date: r.round_date,
          score_to_par: r.score_to_par != null && holes > 0 ? (r.score_to_par * 18) / holes : null,
        };
      });

    if (rounds.length < 5) return null;

    // Staleness gate — refuse to predict off data older than STALENESS_DAYS
    const mostRecent = rounds[0]?.round_date;
    if (mostRecent) {
      const daysSince = Math.floor(
        (Date.now() - new Date(mostRecent).getTime()) / 86400_000,
      );
      if (isStale(daysSince)) return null;
    }

    const scores18 = rounds
      .map((r) => r.score_to_par)
      .filter((v): v is number => v != null && Number.isFinite(v));
    const forecast = forecastScoreToPar(scores18);
    if (!forecast) return null;
    this.baselineScore = forecast.center;
    this.naiveBaseline = naiveLast5(scores18);
    const { low, high } = forecast;
    const confidence = confidenceForSpread(forecast.sd);
    const ciHalfWidth = (high - low) / 2;

    // Get active patterns
    const miner = new PatternMiner(this.playerId);
    this.patterns = await miner.minePatterns();

    // Apply prediction model
    const { predictedScore, factors } = this.applyModel(context, ciHalfWidth);
    const bracketedScore = bracketEstimate(predictedScore, low, high);

    // Identify key factors
    const keyFactors = this.identifyKeyFactors(factors);

    // Calculate sensitivities
    const sensitivities = this.calculateSensitivities();

    // Build prediction
    const prediction: PerformancePrediction = {
      id: crypto.randomUUID(),
      playerId: this.playerId,
      predictionType: 'round_score',
      metric: 'score_to_par',
      predictedValue: bracketedScore,
      predictedRangeLow: low,
      predictedRangeHigh: high,
      confidence,
      calibratedConfidence: confidence, // Will be adjusted by calibrator
      keyFactors,
      sensitivities,
      context: {
        courseName: context?.courseName,
        isCompetitive: context?.isCompetitive,
        eventType: context?.eventType,
        ...context,
      },
      // Due on a FUTURE day relative to creation so the prediction can ever be
      // matched against a round played after it. resolveDueDate ignores a
      // same-day/past target in favor of the default PREDICTION_WINDOW_DAYS
      // horizon (P0-02 fix).
      dueDate: resolveDueDate(targetDate ?? createdAt, createdAt),
    };

    // Save prediction for later validation
    await this.savePrediction(prediction);

    return prediction;
  }

  /**
   * Applies the prediction model
   */
  private applyModel(
    context?: Partial<PredictionContext>,
    ciHalfWidth = 0,
  ): { predictedScore: number; factors: Map<string, number> } {
    const factors = new Map<string, number>();
    let adjustedScore = this.baselineScore;

    if (!this.features) {
      return { predictedScore: adjustedScore, factors };
    }

    // Factor 1: Recent form adjustment
    const recentFormAdj =
      this.features.temporal.recentFormScore * -3; // -3 to +3 strokes
    factors.set('recentForm', recentFormAdj * WEIGHTS.recentFormAdjustment);
    adjustedScore += recentFormAdj * WEIGHTS.recentFormAdjustment;

    // Factor 2: Trend momentum
    const trendAdj = this.features.temporal.formMomentum * -1; // Negative = improving
    factors.set('trendMomentum', trendAdj * WEIGHTS.trendMomentum);
    adjustedScore += trendAdj * WEIGHTS.trendMomentum;

    // Factor 3: Rest/rust factor
    const daysSinceRound = this.features.temporal.daysSinceLastRound;
    let restRustAdj = 0;
    if (daysSinceRound >= 7) {
      // Rust penalty
      restRustAdj = Math.min(2, (daysSinceRound - 5) * 0.3);
    } else if (daysSinceRound === 0) {
      // Back-to-back penalty
      restRustAdj = 0.5;
    } else if (daysSinceRound >= 2 && daysSinceRound <= 4) {
      // Optimal rest bonus
      restRustAdj = -0.3;
    }
    factors.set('restRust', restRustAdj * WEIGHTS.restRustFactor);
    adjustedScore += restRustAdj * WEIGHTS.restRustFactor;

    // Factor 4: Pressure adjustment
    let pressureAdj = 0;
    if (context?.isCompetitive) {
      const clutchFactor = this.features.contextual.clutchFactor;
      // If clutch factor < 1, player performs worse under pressure
      pressureAdj = (1 - clutchFactor) * 2;
    }
    factors.set('pressure', pressureAdj * WEIGHTS.pressureAdjustment);
    adjustedScore += pressureAdj * WEIGHTS.pressureAdjustment;

    // Factor 5: Form cycle adjustment
    let formCycleAdj = 0;
    switch (this.features.contextual.formCycle) {
      case 'peak':
        formCycleAdj = -0.5;
        break;
      case 'rising':
        formCycleAdj = -0.3;
        break;
      case 'declining':
        formCycleAdj = 0.5;
        break;
      case 'trough':
        formCycleAdj = 0.3;
        break;
      default:
        formCycleAdj = 0;
    }
    factors.set('formCycle', formCycleAdj * WEIGHTS.formCycleAdjustment);
    adjustedScore += formCycleAdj * WEIGHTS.formCycleAdjustment;

    // Factor 6: Active pattern impacts (clamped so it can't blow past the CI).
    let rawPatternAdj = 0;
    for (const pattern of this.patterns) {
      if (pattern.isActive && this.isPatternApplicable(pattern, context)) {
        rawPatternAdj += pattern.strokeImpact * pattern.confidence;
      }
    }
    const patternAdj = clampPatternAdjustment(rawPatternAdj, ciHalfWidth);
    factors.set('patterns', patternAdj);
    adjustedScore += patternAdj;

    return { predictedScore: adjustedScore, factors };
  }

  /**
   * Checks if a pattern is applicable to the upcoming round (strict; see
   * {@link isPatternApplicableTo}).
   */
  private isPatternApplicable(
    pattern: MinedPattern,
    context?: Partial<PredictionContext>
  ): boolean {
    return isPatternApplicableTo(pattern.conditions, {
      daysSinceLast: this.features?.temporal.daysSinceLastRound ?? null,
      roundType: context?.eventType ?? null,
    });
  }

  /**
   * Identifies key factors driving the prediction
   */
  private identifyKeyFactors(
    factors: Map<string, number>
  ): PredictionFactor[] {
    const keyFactors: PredictionFactor[] = [];

    // Sort by absolute contribution
    const sortedFactors = [...factors.entries()].sort(
      (a, b) => Math.abs(b[1]) - Math.abs(a[1])
    );

    for (const [key, contribution] of sortedFactors) {
      if (Math.abs(contribution) < 0.1) continue;

      const desc = this.features
        ? describeFactor(key, contribution, this.features)
        : { name: key, explanation: 'Contributing factor' };

      keyFactors.push({
        name: desc.name,
        value: contribution,
        contribution,
        direction: contribution < 0 ? 'positive' : 'negative',
        explanation: desc.explanation,
      });
    }

    return keyFactors;
  }

  /**
   * Calculates sensitivity analysis
   */
  private calculateSensitivities(): Record<string, number> {
    const sensitivities: Record<string, number> = {};

    // How much would the prediction change if each factor changed by 1 unit?
    sensitivities['days_rest'] = 0.3; // Each additional day off
    sensitivities['recent_form'] = 0.6; // 1 stroke change in recent avg
    sensitivities['competition'] = 0.5; // Tournament vs practice

    return sensitivities;
  }

  /**
   * Saves prediction to database
   */
  private async savePrediction(
    prediction: PerformancePrediction
  ): Promise<void> {
    const supabase = createAdminClient();
    const predictionWindowDays = Math.max(
      1,
      Math.ceil(
        (new Date(`${prediction.dueDate}T00:00:00Z`).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    );
    const trend =
      prediction.predictedValue < this.baselineScore - 0.5
        ? 'improving'
        : prediction.predictedValue > this.baselineScore + 0.5
          ? 'declining'
          : 'stable';

    // Measured coverage of the stored band over recently graded predictions
    // (the calibration cron's score_to_par buckets, 90-day lookback). The band
    // is shown only when that coverage is near nominal; see isIntervalCalibrated.
    const coverage = await loadIntervalCoverage(supabase, prediction.metric);

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = supabase.from('golf_predictions' as any) as any;

    // Upsert on the natural key (player_id, metric, due_date) so repeated
    // analyzePlayer() runs refresh the existing prediction row instead of
    // appending a duplicate. Backed by partial unique index
    // `golf_predictions_natural_key` (see migration
    // 20260428170000_predictions_unique_natural_key.sql).
    const { error } = await table.upsert(
      {
        player_id: prediction.playerId,
        metric: prediction.metric,
        predicted_value: prediction.predictedValue,
        confidence: prediction.confidence,
        confidence_interval_low: prediction.predictedRangeLow,
        confidence_interval_high: prediction.predictedRangeHigh,
        predicted_low: prediction.predictedRangeLow,
        predicted_high: prediction.predictedRangeHigh,
        prediction_window_days: predictionWindowDays,
        trend,
        key_drivers: prediction.keyFactors,
        input_features: this.features,
        model_version: 'coachhelm-v2',
        due_date: prediction.dueDate,
        prediction_context: {
          prediction_type: prediction.predictionType,
          context: prediction.context,
        },
        confidence_factors: {
          raw_confidence: prediction.confidence,
          calibrated_confidence: prediction.calibratedConfidence,
          sensitivities: prediction.sensitivities,
          // The naive comparator (mean of the last 5 countable rounds, 18-hole
          // basis). prediction-performance-writer reports MAE against it.
          naive_last5: this.naiveBaseline,
          interval_nominal: INTERVAL_NOMINAL_COVERAGE,
          interval_coverage: coverage ? coverage.within / coverage.total : null,
          interval_coverage_n: coverage?.total ?? 0,
          interval_calibrated: isIntervalCalibrated(coverage),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id,metric,due_date' }
    );

    if (error) {
      throw new Error(`Failed to save CoachHelm prediction: ${error.message}`);
    }
  }
}
