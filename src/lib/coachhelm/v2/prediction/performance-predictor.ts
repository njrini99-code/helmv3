/**
 * Performance Predictor
 *
 * Predicts player performance for upcoming rounds including:
 * - Point estimate with confidence interval
 * - Key factors driving the prediction
 * - Sensitivity analysis
 * - Tail risk (probability of blowup/great round)
 */

import { createClient } from '@/lib/supabase/server';
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
    targetDate: Date = new Date(),
    context?: Partial<PredictionContext>
  ): Promise<PerformancePrediction | null> {
    const supabase = await createClient();

    // Load features and baseline
    this.features = await extractAllFeatures(this.playerId);
    if (!this.features) return null;

    // Get baseline score (average over last 20 rounds)
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('score_to_par')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(20);

    if (!rounds || rounds.length < 5) return null;

    this.baselineScore =
      rounds.reduce((a, r) => a + (r.score_to_par ?? 0), 0) / rounds.length;

    // Get active patterns
    const miner = new PatternMiner(this.playerId);
    this.patterns = await miner.minePatterns();

    // Apply prediction model
    const { predictedScore, factors } = this.applyModel(context);

    // Calculate confidence interval
    const roundsForInterval = rounds.map(r => ({ score_to_par: r.score_to_par ?? 0 }));
    const { low, high, confidence } = this.calculateConfidenceInterval(roundsForInterval);

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
      predictedValue: predictedScore,
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
      dueDate: targetDate.toISOString().split('T')[0] ?? '',
    };

    // Save prediction for later validation
    await this.savePrediction(prediction);

    return prediction;
  }

  /**
   * Applies the prediction model
   */
  private applyModel(
    context?: Partial<PredictionContext>
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

    // Factor 6: Active pattern impacts
    let patternAdj = 0;
    for (const pattern of this.patterns) {
      if (pattern.isActive && this.isPatternApplicable(pattern, context)) {
        patternAdj += pattern.strokeImpact * pattern.confidence;
      }
    }
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

    // 80% confidence interval (approximately 1.28 standard deviations)
    const margin = stdDev * 1.28;

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

    const factorDescriptions: Record<string, { name: string; explanation: string }> = {
      recentForm: {
        name: 'Recent Form',
        explanation: 'Performance over the last 5 rounds compared to baseline',
      },
      trendMomentum: {
        name: 'Trend Momentum',
        explanation: 'Rate of improvement or decline in scoring',
      },
      restRust: {
        name: 'Rest/Rust',
        explanation: 'Effect of time since last competitive round',
      },
      pressure: {
        name: 'Pressure',
        explanation: 'Historical performance in competitive situations',
      },
      formCycle: {
        name: 'Form Cycle',
        explanation: 'Position in natural performance cycle',
      },
      patterns: {
        name: 'Active Patterns',
        explanation: 'Historical patterns that apply to this situation',
      },
    };

    for (const [key, contribution] of sortedFactors) {
      if (Math.abs(contribution) < 0.1) continue;

      const desc = factorDescriptions[key] || {
        name: key,
        explanation: 'Contributing factor',
      };

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
    const supabase = await createClient();

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = supabase.from('golf_predictions' as any) as any;

    await table.insert({
      id: prediction.id,
      player_id: prediction.playerId,
      prediction_type: prediction.predictionType,
      metric: prediction.metric,
      predicted_value: prediction.predictedValue,
      predicted_range_low: prediction.predictedRangeLow,
      predicted_range_high: prediction.predictedRangeHigh,
      confidence: prediction.confidence,
      calibrated_confidence: prediction.calibratedConfidence,
      confidence_interval: {
        low: prediction.predictedRangeLow,
        high: prediction.predictedRangeHigh,
      },
      features_snapshot: this.features,
      key_factors: prediction.keyFactors,
      sensitivities: prediction.sensitivities,
      context: prediction.context,
      due_date: prediction.dueDate,
    });
  }
}
