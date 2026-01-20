/**
 * Pattern Mining Module
 *
 * Exports pattern mining, causal discovery, stats insight, and correlation functionality.
 */

export { PatternMiner } from './pattern-miner';
export { CausalEngine } from './causal-engine';
export { ShotPatternMiner } from './shot-pattern-miner';
export { StatsInsightGenerator } from './stats-insight-generator';
export { CorrelationEngine } from './correlation-engine';
export type { StatsInsight, TrendAnalysis, TeamComparison, HistoricalStats, TeamStatsAggregate } from './stats-insight-generator';
export type { Correlation, CorrelationInsight, MetricRelationship } from './correlation-engine';
