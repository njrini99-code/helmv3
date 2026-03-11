/**
 * Pattern Mining Module
 *
 * Exports pattern mining, causal discovery, stats insight, correlation,
 * cross-metric correlation discovery, lie-specific analysis, resilience analysis,
 * and pressure performance analysis functionality.
 */

export { PatternMiner } from './pattern-miner';
export { CausalEngine } from './causal-engine';
export { ShotPatternMiner } from './shot-pattern-miner';
export { ShotStateIntelligence } from './shot-state-intelligence';
export { StatsInsightGenerator } from './stats-insight-generator';
export { CorrelationDiscovery } from './correlation-discovery';
export { analyzeLieSpecificMissPatterns } from './lie-specific-analysis';
export type { StatsInsight } from './stats-insight-generator';
export type { MetricCorrelation } from './correlation-discovery';
export type { ShotStateAnalysis, ShotStateInsight } from './shot-state-intelligence';
export type {
  LieSpecificPattern,
  DistanceRangeLiePattern,
  LieCrossComparison,
  RootCauseInsight,
  LieMissAnalysis,
  ShotCategoryAnalysis,
  ShotCategoryInsight,
  DispersionAnalysis,
  DispersionInsight,
} from './lie-specific-analysis';
