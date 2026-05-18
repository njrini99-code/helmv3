/**
 * CoachHelm V2 Intelligence Engine Types
 *
 * Comprehensive type definitions for the V2 pattern mining, causal discovery,
 * prediction, learning, reasoning, and NLG systems.
 */

import type { LieMissAnalysis } from './mining/lie-specific-analysis';
import type { MultiWindowAnalysis } from './trends/multi-window';
import type { Anomaly } from './stats/anomaly-detector';
import type { Streak } from './trends/streak-detector';

// Re-export for convenience
export type { LieMissAnalysis };

// ============================================================================
// PATTERN TYPES
// ============================================================================

/** Types of patterns that can be mined */
export type PatternType =
  | 'conditional'  // Single condition → outcome
  | 'compound'     // Multiple conditions → outcome
  | 'anomaly'      // Unusual situation with unusual outcome
  | 'regression'   // Predictive correlation
  | 'sequence'     // Order-based patterns
  | 'temporal'     // Time-based patterns
  | 'contextual'   // Context-driven patterns (event, setting, etc.)
  | 'cluster';     // Player similarity/cluster patterns

/** Operators for pattern conditions */
export type ConditionOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'between' | 'in' | 'not_in' | 'contains';

/** Trend direction for patterns */
export type PatternTrend = 'strengthening' | 'stable' | 'weakening' | 'new';

/** A single condition in a pattern */
export interface PatternCondition {
  field: string;
  operator: ConditionOperator;
  value: number | string | boolean | number[] | string[];
  label?: string; // Human-readable label
}

/** Outcome specification for a pattern */
export interface PatternOutcome {
  metric: string;
  direction: 'increase' | 'decrease' | 'specific';
  magnitude?: number;
  comparison?: 'vs_baseline' | 'vs_expected' | 'absolute';
}

/** A mined pattern with statistical validation */
export interface MinedPattern {
  id: string;
  playerId: string;
  patternType: PatternType;
  conditions: PatternCondition[];
  outcome: PatternOutcome;

  // Statistical metrics
  support: number;      // How often conditions occur (0-1)
  confidence: number;   // When conditions occur, how often outcome happens (0-1)
  lift: number;         // How much more likely than random
  conviction: number;   // Strength of implication

  // Impact
  strokeImpact: number;  // Strokes per round impact
  actionability: number; // How actionable is this pattern (0-1)

  // Metadata
  sampleSize: number;
  firstDetected: string;
  lastOccurrence: string;
  occurrenceCount: number;
  trend: PatternTrend;
  isActive: boolean;

  // Human-readable
  description?: string;
  recommendation?: string;

  // Lifecycle / severity metadata (Task B13). Persisted to golf_patterns_v2.
  severity?: 'low' | 'medium' | 'high' | 'critical';
  lifecycleState?: 'detected' | 'validated' | 'acknowledged' | 'dismissed' | 'resolved';
  sourceRoundIds?: string[];
}

// ============================================================================
// CAUSAL RELATIONSHIP TYPES
// ============================================================================

/** Type of causal relationship */
export type CausalRelationshipType =
  | 'direct'       // X directly causes Y
  | 'mediated'     // X → M → Y
  | 'moderated'    // X → Y, but depends on Z
  | 'bidirectional'; // X ↔ Y

/** A discovered causal relationship */
export interface CausalRelationship {
  id: string;
  playerId?: string;
  teamId?: string;

  // The relationship
  cause: string;
  causeMetric?: string;
  effect: string;
  effectMetric?: string;
  relationshipType: CausalRelationshipType;

  // Strength and confidence
  strength: number;    // Effect size (0-1)
  confidence: number;  // Confidence in causality (0-1)

  // Explanation
  mechanism: string;   // How does X cause Y
  confounders: string[]; // Potential third variables

  // Intervention
  temporalLagDays?: number;
  doseResponse: boolean; // More X → more Y?
  interventionPotential: number; // Can we actually change X?

  // Validation
  evidence: CausalEvidence;
  validatedAt?: string;
  validationCount: number;
}

/** Evidence supporting a causal relationship */
export interface CausalEvidence {
  temporalPrecedence: boolean;
  doseResponseConfirmed: boolean;
  confoundersControlled: string[];
  naturalExperiments: NaturalExperiment[];
}

/** A natural experiment observation */
export interface NaturalExperiment {
  date: string;
  causeChange: string;
  effectChange: string;
  supportsCausality: boolean;
}

// ============================================================================
// PREDICTION TYPES
// ============================================================================

/** Types of predictions */
export type PredictionType =
  | 'round_score'   // Predict next round score
  | 'metric'        // Predict a specific metric
  | 'trajectory'    // Long-term trajectory
  | 'comparison'    // Relative to another player
  | 'milestone';    // Will reach milestone X

/** Tail risk for predictions */
export interface TailRisk {
  description: string;
  probability: number;
  impact: 'high' | 'medium' | 'low';
}

/** Tail risk probabilities object (for UI components) */
export interface TailRiskProbabilities {
  blowupProbability: number;
  greatRoundProbability: number;
}

/** A performance prediction */
export interface PerformancePrediction {
  id: string;
  playerId: string;
  predictionType: PredictionType;
  metric: string;

  // Point estimate
  predictedValue: number;

  // Confidence interval
  predictedRangeLow: number;
  predictedRangeHigh: number;
  confidence: number;
  calibratedConfidence: number;

  // What's driving this prediction
  keyFactors: PredictionFactor[];
  sensitivities: Record<string, number>; // How prediction changes if factor changes

  // Context
  context: PredictionContext;
  dueDate: string;

  // Validation (filled in later)
  actualValue?: number;
  validatedAt?: string;
  wasCorrect?: boolean;
  errorAbsolute?: number;
  errorRelative?: number;
  withinInterval?: boolean;

  // V2 additional properties for UI components
  trend?: 'improving' | 'stable' | 'declining';
  lowerBound?: number;
  upperBound?: number;
  inputFeatures?: string[];
  keyDrivers?: string[];
  predictionRange?: { low: number; high: number };
  factors?: PredictionFactor[];
  tailRisks?: TailRisk[] | TailRiskProbabilities;
}

/** A factor driving a prediction */
export interface PredictionFactor {
  name: string;
  value: number | string;
  contribution: number; // How much does this contribute to prediction
  direction: 'positive' | 'negative' | 'neutral';
  explanation: string;
}

/** Context for a prediction */
export interface PredictionContext {
  courseId?: string;
  courseName?: string;
  isCompetitive?: boolean;
  eventType?: string;
  weather?: string;
  playerState?: string;
}

/** Trajectory forecast for longer-term predictions */
export interface TrajectoryForecast {
  playerId: string;
  horizonDays: number;

  // Projections
  projections: TrajectoryPoint[];
  scenarios: TrajectoryScenario[];

  // Key insights
  milestones: TrajectoryMilestone[];
  risks: TrajectoryRisk[];
  opportunities: TrajectoryOpportunity[];

  // Model info
  modelConfidence: number;
  primaryModel: 'linear' | 'seasonal' | 'pattern_based' | 'ensemble';
}

/** A point on the trajectory */
export interface TrajectoryPoint {
  date: string;
  metric: string;
  value: number;
  rangeLow: number;
  rangeHigh: number;
  confidence: number;
}

/** A scenario for trajectory */
export interface TrajectoryScenario {
  name: 'best' | 'likely' | 'conservative' | 'worst';
  probability: number;
  trajectory: TrajectoryPoint[];
  assumptions: string[];
}

/** A milestone on the trajectory */
export interface TrajectoryMilestone {
  description: string;
  targetValue: number;
  estimatedDate: string;
  probability: number;
}

/** A risk on the trajectory */
export interface TrajectoryRisk {
  description: string;
  probability: number;
  impact: number;
  mitigation: string;
}

/** An opportunity on the trajectory */
export interface TrajectoryOpportunity {
  description: string;
  probability: number;
  potentialGain: number;
  action: string;
}

// ============================================================================
// LEARNING TYPES
// ============================================================================

/** Entity type for learning */
export type LearningEntityType = 'coach' | 'player' | 'team';

/** Interaction type for behavior learning */
export type InteractionType =
  | 'view' | 'click' | 'dismiss' | 'action'
  | 'expand' | 'collapse' | 'share' | 'feedback';

/** A user interaction for learning */
export interface UserInteraction {
  entityId: string;
  entityType: LearningEntityType;
  interactionType: InteractionType;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/** Learned behavior for an entity */
export interface LearnedBehavior {
  id: string;
  entityId: string;
  entityType: LearningEntityType;

  // Interaction summary
  interactions: {
    views: number;
    clicks: number;
    dismissals: number;
    actions: number;
  };

  // Learned preferences
  preferences: LearnedPreferences;

  // Personalized thresholds
  learnedThresholds: Record<string, number>;

  // Engagement patterns
  engagementPatterns: EngagementPattern[];

  // Content preferences
  contentPreferences: ContentPreferences;

  // Metadata
  lastInteractionAt?: string;
  interactionCount: number;
  engagementScore?: number;
}

/** Learned preferences */
export interface LearnedPreferences {
  preferredInsightTypes: string[];
  preferredMetrics: string[];
  alertFrequency: 'high' | 'medium' | 'low';
  detailLevel: 'brief' | 'balanced' | 'detailed';
}

/** Engagement pattern */
export interface EngagementPattern {
  hour: number;
  dayOfWeek: number;
  engagementRate: number;
}

/** Content preferences */
export interface ContentPreferences {
  verbosity: 'brief' | 'balanced' | 'detailed';
  focusAreas: string[];
  preferredVisualization?: 'charts' | 'tables' | 'text';
}

/** Validation result for a prediction */
export interface ValidationResult {
  id: string;
  predictionId: string;
  statedConfidence: number;
  wasCorrect: boolean;
  absoluteError: number;
  relativeError?: number;
  withinConfidenceInterval: boolean;
  directionCorrect?: boolean;
  learningSignals: Record<string, unknown>;
}

// ============================================================================
// REASONING TYPES
// ============================================================================

/** Type of reasoning */
export type ReasoningType = 'deductive' | 'inductive' | 'abductive';

/** A step in the reasoning chain */
export interface ReasoningStep {
  stepNumber: number;
  type: ReasoningType;
  premise: string;
  inference: string;
  conclusion: string;
  confidence: number;
  evidence?: string[];
}

/** Result of reasoning */
export interface ReasoningResult {
  conclusion: string;
  confidence: number;
  calibratedConfidence: number;
  reasoningChain: ReasoningStep[];
  alternatives: AlternativeExplanation[];
  sensitivities: Sensitivity[];
  evidence?: string[]; // Supporting evidence for the conclusion
}

/** An alternative explanation */
export interface AlternativeExplanation {
  explanation: string;
  probability: number;
  whyLessLikely: string;
}

/** Sensitivity analysis */
export interface Sensitivity {
  assumption: string;
  ifChanged: string;
  impactOnConclusion: string;
}

// ============================================================================
// CONFIDENCE CALIBRATION TYPES
// ============================================================================

/** Calibration bucket */
export interface CalibrationBucket {
  bucket: number; // 0.0, 0.1, 0.2, ... 1.0
  predictionType: string;
  predictionsCount: number;
  correctCount: number;
  actualAccuracy: number;
  sampleSize: number;
  calibrationError: number;
}

/** Overall calibration report */
export interface CalibrationReport {
  overallBias: number; // Positive = overconfident, Negative = underconfident
  brierScore: number;
  buckets: CalibrationBucket[];
  recommendations: string[];
}

// ============================================================================
// NLG (Natural Language Generation) TYPES
// ============================================================================

/** Tone for insight composition */
export type InsightTone = 'neutral' | 'encouraging' | 'cautionary' | 'celebratory' | 'urgent';

/** Evidence metric attached to an insight */
export interface InsightEvidenceMetric {
  label: string;
  value: string | number;
  benchmark?: number | null;
  trend?: 'improving' | 'declining' | 'stable';
  /** Whether value is worse than benchmark (true = needs work) */
  belowBenchmark?: boolean;
}

/** Composed insight */
export interface ComposedInsight {
  headline: string;
  body: string;
  callToAction?: string;
  tone: InsightTone;
  confidence: number;
  reasoning?: ReasoningResult;
  /** Strokes per round this issue costs — higher = more impactful */
  strokeImpact?: number;
  /** Structured evidence metrics for visual display */
  evidenceMetrics?: InsightEvidenceMetric[];
}

/** Categories for insight deduplication and grouping */
export type InsightCategory =
  | 'putting'
  | 'ball_striking'
  | 'short_game'
  | 'course_management'
  | 'mental_game'
  | 'scoring'
  | 'shot_pattern'
  | 'team_trend'
  | 'general';

/** A composed insight enriched with player context for team-level display */
export interface TeamComposedInsight extends ComposedInsight {
  playerId?: string;
  playerName?: string;
  category?: InsightCategory;
}

/** A group of related insights across players */
export interface InsightGroup {
  id: string;
  category: InsightCategory;
  tone: InsightTone;
  headline: string;
  body: string;
  callToAction?: string;
  confidence: number;
  /** Max stroke impact across member insights */
  strokeImpact?: number;
  players: Array<{ playerId: string; playerName: string }>;
  memberInsights: TeamComposedInsight[];
  playerCount: number;
  isTeamWide: boolean;
}

/** Context for insight composition */
export interface InsightContext {
  playerId: string;
  playerName?: string;
  isForCoach: boolean;
  verbosity: 'brief' | 'balanced' | 'detailed';
  playerState?: 'improving' | 'stable' | 'struggling' | 'unknown';
  recentPerformance?: 'good' | 'average' | 'poor';
}

// ============================================================================
// FEATURE TYPES
// ============================================================================

/** Temporal features extracted from player data */
export interface TemporalFeatures {
  daysSinceLastRound: number;
  roundsInLast7Days: number;
  roundsInLast14Days: number;
  roundsInLast30Days: number;
  playingFrequency: 'high' | 'medium' | 'low' | 'sporadic';

  // Trends
  scoringTrend7Day: number;
  scoringTrend30Day: number;
  volatility7Day: number;
  volatility30Day: number;

  // Recent form
  recentFormScore: number; // -1 to 1, negative = declining
  formMomentum: number;
}

/** Sequence features from hole-to-hole analysis */
export interface SequenceFeatures {
  // Follow-up patterns
  birdieFollowUpPar: number;
  birdieFollowUpBirdie: number;
  birdieFollowUpBogey: number;
  bogeyFollowUpPar: number;
  bogeyFollowUpBirdie: number;
  bogeyFollowUpBogey: number;

  // Streaks
  averageBirdieStreak: number;
  averageBogeyStreak: number;
  longestBirdieStreak: number;
  longestBogeyStreak: number;

  // Front vs back
  frontNineAvg: number;
  backNineAvg: number;
  frontBackDiff: number;

  // Problem holes
  typicalCollapseHole?: number;
  finishingHolesAvg: number;
}

/** Contextual features inferred from data */
export interface ContextualFeatures {
  confidenceLevel: 'high' | 'medium' | 'low';
  formCycle: 'peak' | 'rising' | 'declining' | 'trough' | 'stable';
  pressureExposure: number; // 0-1
  clutchFactor: number; // Performance under pressure relative to baseline
  competitiveIndex: number; // How often in competitive rounds
  practiceVsTournament: number; // Ratio
}

/** All extracted features combined */
export interface ExtractedFeatures {
  playerId: string;
  extractedAt: string;
  temporal: TemporalFeatures;
  sequence: SequenceFeatures;
  contextual: ContextualFeatures;
}

// ============================================================================
// ORCHESTRATOR TYPES
// ============================================================================

/** Options for player analysis */
export interface AnalysisOptions {
  includePatterns?: boolean;
  includeCausal?: boolean;
  includePredictions?: boolean;
  includeTrajectory?: boolean;
  includeShotPatterns?: boolean;
  includeLieAnalysis?: boolean;
  depth?: 'quick' | 'standard' | 'deep';
}

/** Full player analysis result */
export interface PlayerAnalysis {
  playerId: string;
  playerName?: string;
  analyzedAt: string;

  features: ExtractedFeatures;
  patterns: MinedPattern[];
  causalRelationships: CausalRelationship[];
  predictions: PerformancePrediction[];
  trajectory?: TrajectoryForecast;
  shotPatterns?: ShotPatternAnalysis;
  lieAnalysis?: LieMissAnalysis;

  insights: ComposedInsight[];
  primaryInsight: ComposedInsight;

  recommendations: string[];
  alertLevel: 'none' | 'info' | 'warning' | 'critical';

  // V3 statistical analysis results
  trendAnalysis?: MultiWindowAnalysis;
  anomalies?: Anomaly[];
  streaks?: Streak[];

  // 2026-05-17 — closes audit Q-NEW-5 / Q-NEW-6. Per-generator summary lets
  // the post-round trigger and analyze-player route distinguish "engine ran
  // fine, no insights" from "engine partially failed".
  generatorSummary?: {
    successes: string[];
    failures: Array<{ generator: string; reason: string }>;
  };
}

/** Intelligent round review (V2 enhanced) */
export interface IntelligentRoundReview {
  roundId: string;
  playerId: string;

  // Basic review data
  summary: string;
  primaryTakeaway: string;

  // V2 enhancements
  patternsApplied: MinedPattern[];
  causalInsights: CausalRelationship[];
  prediction: PerformancePrediction | null;
  reasoning: ReasoningResult;

  // Composed output
  composedReview: ComposedInsight;

  // Next steps
  focusAreas: string[];
  practicePriority: string;
}

// ============================================================================
// COACHHELM SETTINGS TYPES
// ============================================================================

/** CoachHelm settings for a user */
export interface CoachHelmSettings {
  enabled: boolean;
  disabledAt: string | null;
  disabledReason: string | null;
}

/** CoachHelm status for access control */
export interface CoachHelmStatus {
  userEnabled: boolean;
  teamEnabled: boolean;
  effectivelyEnabled: boolean;
  disabledReason: string | null;
  disabledBy: 'user' | 'coach' | 'team' | null;
}

// ============================================================================
// SHOT-LEVEL PATTERN TYPES
// ============================================================================

/** Dispersion pattern type */
export type DispersionPattern = 'tight' | 'scattered' | 'one_way_left' | 'one_way_right' | 'one_way_short' | 'one_way_long';

/** Distance range for shot grouping */
export interface DistanceRange {
  min: number;
  max: number;
  label: string;
}

/** Shot situation context */
export interface ShotSituation {
  distanceRange: DistanceRange;
  lie: string;
  shotType?: string;
  club?: string;
}

/** Miss direction tendency analysis */
export interface MissTendency {
  direction: string;
  frequency: number; // 0-1
  avgDistance: number; // Average distance from target when missing this direction
  consistency: number; // 0-1, how consistent the miss is in this direction
}

/** Shot pattern with dispersion analysis */
export interface ShotPattern {
  id: string;
  playerId: string;

  // Situation this pattern applies to
  situation: ShotSituation;

  // Miss tendency analysis
  tendencies: MissTendency[];
  primaryMiss: string; // Most common miss direction
  dispersionPattern: DispersionPattern;

  // Distance metrics
  avgDistanceError: number; // Average yards from target
  avgProximity: number; // Average proximity to target (relevant for approaches)
  distanceControlScore: number; // 0-1, how well they control distance

  // Statistical validation
  sampleSize: number;
  confidence: number;

  // Actionable insight
  insight: string;
  recommendation: string;

  // Metadata
  createdAt: string;
  updatedAt: string;
}

/** Aggregated shot statistics for a distance range */
export interface DistanceRangeStats {
  range: DistanceRange;
  totalShots: number;

  // Accuracy metrics
  avgProximity: number;
  greenHitRate: number; // For approaches
  fairwayHitRate: number; // For drives

  // Miss analysis
  missDirectionBreakdown: Record<string, number>;
  avgMissDistance: number;

  // By lie breakdown
  byLie: Record<string, {
    shots: number;
    avgProximity: number;
    missBreakdown: Record<string, number>;
  }>;
}

/** Complete shot pattern analysis for a player */
export interface ShotPatternAnalysis {
  playerId: string;
  analyzedAt: string;

  // Patterns discovered
  patterns: ShotPattern[];

  // Stats by distance range
  rangeStats: DistanceRangeStats[];

  // Top insights
  criticalPatterns: ShotPattern[]; // Patterns with highest impact

  // Summary metrics
  overallDispersion: DispersionPattern;
  primaryWeakness: string;
  primaryStrength: string;
}
