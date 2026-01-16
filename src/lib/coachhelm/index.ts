/**
 * CoachHelm Intelligence Engine
 *
 * Single entry point for the CoachHelm AI system.
 * All functionality is powered by the core intelligence engine.
 *
 * Usage:
 *   import { coachHelmIntelligence, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm';
 *   const analysis = await coachHelmIntelligence.analyzePlayer(playerId);
 */

// ============================================================================
// Core Intelligence Engine (Primary Export)
// ============================================================================

export {
  // Main orchestrator
  CoachHelmIntelligence,
  coachHelmIntelligence,

  // Gate functions
  isCoachHelmEnabled,
  isCoachHelmEnabledForCoach,
  isCoachHelmEnabledForPlayer,
  getCoachHelmSettings,
  getTeamCoachHelmSettings,
  enableCoachHelm,
  disableCoachHelm,
  enableTeamCoachHelm,
  disableTeamCoachHelm,
} from './v2';

// ============================================================================
// Types
// ============================================================================

export type {
  // Pattern types
  PatternType,
  PatternTrend,
  PatternCondition,
  PatternOutcome,
  MinedPattern,

  // Causal types
  CausalRelationshipType,
  CausalRelationship,
  CausalEvidence,

  // Prediction types
  PredictionType,
  PerformancePrediction,
  PredictionFactor,
  PredictionContext,
  TrajectoryForecast,
  TailRisk,
  TailRiskProbabilities,

  // Learning types
  UserInteraction,
  LearnedBehavior,
  LearnedPreferences,

  // Reasoning types
  ReasoningStep,
  ReasoningResult,

  // NLG types
  InsightTone,
  ComposedInsight,
  InsightContext,

  // Feature types
  TemporalFeatures,
  SequenceFeatures,
  ContextualFeatures,
  ExtractedFeatures,

  // Orchestrator types
  AnalysisOptions,
  PlayerAnalysis,
  IntelligentRoundReview,

  // Settings types
  CoachHelmSettings,
  CoachHelmStatus,

  // Shot pattern types
  DispersionPattern,
  DistanceRange,
  ShotSituation,
  MissTendency,
  ShotPattern,
  DistanceRangeStats,
  ShotPatternAnalysis,
} from './v2/types';

// ============================================================================
// Insight Types (for backwards compatibility)
// ============================================================================

export {
  type InsightType,
  type InsightPriority,
  type InsightStatus,
  type FocusAreaCategory,
  type FocusAreaStatus,
  type TrendDirection,
  type CoachInsight,
  type PlayerFocusArea,
  type InsightWithPlayer,
  type FocusAreaWithPlayer,
  INSIGHT_TYPE_CONFIGS,
  FOCUS_AREA_CONFIGS,
  getInsightConfig,
  getFocusAreaConfig,
  getPriorityColor,
  getPriorityLabel,
  formatInsightAge,
} from './insight-types';

// ============================================================================
// Coach Philosophy Types
// ============================================================================

export type { CoachPhilosophy } from './types';

// ============================================================================
// Review Types
// ============================================================================

export type { RoundReview } from './review-types';
