/**
 * Confidence Calibrator
 *
 * Ensures stated confidence matches actual accuracy:
 * - When we say 80% confident, we should be right 80% of the time
 * - Tracks and adjusts based on historical accuracy
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { CalibrationBucket, CalibrationReport } from '../types';

interface ValidationRow {
  stated_confidence: number;
  was_correct: boolean;
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
 * Confidence Calibrator class for calibrating confidence levels
 */
export class ConfidenceCalibrator {
  private calibrationCurve: Map<number, number> = new Map();
  private loaded = false;

  /**
   * Calibrates a raw confidence value based on historical accuracy
   *
   * @param rawConfidence - The raw confidence (0-1)
   * @returns Calibrated confidence
   */
  async calibrate(rawConfidence: number): Promise<number> {
    await this.loadCalibrationCurve();

    // Round to nearest bucket
    const bucket = Math.round(rawConfidence * 10) / 10;

    // Get calibrated value from curve
    const calibrated = this.calibrationCurve.get(bucket);

    if (calibrated !== undefined) {
      // Blend raw and calibrated based on sample size confidence
      const sampleSizeConfidence = await this.getSampleSizeConfidence(bucket);
      return rawConfidence * (1 - sampleSizeConfidence) + calibrated * sampleSizeConfidence;
    }

    // No calibration data - apply conservative adjustment
    // Typically overconfidence is more common, so reduce slightly
    return rawConfidence * 0.9;
  }

  /**
   * Updates calibration curve from validation data
   */
  async updateCalibrationCurve(): Promise<void> {
    const supabase = createAdminClient();

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validationsTable = supabase.from('golf_validations' as any) as any;

    // Get validation data
    const { data: validations } = (await validationsTable
      .select('stated_confidence, was_correct')) as { data: ValidationRow[] | null };

    if (!validations || validations.length < 10) {
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

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calibrationTable = supabase.from('golf_confidence_calibration' as any) as any;

    // Update calibration table
    for (const [bucket, data] of buckets) {
      if (data.total < 5) continue; // Need minimum sample

      const actualAccuracy = data.correct / data.total;
      const calibrationError = Math.abs(bucket - actualAccuracy);

      await calibrationTable.upsert(
        {
          bucket,
          prediction_type: 'general',
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

    // Reload curve
    this.loaded = false;
    await this.loadCalibrationCurve();
  }

  /**
   * Gets confidence analysis report
   */
  async getConfidenceAnalysis(): Promise<CalibrationReport> {
    const supabase = createAdminClient();

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calibrationTable = supabase.from('golf_confidence_calibration' as any) as any;

    // Get calibration data
    const { data: calibration } = (await calibrationTable
      .select('*')
      .order('bucket')) as { data: CalibrationRow[] | null };

    if (!calibration || calibration.length === 0) {
      return {
        overallBias: 0,
        brierScore: 0,
        buckets: [],
        recommendations: ['Insufficient data for calibration analysis'],
      };
    }

    const buckets: CalibrationBucket[] = calibration.map((c) => ({
      bucket: c.bucket,
      predictionType: c.prediction_type,
      predictionsCount: c.predictions_count,
      correctCount: c.correct_count,
      actualAccuracy: c.actual_accuracy,
      sampleSize: c.sample_size,
      calibrationError: c.calibration_error,
    }));

    // Calculate overall bias
    let totalBias = 0;
    let totalWeight = 0;

    for (const b of buckets) {
      const bias = b.bucket - b.actualAccuracy;
      totalBias += bias * b.sampleSize;
      totalWeight += b.sampleSize;
    }

    const overallBias = totalWeight > 0 ? totalBias / totalWeight : 0;

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validationsTable = supabase.from('golf_validations' as any) as any;

    // Calculate Brier score (mean squared error)
    const { data: validations } = (await validationsTable
      .select('stated_confidence, was_correct')) as { data: ValidationRow[] | null };

    let brierSum = 0;
    const n = validations?.length ?? 0;

    for (const v of validations ?? []) {
      const outcome = v.was_correct ? 1 : 0;
      brierSum += Math.pow(v.stated_confidence - outcome, 2);
    }

    const brierScore = n > 0 ? brierSum / n : 0;

    // Generate recommendations
    const recommendations = this.generateRecommendations(overallBias, buckets);

    return {
      overallBias,
      brierScore,
      buckets,
      recommendations,
    };
  }

  /**
   * Loads calibration curve from database
   */
  private async loadCalibrationCurve(): Promise<void> {
    if (this.loaded) return;

    const supabase = createAdminClient();

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calibrationTable = supabase.from('golf_confidence_calibration' as any) as any;

    const { data } = (await calibrationTable
      .select('bucket, actual_accuracy, sample_size')) as {
      data: Array<{ bucket: number; actual_accuracy: number; sample_size: number }> | null;
    };

    if (data) {
      this.calibrationCurve.clear();
      for (const row of data) {
        if (row.sample_size >= 5) {
          this.calibrationCurve.set(row.bucket, row.actual_accuracy);
        }
      }
    }

    this.loaded = true;
  }

  /**
   * Gets confidence in the calibration based on sample size
   */
  private async getSampleSizeConfidence(bucket: number): Promise<number> {
    const supabase = createAdminClient();

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calibrationTable = supabase.from('golf_confidence_calibration' as any) as any;

    const { data } = (await calibrationTable
      .select('sample_size')
      .eq('bucket', bucket)
      .single()) as { data: { sample_size: number } | null };

    if (!data) return 0;

    // More samples = more confidence in calibration
    // 50+ samples = full confidence
    return Math.min(1, (data.sample_size ?? 0) / 50);
  }

  /**
   * Generates calibration recommendations
   */
  private generateRecommendations(
    overallBias: number,
    buckets: CalibrationBucket[]
  ): string[] {
    const recommendations: string[] = [];

    // Overall bias check
    if (overallBias > 0.1) {
      recommendations.push(
        `System is overconfident by ${(overallBias * 100).toFixed(0)}%. Consider reducing stated confidence levels.`
      );
    } else if (overallBias < -0.1) {
      recommendations.push(
        `System is underconfident by ${(Math.abs(overallBias) * 100).toFixed(0)}%. Can safely increase confidence levels.`
      );
    } else {
      recommendations.push('Overall calibration is good.');
    }

    // Check specific problem buckets
    for (const bucket of buckets) {
      if (bucket.calibrationError > 0.2 && bucket.sampleSize >= 10) {
        if (bucket.bucket > bucket.actualAccuracy) {
          recommendations.push(
            `${(bucket.bucket * 100).toFixed(0)}% confidence predictions are only correct ${(bucket.actualAccuracy * 100).toFixed(0)}% of the time.`
          );
        } else {
          recommendations.push(
            `${(bucket.bucket * 100).toFixed(0)}% confidence predictions are actually correct ${(bucket.actualAccuracy * 100).toFixed(0)}% of the time - can be more confident.`
          );
        }
      }
    }

    // Sample size recommendations
    const lowSampleBuckets = buckets.filter((b) => b.sampleSize < 10);
    if (lowSampleBuckets.length > 3) {
      recommendations.push(
        'Need more predictions to improve calibration accuracy.'
      );
    }

    return recommendations;
  }
}
