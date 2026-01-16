/**
 * Outcome Validator
 *
 * Validates predictions against actual outcomes to:
 * - Calculate accuracy metrics
 * - Update model weights
 * - Track calibration
 */

import { createClient } from '@/lib/supabase/server';
import type {
  ValidationResult,
  CalibrationBucket,
} from '../types';

// Internal types for database rows (tables created via migration)
interface PredictionRow {
  id: string;
  player_id: string;
  prediction_type: string;
  metric: string;
  predicted_value: number;
  predicted_range_low: number | null;
  predicted_range_high: number | null;
  confidence: number;
  due_date: string;
}

interface ValidationRow {
  stated_confidence: number;
  was_correct: boolean;
  absolute_error: number | null;
}

interface CalibrationRow {
  bucket: number;
  prediction_type: string;
  predictions_count: number;
  correct_count: number;
  actual_accuracy: number;
  sample_size: number;
  calibration_error: number;
}

/**
 * Outcome Validator class for prediction validation
 */
export class OutcomeValidator {
  /**
   * Validates pending predictions against actual outcomes
   */
  async validatePredictions(): Promise<ValidationResult[]> {
    const supabase = await createClient();

    // Get predictions that are due and not yet validated
    const today = new Date().toISOString().split('T')[0];

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const predictionsTable = supabase.from('golf_predictions' as any) as any;

    const { data: predictions, error } = await predictionsTable
      .select('*')
      .lte('due_date', today)
      .is('validated_at', null)
      .limit(50) as { data: PredictionRow[] | null; error: Error | null };

    if (error || !predictions) {
      return [];
    }

    const results: ValidationResult[] = [];

    for (const prediction of predictions) {
      const result = await this.validateSinglePrediction(prediction);
      if (result) {
        results.push(result);
      }
    }

    // Update calibration after validations
    await this.updateCalibration();

    return results;
  }

  /**
   * Validates a single prediction
   */
  private async validateSinglePrediction(
    prediction: PredictionRow
  ): Promise<ValidationResult | null> {
    const supabase = await createClient();

    // Get actual outcome
    const actualValue = await this.getActualOutcome(
      prediction.player_id,
      prediction.metric,
      prediction.due_date
    );

    if (actualValue === null) {
      return null; // No actual data yet
    }

    // Calculate accuracy metrics
    const accuracy = this.calculateAccuracy(
      prediction.predicted_value,
      actualValue,
      prediction.predicted_range_low,
      prediction.predicted_range_high
    );

    // Determine if prediction was correct
    const wasCorrect = accuracy.withinInterval || accuracy.relativeError < 0.1;

    // Create validation result
    const result: ValidationResult = {
      id: crypto.randomUUID(),
      predictionId: prediction.id,
      statedConfidence: prediction.confidence,
      wasCorrect,
      absoluteError: accuracy.absoluteError,
      relativeError: accuracy.relativeError,
      withinConfidenceInterval: accuracy.withinInterval,
      directionCorrect: accuracy.directionCorrect,
      learningSignals: this.extractLearningSignals(prediction, actualValue),
    };

    // Type assertions for new tables
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const predictionsTable = supabase.from('golf_predictions' as any) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validationsTable = supabase.from('golf_validations' as any) as any;

    // Update prediction record
    await predictionsTable
      .update({
        actual_value: actualValue,
        validated_at: new Date().toISOString(),
        was_correct: wasCorrect,
        error_absolute: accuracy.absoluteError,
        error_relative: accuracy.relativeError,
        within_interval: accuracy.withinInterval,
        direction_correct: accuracy.directionCorrect,
      })
      .eq('id', prediction.id);

    // Save validation
    await validationsTable.insert({
      id: result.id,
      prediction_id: result.predictionId,
      stated_confidence: result.statedConfidence,
      actual_confidence_bucket: Math.round(result.statedConfidence * 10) / 10,
      was_correct: result.wasCorrect,
      absolute_error: result.absoluteError,
      relative_error: result.relativeError,
      within_confidence_interval: result.withinConfidenceInterval,
      direction_correct: result.directionCorrect,
      learning_signals: result.learningSignals,
    });

    return result;
  }

  /**
   * Gets actual outcome from round data
   */
  private async getActualOutcome(
    playerId: string,
    metric: string,
    dueDate: string
  ): Promise<number | null> {
    const supabase = await createClient();

    // Look for a round on or near the due date
    const dueDateObj = new Date(dueDate);
    const startDate = new Date(dueDateObj);
    startDate.setDate(startDate.getDate() - 3);
    const endDate = new Date(dueDateObj);
    endDate.setDate(endDate.getDate() + 3);

    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('score_to_par, total_score, total_putts')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .gte('round_date', startDate.toISOString())
      .lte('round_date', endDate.toISOString())
      .order('round_date', { ascending: false })
      .limit(1);

    if (!rounds || rounds.length === 0) {
      return null;
    }

    const round = rounds[0];
    if (!round) {
      return null;
    }

    // Map metric to actual value
    switch (metric) {
      case 'score_to_par':
        return round.score_to_par ?? null;
      case 'total_score':
        return round.total_score ?? null;
      case 'total_putts':
        return round.total_putts ?? null;
      case 'scoring_average':
        return round.score_to_par ?? null; // Single round approximation
      default:
        return round.score_to_par ?? null;
    }
  }

  /**
   * Calculates accuracy metrics
   */
  private calculateAccuracy(
    predicted: number,
    actual: number,
    rangeLow: number | null,
    rangeHigh: number | null
  ): {
    absoluteError: number;
    relativeError: number;
    withinInterval: boolean;
    directionCorrect: boolean;
  } {
    const absoluteError = Math.abs(actual - predicted);
    const relativeError =
      predicted !== 0 ? absoluteError / Math.abs(predicted) : absoluteError;

    const withinInterval =
      rangeLow !== null &&
      rangeHigh !== null &&
      actual >= rangeLow &&
      actual <= rangeHigh;

    // Direction correct if we predicted improvement and they improved
    const predictedImprovement = predicted < 0;
    const actualImprovement = actual < 0;
    const directionCorrect = predictedImprovement === actualImprovement;

    return {
      absoluteError,
      relativeError,
      withinInterval,
      directionCorrect,
    };
  }

  /**
   * Extracts learning signals from prediction error
   */
  private extractLearningSignals(
    prediction: { predicted_value: number; confidence: number },
    actual: number
  ): Record<string, unknown> {
    const error = actual - prediction.predicted_value;

    return {
      overEstimated: error < 0,
      underEstimated: error > 0,
      errorMagnitude: Math.abs(error),
      confidenceAppropriate: Math.abs(error) < 3 === prediction.confidence > 0.7,
    };
  }

  /**
   * Updates calibration buckets
   */
  private async updateCalibration(): Promise<void> {
    const supabase = await createClient();

    // Type assertion for new table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validationsTable = supabase.from('golf_validations' as any) as any;

    // Get all validations
    const { data: validations } = await validationsTable
      .select('stated_confidence, was_correct') as { data: ValidationRow[] | null };

    if (!validations || validations.length === 0) {
      return;
    }

    // Group by confidence bucket
    const buckets = new Map<number, { correct: number; total: number }>();

    for (const v of validations) {
      const bucket = Math.round(v.stated_confidence * 10) / 10;
      if (!buckets.has(bucket)) {
        buckets.set(bucket, { correct: 0, total: 0 });
      }
      const b = buckets.get(bucket)!;
      b.total++;
      if (v.was_correct) b.correct++;
    }

    // Type assertion for calibration table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calibrationTable = supabase.from('golf_confidence_calibration' as any) as any;

    // Update calibration table
    for (const [bucket, data] of buckets) {
      const actualAccuracy = data.total > 0 ? data.correct / data.total : 0;
      const calibrationError = Math.abs(bucket - actualAccuracy);

      await calibrationTable.upsert(
        {
          bucket,
          prediction_type: 'round_score',
          predictions_count: data.total,
          correct_count: data.correct,
          actual_accuracy: actualAccuracy,
          sample_size: data.total,
          calibration_error: calibrationError,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'bucket,prediction_type' }
      );
    }
  }

  /**
   * Gets model accuracy report
   */
  async getModelAccuracy(): Promise<{
    overall: number;
    byType: Record<string, number>;
    byConfidenceBucket: CalibrationBucket[];
    bias: number;
  }> {
    const supabase = await createClient();

    // Type assertions for new tables
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validationsTable = supabase.from('golf_validations' as any) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calibrationTable = supabase.from('golf_confidence_calibration' as any) as any;

    // Get all validations
    const { data: validations } = await validationsTable
      .select('stated_confidence, was_correct, absolute_error') as { data: ValidationRow[] | null };

    if (!validations || validations.length === 0) {
      return {
        overall: 0,
        byType: {},
        byConfidenceBucket: [],
        bias: 0,
      };
    }

    // Overall accuracy
    const correct = validations.filter((v) => v.was_correct).length;
    const overall = correct / validations.length;

    // Get calibration buckets
    const { data: calibration } = await calibrationTable
      .select('*')
      .order('bucket') as { data: CalibrationRow[] | null };

    const byConfidenceBucket: CalibrationBucket[] = (calibration ?? []).map((c) => ({
      bucket: c.bucket,
      predictionType: c.prediction_type,
      predictionsCount: c.predictions_count,
      correctCount: c.correct_count,
      actualAccuracy: c.actual_accuracy,
      sampleSize: c.sample_size,
      calibrationError: c.calibration_error,
    }));

    // Calculate bias
    let biasSum = 0;
    let biasCount = 0;
    for (const v of validations) {
      if (v.absolute_error !== null) {
        biasSum += v.absolute_error * (v.was_correct ? -1 : 1);
        biasCount++;
      }
    }
    const bias = biasCount > 0 ? biasSum / biasCount : 0;

    return {
      overall,
      byType: { round_score: overall },
      byConfidenceBucket,
      bias,
    };
  }
}
