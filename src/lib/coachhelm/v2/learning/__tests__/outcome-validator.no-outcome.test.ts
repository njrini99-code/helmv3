import { describe, expect, it } from 'vitest';
import {
  isPastNoOutcomeGrace,
  NO_OUTCOME_CATEGORY,
  RETIRED_PREDICTION_CATEGORIES,
} from '../outcome-validator';
import { isGradedPrediction } from '@/lib/coachhelm/v2/analytics/prediction-performance-writer';

describe('no-outcome retirement (audit row 57)', () => {
  it('waits the full grace period past the due date', () => {
    expect(isPastNoOutcomeGrace('2026-07-06', '2026-09-28')).toBe(true); // 84 days
    expect(isPastNoOutcomeGrace('2026-08-15', '2026-09-28')).toBe(false); // 44 days
    expect(isPastNoOutcomeGrace('bad', '2026-09-28')).toBe(false);
  });

  it('never counts a retired no-outcome row as graded', () => {
    expect(RETIRED_PREDICTION_CATEGORIES.has(NO_OUTCOME_CATEGORY)).toBe(true);
    expect(
      isGradedPrediction({ validated_at: '2026-09-28', actual_value: null, error_category: NO_OUTCOME_CATEGORY }),
    ).toBe(false);
  });
});
