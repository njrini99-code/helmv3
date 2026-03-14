/**
 * Outcome Tracker — Prediction Outcome Validation
 *
 * Validates predictions against actual outcomes and derives adjustments
 * for future predictions. Pure functions, no database dependencies.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationResult {
  predictionId: string;
  playerId: string;
  predictedValue: number;
  actualValue: number;
  error: number;
  errorPct: number;
  withinInterval: boolean;
  direction: 'overestimate' | 'underestimate' | 'accurate';
}

export interface PredictionAccuracyMetrics {
  totalValidated: number;
  meanAbsoluteError: number;
  withinIntervalRate: number;
  overestimateRate: number;
  underestimateRate: number;
  accurateRate: number;
}

export interface PredictionAdjustments {
  biasCorrection: number;
  confidenceMultiplier: number;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Validates a single prediction against an actual outcome.
 *
 * - error = |predicted - actual|
 * - direction: accurate if error < 0.5, overestimate if predicted > actual + 0.5,
 *   otherwise underestimate
 * - withinInterval: actual is between predicted low and high (inclusive)
 */
export function validatePrediction(
  predicted: { value: number; low: number; high: number },
  actual: number,
  predictionId = '',
  playerId = ''
): ValidationResult {
  const error = Math.abs(predicted.value - actual);
  const errorPct = actual !== 0 ? (error / Math.abs(actual)) * 100 : 0;
  const withinInterval = actual >= predicted.low && actual <= predicted.high;

  let direction: ValidationResult['direction'];
  if (error < 0.5) {
    direction = 'accurate';
  } else if (predicted.value > actual + 0.5) {
    direction = 'overestimate';
  } else {
    direction = 'underestimate';
  }

  return {
    predictionId,
    playerId,
    predictedValue: predicted.value,
    actualValue: actual,
    error,
    errorPct,
    withinInterval,
    direction,
  };
}

/**
 * Calculates aggregate accuracy metrics from a set of validation results.
 */
export function calculateAccuracyMetrics(
  validations: ValidationResult[]
): PredictionAccuracyMetrics {
  if (validations.length === 0) {
    return {
      totalValidated: 0,
      meanAbsoluteError: 0,
      withinIntervalRate: 0,
      overestimateRate: 0,
      underestimateRate: 0,
      accurateRate: 0,
    };
  }

  const n = validations.length;
  const totalError = validations.reduce((sum, v) => sum + v.error, 0);
  const withinCount = validations.filter((v) => v.withinInterval).length;
  const overCount = validations.filter((v) => v.direction === 'overestimate').length;
  const underCount = validations.filter((v) => v.direction === 'underestimate').length;
  const accurateCount = validations.filter((v) => v.direction === 'accurate').length;

  return {
    totalValidated: n,
    meanAbsoluteError: totalError / n,
    withinIntervalRate: withinCount / n,
    overestimateRate: overCount / n,
    underestimateRate: underCount / n,
    accurateRate: accurateCount / n,
  };
}

/**
 * Calculates adjustments for future predictions based on historical validations.
 *
 * - biasCorrection: mean of (predicted - actual). Positive means consistently
 *   overestimating; subtract from future predictions.
 * - confidenceMultiplier: if withinIntervalRate < 0.7 widen intervals (1.2),
 *   if > 0.95 tighten (0.8), otherwise no change (1.0).
 */
export function calculateAdjustments(
  validations: ValidationResult[]
): PredictionAdjustments {
  if (validations.length === 0) {
    return { biasCorrection: 0, confidenceMultiplier: 1.0 };
  }

  // Bias correction: mean signed error
  const signedErrors = validations.map((v) => v.predictedValue - v.actualValue);
  const biasCorrection = signedErrors.reduce((sum, e) => sum + e, 0) / validations.length;

  // Confidence multiplier based on interval coverage
  const withinCount = validations.filter((v) => v.withinInterval).length;
  const withinRate = withinCount / validations.length;

  let confidenceMultiplier: number;
  if (withinRate < 0.7) {
    confidenceMultiplier = 1.2;
  } else if (withinRate > 0.95) {
    confidenceMultiplier = 0.8;
  } else {
    confidenceMultiplier = 1.0;
  }

  return { biasCorrection, confidenceMultiplier };
}
