/**
 * Insight Scorer — Feedback-Driven Insight Scoring
 *
 * Scores insights based on confidence, stroke impact, and historical feedback.
 * Pure functions, no database dependencies.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface InsightFeedback {
  insightType: string;
  wasActedUpon: boolean;
  wasDismissed: boolean;
  wasHelpful: boolean | null;
  coachRating?: number;
}

export interface InsightScore {
  baseScore: number;
  feedbackAdjustment: number;
  finalScore: number;
  shouldShow: boolean;
}

export interface ThresholdAdjustments {
  adjustments: Record<string, number>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MINIMUM_THRESHOLD = 0.3;
const MIN_FEEDBACK_DATA_POINTS = 5;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Scores an insight based on confidence, stroke impact, and historical feedback.
 *
 * - baseScore = (confidence * 0.6) + (min(|strokeImpact| / 3, 1) * 0.4)
 * - feedbackAdjustment is derived from historical feedback for this insightType
 * - finalScore = clamp(base + adjustment, 0, 1)
 */
export function scoreInsight(
  confidence: number,
  strokeImpact: number,
  insightType: string,
  feedbackHistory: InsightFeedback[]
): InsightScore {
  // Base score: weighted combination of confidence and normalized stroke impact
  const normalizedImpact = Math.min(Math.abs(strokeImpact) / 3, 1);
  const baseScore = confidence * 0.6 + normalizedImpact * 0.4;

  // Feedback adjustment for this insight type
  const relevantFeedback = feedbackHistory.filter((f) => f.insightType === insightType);
  const feedbackAdjustment = calculateFeedbackAdjustment(relevantFeedback);

  // Final score clamped to [0, 1]
  const finalScore = clamp(baseScore + feedbackAdjustment, 0, 1);

  return {
    baseScore,
    feedbackAdjustment,
    finalScore,
    shouldShow: finalScore >= DEFAULT_MINIMUM_THRESHOLD,
  };
}

/**
 * Calculates threshold adjustments for each insight type based on feedback.
 * Returns a map of insightType to threshold change in [-0.2, +0.2].
 */
export function calculateThresholdAdjustments(
  feedbackHistory: InsightFeedback[]
): ThresholdAdjustments {
  // Group feedback by insight type
  const byType = new Map<string, InsightFeedback[]>();
  for (const f of feedbackHistory) {
    const list = byType.get(f.insightType) ?? [];
    list.push(f);
    byType.set(f.insightType, list);
  }

  const adjustments: Record<string, number> = {};

  for (const [insightType, feedback] of byType) {
    adjustments[insightType] = calculateFeedbackAdjustment(feedback);
  }

  return { adjustments };
}

/**
 * Determines whether an insight should be shown based on its score and
 * an optional minimum threshold (defaults to 0.3).
 */
export function shouldShowInsight(
  score: InsightScore,
  minimumThreshold = DEFAULT_MINIMUM_THRESHOLD
): boolean {
  return score.finalScore >= minimumThreshold;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function calculateFeedbackAdjustment(feedback: InsightFeedback[]): number {
  if (feedback.length < MIN_FEEDBACK_DATA_POINTS) {
    return 0;
  }

  const actionRate = feedback.filter((f) => f.wasActedUpon).length / feedback.length;
  const dismissRate = feedback.filter((f) => f.wasDismissed).length / feedback.length;

  // High dismiss rate is a strong negative signal — override continuous scaling
  if (dismissRate > 0.7) {
    return -0.2;
  }

  // Continuous adjustment: actionRate centered at 0.5 yields range [-0.2, +0.2]
  const adjustment = (actionRate - 0.5) * 0.4;

  return clamp(adjustment, -0.2, 0.2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
