import { describe, it, expect } from 'vitest';
import {
  backfilledStrokesImpact,
  leveragePriorityFloor,
} from '@/lib/coachhelm/v3/engine/generator-base';
import type { CounterfactualProjection } from '@/lib/coachhelm/v3/counterfactual/types';

// A live (non-suppressed) counterfactual with real leverage — the kind that
// WOULD normally backfill impact and floor priority up to high.
const liveCf: CounterfactualProjection = {
  current_baseline_score: 75,
  projected_score_if_closed: 73.8,
  strokes_saved_per_round: 1.2,
  weeks_to_typical_close: 8,
  suppressed: false,
};

describe('backfilledStrokesImpact exemption', () => {
  it('still backfills a non-exempt actionable metric from the counterfactual', () => {
    expect(backfilledStrokesImpact(0, liveCf, 'scrambling_pct_sand')).toBeCloseTo(1.2);
  });

  it('does NOT backfill an exempt par-scoring metric (keeps the descriptive 0)', () => {
    // The exemption applies to all three par generators, not just par-4.
    expect(backfilledStrokesImpact(0, liveCf, 'scoring_par_3')).toBe(0);
    expect(backfilledStrokesImpact(0, liveCf, 'scoring_par_4')).toBe(0);
    expect(backfilledStrokesImpact(0, liveCf, 'scoring_par_5')).toBe(0);
  });

  it('does NOT backfill the warmup opening-hole metric', () => {
    expect(backfilledStrokesImpact(0, liveCf, 'opening_hole_delta')).toBe(0);
  });
});

describe('leveragePriorityFloor exemption', () => {
  it('still floors a non-exempt metric up from low to high on a 1.2-stroke leak', () => {
    expect(leveragePriorityFloor('low', liveCf, 'scrambling_pct_sand')).toBe('high');
  });

  it('does NOT escalate an exempt par-scoring metric (stays low/descriptive)', () => {
    // The exemption applies to all three par generators, not just par-4.
    expect(leveragePriorityFloor('low', liveCf, 'scoring_par_3')).toBe('low');
    expect(leveragePriorityFloor('low', liveCf, 'scoring_par_4')).toBe('low');
    expect(leveragePriorityFloor('low', liveCf, 'scoring_par_5')).toBe('low');
  });

  it('does NOT escalate the warmup opening-hole metric', () => {
    expect(leveragePriorityFloor('low', liveCf, 'opening_hole_delta')).toBe('low');
  });
});
