/**
 * CoachHelm V2 Intelligence Engine
 *
 * Main entry point for the V2 intelligence system.
 * Exports all types, modules, and the main orchestrator.
 */

// Types
export * from './types';

// Feature extraction
export * from './features';

// Pattern mining
export * from './mining';

// Prediction engine
export * from './prediction';

// Learning system
export * from './learning';

// Reasoning engine
export * from './reasoning';

// Natural language generation
export * from './nlg';

// Gate (enable/disable)
export {
  isCoachHelmEnabledForCoach,
  isCoachHelmEnabledForPlayer,
} from './gate';

// Statistical foundation
export * from './stats';

// Trend analysis
export * from './trends';

// Shot analysis
export * from './shot-analysis';

// Simulation
export * from './simulation';

// Feedback loop (excluding CalibrationBucket and ValidationResult which are already exported from ./types)
export {
  calibrateConfidence,
  updateCalibrationRecord,
  calculateBrierScore,
  createEmptyCalibrationRecord,
  validatePrediction,
  calculateAccuracyMetrics,
  calculateAdjustments,
  scoreInsight,
  calculateThresholdAdjustments,
  shouldShowInsight,
  derivePreferences,
  prioritizeForCoach,
  recordAction,
  queryActions,
} from './feedback';
export type {
  CalibrationRecord,
  PredictionAccuracyMetrics,
  PredictionAdjustments,
  InsightFeedback,
  InsightScore,
  ThresholdAdjustments,
  CoachAction,
  CoachPreferences,
} from './feedback';

// Orchestrator
export { coachHelmIntelligence } from './orchestrator';
