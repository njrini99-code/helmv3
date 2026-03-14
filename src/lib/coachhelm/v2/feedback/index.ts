/**
 * Self-Improving Feedback Loop Module
 *
 * Re-exports all feedback subsystems:
 * - confidence-calibrator: Real confidence calibration with bucket tracking
 * - outcome-tracker: Prediction outcome validation and bias correction
 * - insight-scorer: Feedback-driven insight scoring and thresholds
 * - coach-behavior: Coach usage analytics and preference derivation
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

// Coach Behavior
export {
  derivePreferences,
  prioritizeForCoach,
  recordAction,
  queryActions,
} from './coach-behavior';
export type {
  CoachAction,
  CoachPreferences,
} from './coach-behavior';
