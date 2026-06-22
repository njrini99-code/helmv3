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

/** Build a data-backed driver description naming the actual numbers. */
export function describeFactor(
  key: string,
  contribution: number,
  features: ExtractedFeatures,
): { name: string; explanation: string } {
  const worse = contribution > 0; // positive contribution raises score_to_par = worse
  switch (key) {
    case 'recentForm': {
      const fs = features.temporal.recentFormScore;
      const dir = worse ? 'below your baseline' : 'sharper than your baseline';
      return {
        name: 'Recent Form',
        explanation: `Your last 5 rounds are scoring ${dir} (form score ${fs.toFixed(2)}).`,
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
        explanation: `It has been ${days} day${days === 1 ? '' : 's'} since your last round — ${worse ? 'a rust penalty applies' : 'optimal rest'}.`,
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
      return { name: key, explanation: `Adjusts the estimate by ${contribution.toFixed(2)} strokes.` };
  }
}

/**
 * Performance Predictor class for forecasting round scores
 */
export class PerformancePredictor {
  private playerId: string;
  private features: ExtractedFeatures | null = null;
  private patterns: MinedPattern[] = [];
  private baselineScore: number = 0;

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

    // Get baseline score (average over last 20 rounds)
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('score_to_par, round_date')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(20);

    if (!rounds || rounds.length < 5) return null;

    // Staleness gate — refuse to predict off data older than STALENESS_DAYS
    const mostRecent = rounds[0]?.round_date;
    if (mostRecent) {
      const daysSince = Math.floor(
        (Date.now() - new Date(mostRecent).getTime()) / 86400_000,
      );
      if (isStale(daysSince)) return null;
    }

    this.baselineScore =
      rounds.reduce((a, r) => a + (r.score_to_par ?? 0), 0) / rounds.length;

    // Compute the CI FIRST so the model can clamp the pattern term to it and
    // the final estimate can be bracketed inside it.
    const roundsForInterval = rounds.map(r => ({ score_to_par: r.score_to_par ?? 0 }));
    const { low, high, confidence } = this.calculateConfidenceInterval(roundsForInterval);
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
   * Checks if a pattern is applicable to current context
   */
  private isPatternApplicable(
    pattern: MinedPattern,
    context?: Partial<PredictionContext>
  ): boolean {
    // Check each condition
    for (const condition of pattern.conditions) {
      if (condition.field === 'days_since_last' && this.features) {
        const value = this.features.temporal.daysSinceLastRound;
        if (!this.evaluateCondition(condition, value)) {
          return false;
        }
      }
      if (condition.field === 'round_type' && context?.eventType) {
        const value = context.eventType;
        if (!this.evaluateCondition(condition, value)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Evaluates a condition
   */
  private evaluateCondition(
    condition: { operator: string; value: unknown },
    actualValue: unknown
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
        return true;
    }
  }

  /**
   * Calculates confidence interval
   */
  private calculateConfidenceInterval(
    rounds: Array<{ score_to_par: number }>
  ): { low: number; high: number; confidence: number } {
    const scores = rounds.map((r) => r.score_to_par);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Calculate standard deviation
    const squaredDiffs = scores.map((s) => Math.pow(s - mean, 2));
    const variance =
      squaredDiffs.reduce((a, b) => a + b, 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // 80% confidence interval (t-style inflation for small samples)
    const margin = stdDev * ciMultiplier(scores.length);

    // Confidence decreases with volatility
    let confidence = 0.8;
    if (stdDev > 5) confidence = 0.6;
    else if (stdDev > 3) confidence = 0.7;

    return {
      low: mean - margin,
      high: mean + margin,
      confidence,
    };
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
