// Wrapper class for backward compatibility — delegates to feedback module functions
import {
  validatePrediction as validateFn,
  calculateAccuracyMetrics as accuracyFn,
  calculateAdjustments as adjustmentsFn,
  type ValidationResult,
  type PredictionAccuracyMetrics,
  type PredictionAdjustments,
} from '../feedback/outcome-tracker';

export { validateFn as validatePrediction, accuracyFn as calculateAccuracyMetrics, adjustmentsFn as calculateAdjustments };
export type { ValidationResult, PredictionAccuracyMetrics, PredictionAdjustments };

/**
 * Backward-compatible class wrapper used by the orchestrator.
 * Delegates all logic to the functional feedback/outcome-tracker module.
 */
export class OutcomeValidator {
  private validations: ValidationResult[] = [];

  validate(predicted: { value: number; low: number; high: number }, actual: number): ValidationResult {
    const result = validateFn(predicted, actual);
    this.validations.push(result);
    return result;
  }

  getAccuracyMetrics(): PredictionAccuracyMetrics {
    return accuracyFn(this.validations);
  }

  getAdjustments(): PredictionAdjustments {
    return adjustmentsFn(this.validations);
  }

  getValidations(): ValidationResult[] {
    return this.validations;
  }
}
