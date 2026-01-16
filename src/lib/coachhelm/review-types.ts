/**
 * Round Review System V3 Types
 *
 * Comprehensive types for the coach-player review workflow with
 * feedback loop for continuous improvement.
 */

// ============================================================================
// INSIGHT TYPES
// ============================================================================

export type InsightType =
  | 'stat_insight'        // Pure statistical observation
  | 'pattern_insight'     // Pattern detected across rounds
  | 'improvement_insight' // Specific improvement suggestion
  | 'comparison_insight'  // Comparison to avg/team/previous
  | 'highlight'           // Positive moment
  | 'area_to_review';     // Needs work

export type InsightSeverity = 'low' | 'medium' | 'high' | 'critical';

export type InsightAccuracy = 'accurate' | 'partially_accurate' | 'inaccurate';

export type ComparisonType = 'vs_average' | 'vs_team' | 'vs_previous' | 'vs_goal';

// ============================================================================
// REVIEW STATUS
// ============================================================================

export type ReviewStatus = 'draft' | 'published' | 'archived';

export type ReviewEventType =
  | 'review_generated'
  | 'review_regenerated'
  | 'coach_viewed'
  | 'coach_annotated'
  | 'coach_published'
  | 'player_viewed'
  | 'player_acknowledged'
  | 'focus_area_created'
  | 'focus_area_completed'
  | 'insight_feedback_given';

// ============================================================================
// REVIEW INSIGHT
// ============================================================================

export interface ReviewInsight {
  id: string;
  reviewId: string;
  roundId: string;
  playerId: string;

  // Classification
  insightType: InsightType;
  title: string;
  description: string;
  severity: InsightSeverity;

  // Supporting data
  metricName: string | null;
  metricValue: number | null;
  metricBaseline: number | null;
  metricComparison: ComparisonType | null;
  holeNumbers: number[];
  evidence: string[];

  // Coach feedback
  coachAccuracy: InsightAccuracy | null;
  coachAccuracyAt: string | null;
  coachNotes: string | null;
  isHighlighted: boolean;
  isHidden: boolean;

  // Focus area link
  createdFocusAreaId: string | null;

  // Display
  confidence: number;
  displayOrder: number;

  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// ENHANCED ROUND REVIEW
// ============================================================================

export interface EnhancedRoundReview {
  id: string;
  roundId: string;
  playerId: string;

  // Status workflow
  status: ReviewStatus;
  publishedAt: string | null;
  publishedBy: string | null;

  // Round performance data
  roundScore: number;
  roundScoreToPar: number;
  scoringAvgBefore: number | null;
  scoringAvgAfter: number | null;

  // Position context
  qualifyingPositionBefore: number | null;
  qualifyingPositionAfter: number | null;
  gapToNextPosition: number | null;

  // Summary content
  summary: string;
  primaryTakeaway: string;
  nextPracticePriority: string | null;

  // Structured insights (from golf_review_insights table)
  insights: ReviewInsight[];

  // Coach interaction
  coachRating: number | null;
  coachFeedbackText: string | null;
  coachNotes: string | null;
  coachViewedAt: string | null;

  // Player interaction
  playerViewedAt: string | null;
  playerAcknowledgedAt: string | null;

  // Action items derived from insights
  actionItems: ActionItem[];

  // Linked focus areas
  linkedFocusAreaId: string | null;

  // Metadata
  version: number;
  generationMethod: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// ACTION ITEMS
// ============================================================================

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  category: 'practice' | 'mental' | 'technique' | 'fitness' | 'other';
  fromInsightId: string | null;
  completed: boolean;
  completedAt: string | null;
}

// ============================================================================
// INSIGHT FEEDBACK
// ============================================================================

export interface InsightFeedback {
  id: string;
  insightId: string;
  reviewId: string;
  coachId: string;

  accuracy: InsightAccuracy;
  feedbackText: string | null;

  // Context for learning
  insightType: InsightType;
  metricName: string | null;
  predictedValue: number | null;
  actualAssessment: string | null;

  // Learning signals
  wasOverconfident: boolean;
  wasUnderconfident: boolean;
  errorCategory: string | null;

  createdAt: string;
}

// ============================================================================
// REVIEW EVENT (Timeline)
// ============================================================================

export interface ReviewEvent {
  id: string;
  reviewId: string;
  playerId: string;
  actorId: string | null;

  eventType: ReviewEventType;
  eventData: Record<string, unknown>;
  notes: string | null;

  createdAt: string;
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

export interface InsightGenerationContext {
  roundId: string;
  playerId: string;
  teamId: string | null;
  coachId: string | null;

  // Round data
  roundScore: number;
  scoreToPar: number;
  holes: HoleData[];

  // Comparison data
  playerAverages: StatAverages | null;
  teamAverages: StatAverages | null;
  previousRounds: PreviousRoundSummary[];

  // Coach preferences (weights)
  insightWeights: InsightWeight[];
}

export interface HoleData {
  holeNumber: number;
  par: number;
  score: number | null;
  putts: number | null;
  fairwayHit: boolean | null;
  gir: boolean | null;
  upAndDown: boolean | null;
  sandSave: boolean | null;
  penaltyStrokes: number;
}

export interface StatAverages {
  totalScore: number;
  scoreToPar: number;
  fairwayPct: number;
  girPct: number;
  puttsPerRound: number;
  puttsPerGir: number;
  scramblePct: number;
  sandSavePct: number;
  threePuttPct: number;
  birdiesPerRound: number;
  bogeysPerRound: number;
}

export interface PreviousRoundSummary {
  roundId: string;
  roundDate: string;
  courseName: string;
  totalScore: number;
  scoreToPar: number;
}

export interface InsightWeight {
  insightType: InsightType;
  metricName: string | null;
  baseWeight: number;
  coachAdjustment: number;
  accuracyRate: number;
  thresholdMultiplier: number;
}

// ============================================================================
// GENERATED INSIGHT (before saving)
// ============================================================================

export interface GeneratedInsight {
  insightType: InsightType;
  title: string;
  description: string;
  severity: InsightSeverity;

  metricName: string | null;
  metricValue: number | null;
  metricBaseline: number | null;
  metricComparison: ComparisonType | null;
  holeNumbers: number[];
  evidence: string[];

  confidence: number;
  displayOrder: number;
}

// ============================================================================
// FOCUS AREA CREATION FROM REVIEW
// ============================================================================

export interface CreateFocusAreaFromReviewInput {
  reviewId: string;
  insightId: string | null;
  playerId: string;
  coachId: string;

  title: string;
  description: string | null;
  areaType: string;
  targetMetric: string | null;
  currentValue: number | null;
  targetValue: number | null;

  reviewContext: string | null;
}

// ============================================================================
// COACH ANNOTATION INPUT
// ============================================================================

export interface AnnotateInsightInput {
  insightId: string;
  coachId: string;

  accuracy?: InsightAccuracy;
  notes?: string;
  isHighlighted?: boolean;
  isHidden?: boolean;
}

export interface AnnotateReviewInput {
  reviewId: string;
  coachId: string;

  rating?: number;
  feedbackText?: string;
  notes?: string;
  actionItems?: ActionItem[];
}

// ============================================================================
// PUBLISH REVIEW INPUT
// ============================================================================

export interface PublishReviewInput {
  reviewId: string;
  coachId: string;

  // Optional final touches before publish
  finalNotes?: string;
  highlightedInsightIds?: string[];
  hiddenInsightIds?: string[];
}

// ============================================================================
// REVIEW STATS (for dashboard)
// ============================================================================

export interface PlayerReviewStats {
  playerId: string;
  totalReviews: number;
  publishedReviews: number;
  unviewedReviews: number;
  averageCoachRating: number | null;
  focusAreasCreated: number;
  focusAreasCompleted: number;
  lastReviewDate: string | null;
}

export interface CoachReviewStats {
  coachId: string;
  totalReviewsGenerated: number;
  totalReviewsPublished: number;
  pendingReviews: number; // Draft status
  insightsFeedbackGiven: number;
  averageAccuracyRate: number | null;
  focusAreasCreated: number;
}

// ============================================================================
// INSIGHT THRESHOLDS
// ============================================================================

export const DEFAULT_INSIGHT_THRESHOLDS = {
  // Stat comparisons (percentage difference to trigger insight)
  scoringDeviation: 3, // Strokes from average
  fairwayDeviation: 15, // Percentage points
  girDeviation: 15,
  puttingDeviation: 0.3, // Putts per hole
  scrambleDeviation: 20,

  // Pattern detection
  minRoundsForPattern: 3,
  patternConfidenceThreshold: 0.65,

  // Comparison thresholds
  significantDifference: 0.1, // 10% difference to mention

  // Severity thresholds
  highSeverityDeviation: 2.0, // Standard deviations
  criticalSeverityDeviation: 3.0,
} as const;

// ============================================================================
// INSIGHT DISPLAY CONFIG
// ============================================================================

export const INSIGHT_TYPE_CONFIG: Record<InsightType, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}> = {
  stat_insight: {
    label: 'Stat Insight',
    icon: '📊',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  pattern_insight: {
    label: 'Pattern',
    icon: '🔄',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  improvement_insight: {
    label: 'Improvement',
    icon: '📈',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  comparison_insight: {
    label: 'Comparison',
    icon: '⚖️',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  highlight: {
    label: 'Highlight',
    icon: '✨',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  area_to_review: {
    label: 'Area to Review',
    icon: '🎯',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
};

export const SEVERITY_CONFIG: Record<InsightSeverity, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  low: {
    label: 'Low',
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
  },
  medium: {
    label: 'Medium',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  high: {
    label: 'High',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  critical: {
    label: 'Critical',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
};

export const ACCURACY_CONFIG: Record<InsightAccuracy, {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}> = {
  accurate: {
    label: 'Accurate',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: '✓',
  },
  partially_accurate: {
    label: 'Partially Accurate',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    icon: '~',
  },
  inaccurate: {
    label: 'Inaccurate',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    icon: '✗',
  },
};
