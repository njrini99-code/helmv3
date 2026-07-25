/**
 * Self-Improving Feedback Loop Module
 *
 * Re-exports all feedback subsystems:
 * - confidence-calibrator: Real confidence calibration with bucket tracking
 * - outcome-tracker: Prediction outcome validation and bias correction
 * - insight-scorer: Feedback-driven insight scoring and thresholds
 *
 * `coach-behavior` (Coach usage analytics and preference derivation) was
 * removed 2026-07-25 (Fix 2 / P1-12 effectiveness ledger durability pass):
 * zero callers of its writer (`recordAction`) or readers
 * (`derivePreferences`/`prioritizeForCoach`) existed anywhere outside its own
 * barrel/tests — a never-started feature half, not a broken loop. The
 * `golf_coach_behavior_log` table it wrote to is untouched (dropping it needs
 * a migration, out of scope for a read-only TS cleanup).
 */

// Confidence Calibrator
export {
  calibrateConfidence,
  updateCalibrationRecord,
  calculateBrierScore,
  createEmptyCalibrationRecord,
} from './confidence-calibrator';
export type {
  CalibrationBucket,
  CalibrationRecord,
} from './confidence-calibrator';

// Outcome Tracker
export {
  validatePrediction,
  calculateAccuracyMetrics,
  calculateAdjustments,
} from './outcome-tracker';
export type {
  ValidationResult,
  PredictionAccuracyMetrics,
  PredictionAdjustments,
} from './outcome-tracker';

// Insight Scorer
export {
  scoreInsight,
  calculateThresholdAdjustments,
  shouldShowInsight,
} from './insight-scorer';
export type {
  InsightFeedback,
  InsightScore,
  ThresholdAdjustments,
} from './insight-scorer';
