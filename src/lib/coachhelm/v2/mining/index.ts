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
export { StatsInsightGenerator } from './stats-insight-generator';
export { CorrelationEngine } from './correlation-engine';
export { CorrelationDiscovery, discoverMetricCorrelations } from './correlation-discovery';
export { LieSpecificAnalyzer, analyzeLieSpecificMissPatterns } from './lie-specific-analysis';
export { analyzeResilience, analyzeTeamResilience } from './resilience-analysis';
export { analyzePressurePerformance } from './pressure-analysis';
export type { StatsInsight, TrendAnalysis, TeamComparison, HistoricalStats, TeamStatsAggregate } from './stats-insight-generator';
export type { Correlation, CorrelationInsight, MetricRelationship } from './correlation-engine';
export type { MetricCorrelation, CorrelationDiscoveryResult } from './correlation-discovery';
export type {
  LieType,
  MissDirection,
  MissBreakdown,
  LieSpecificPattern,
  DistanceRangeLiePattern,
  LieCrossComparison,
  RootCauseInsight,
  LieMissAnalysis,
  // V2: Shot Category Analysis
  ShotCategory,
  ApproachBracket,
  DrivingAnalysis,
  ApproachBracketAnalysis,
  AroundGreenAnalysis,
  ShotCategoryAnalysis,
  ShotCategoryInsight,
  // V2: Dispersion Analysis
  // Note: DispersionPattern not exported here to avoid conflict with types.ts
  // Access it via DispersionAnalysis interface instead
  MissSeverityBreakdown,
  DispersionAnalysis,
  DispersionInsight,
} from './lie-specific-analysis';
export type {
  ResilienceMetrics,
  ResilienceBenchmarks,
  ResilienceInsight,
  ResilienceAnalysis,
} from './resilience-analysis';
export type {
  PressureAnalysis,
  PressureInsight,
  PressureGapTrend,
  PressureScenario,
  QualifierPerformance,
  ScoringByRoundType,
  PressureGapDataPoint,
  RoundType,
} from './pressure-analysis';
