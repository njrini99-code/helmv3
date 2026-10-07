/**
 * CoachHelm V2 Statistical Foundation
 *
 * Pure math utilities for z-score normalization, rolling baselines,
 * percentile rankings, and anomaly detection.
 */

export {
  calculateZScores,
  normalizePlayerMetrics,
  computeCompositeRating,
  computeCategoryRatings,
} from './z-score';

export type {
  PlayerMetrics,
  PlayerZScores,
  CategoryRatings,
} from './z-score';

export {
  calculateEWMA,
  buildPlayerBaseline,
  compareToBaseline,
} from './baselines';

export type {
  PlayerBaseline,
  BaselineMetric,
  BaselineComparison,
} from './baselines';

export {
  calculatePercentile,
  buildPercentileProfile,
  teamPercentileReadout,
  PERCENTILE_MIN_TEAM_N,
} from './percentiles';

export type {
  PercentileProfile,
  PercentileMetric,
} from './percentiles';

export {
  detectAnomalies,
  detectIQRAnomalies,
  calculateVolatility,
  detectSlopeChange,
} from './anomaly-detector';

export type {
  Anomaly,
  VolatilityMetrics,
} from './anomaly-detector';
