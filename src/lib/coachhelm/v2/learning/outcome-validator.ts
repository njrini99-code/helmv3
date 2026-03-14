/**
 * Outcome Validator — Backward-compatible class wrapper.
 *
 * Self-contained implementation that matches the functional feedback module
 * but avoids circular dependency issues with the barrel export.
 */

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

export function validatePrediction(
  predicted: { value: number; low: number; high: number },
  actual: number,
): ValidationResult {
  const error = Math.abs(predicted.value - actual);
  const errorPct = actual !== 0 ? (error / Math.abs(actual)) * 100 : 0;
  const withinInterval = actual >= predicted.low && actual <= predicted.high;
  let direction: ValidationResult['direction'] = 'accurate';
  if (error >= 0.5) {
    direction = predicted.value > actual ? 'overestimate' : 'underestimate';
  }
  return {
    predictionId: '',
    playerId: '',
    predictedValue: predicted.value,
    actualValue: actual,
    error,
    errorPct,
    withinInterval,
    direction,
  };
}

export function calculateAccuracyMetrics(
  validations: ValidationResult[],
): PredictionAccuracyMetrics {
  if (validations.length === 0) {
    return { totalValidated: 0, meanAbsoluteError: 0, withinIntervalRate: 0, overestimateRate: 0, underestimateRate: 0, accurateRate: 0 };
  }
  const total = validations.length;
  const mae = validations.reduce((s, v) => s + v.error, 0) / total;
  const within = validations.filter((v) => v.withinInterval).length / total;
  const over = validations.filter((v) => v.direction === 'overestimate').length / total;
  const under = validations.filter((v) => v.direction === 'underestimate').length / total;
  const accurate = validations.filter((v) => v.direction === 'accurate').length / total;
  return { totalValidated: total, meanAbsoluteError: mae, withinIntervalRate: within, overestimateRate: over, underestimateRate: under, accurateRate: accurate };
}

export function calculateAdjustments(
  validations: ValidationResult[],
): PredictionAdjustments {
  if (validations.length < 3) {
    return { biasCorrection: 0, confidenceMultiplier: 1.0 };
  }
  const bias = validations.reduce((s, v) => s + (v.predictedValue - v.actualValue), 0) / validations.length;
  const withinRate = validations.filter((v) => v.withinInterval).length / validations.length;
  let multiplier = 1.0;
  if (withinRate < 0.7) multiplier = 1.2;
  else if (withinRate > 0.95) multiplier = 0.8;
  return { biasCorrection: bias, confidenceMultiplier: multiplier };
}

/**
 * Backward-compatible class used by the orchestrator via `new OutcomeValidator()`.
 */
export class OutcomeValidator {
  private validations: ValidationResult[] = [];

  validate(predicted: { value: number; low: number; high: number }, actual: number): ValidationResult {
    const result = validatePrediction(predicted, actual);
    this.validations.push(result);
    return result;
  }

  getAccuracyMetrics(): PredictionAccuracyMetrics {
    return calculateAccuracyMetrics(this.validations);
  }

  getAdjustments(): PredictionAdjustments {
    return calculateAdjustments(this.validations);
  }

  getValidations(): ValidationResult[] {
    return this.validations;
  }
}
