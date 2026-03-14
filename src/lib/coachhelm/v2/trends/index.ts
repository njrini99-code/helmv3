/**
 * Trends & Pattern Analysis Module
 *
 * Multi-window trend detection, streak analysis, and regression-to-mean
 * prediction for the CoachHelm V2 intelligence engine.
 */

// Multi-Window Trend Detection
export {
  analyzeMultiWindowTrends,
  linearRegression,
} from './multi-window';
export type {
  TrendWindow,
  MultiWindowAnalysis,
  WindowAlignment,
} from './multi-window';

// Streak Detection + Composition
export {
  detectStreaks,
  analyzeStreakComposition,
} from './streak-detector';
export type {
  Streak,
  StreakComposition,
  SGBreakdown,
} from './streak-detector';

// Regression to Mean Detector
export {
  detectRegressionCandidate,
  calculateRegressionCoefficient,
} from './regression-to-mean';
export type { RegressionPrediction } from './regression-to-mean';
