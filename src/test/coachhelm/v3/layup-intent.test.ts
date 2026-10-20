import { describe, it, expect } from 'vitest';
import {
  classifyParFiveLongApproach,
  LAYUP_MIN_LEAVE_FEET,
} from '@/lib/coachhelm/v3/metrics/layup-intent';
import { computeDistanceProfile } from '@/lib/coachhelm/v3/metrics/distance-profile';
import { approachFact, holeContext, scope } from './fixtures/distance-profile-fixtures';

const yd = (y: number) => y * 3;

describe('audit row 30 — lay-up intent comes from where the ball was left, not from the miss', () => {
  it('a par-5 miss left 110 yd out is a lay-up', () => {
    expect(classifyParFiveLongApproach({ par: 5, onGreen: false, leaveFeet: yd(110), intent: 'unknown' })).toBe('layup');
  });

  it('a par-5 miss left 20 yd out (greenside) was a go at the green that missed', () => {
    expect(classifyParFiveLongApproach({ par: 5, onGreen: false, leaveFeet: yd(20), intent: 'unknown' })).toBe('attempt');
  });

  it('the cut sits in the trough of the production leave distribution (50 yd)', () => {
    expect(LAYUP_MIN_LEAVE_FEET).toBe(150);
  });

  it('a declared intent wins over the inference', () => {
    expect(classifyParFiveLongApproach({ par: 5, onGreen: false, leaveFeet: yd(20), intent: 'layup' })).toBe('layup');
    expect(classifyParFiveLongApproach({ par: 5, onGreen: false, leaveFeet: yd(110), intent: 'go_for_green' })).toBe('attempt');
  });

  it('an unknown leave on a par-5 miss is unknown intent, not silently a lay-up', () => {
    expect(classifyParFiveLongApproach({ par: 5, onGreen: false, leaveFeet: null, intent: 'unknown' })).toBe('unknown');
  });

  it('green-finders and non-par-5 holes are always attempts', () => {
    expect(classifyParFiveLongApproach({ par: 5, onGreen: true, leaveFeet: 20, intent: 'unknown' })).toBe('attempt');
    expect(classifyParFiveLongApproach({ par: 4, onGreen: false, leaveFeet: yd(110), intent: 'unknown' })).toBe('attempt');
  });

  it('the 175+ band keeps a greenside par-5 miss in the green-hit denominator', () => {
    // Old rule: every par-5 miss was a "lay-up", so this band read 100% (1/1).
    const facts = [
      approachFact({ round_id: 'r1', hole_number: 5, distance_to_hole_before_feet: yd(230), distance_to_hole_after_feet: yd(20), result: 'rough', lie_after: 'rough' }),
      approachFact({ round_id: 'r2', hole_number: 5, distance_to_hole_before_feet: yd(250), distance_to_hole_after_feet: yd(110), result: 'fairway', lie_after: 'fairway' }),
      approachFact({ round_id: 'r3', hole_number: 5, distance_to_hole_before_feet: yd(220), distance_to_hole_after_feet: 30, result: 'green', lie_after: 'green' }),
    ];
    const holes = ['r1', 'r2', 'r3'].map((r) => holeContext({ round_id: r, hole_number: 5, par: 5 }));
    const results = computeDistanceProfile(facts, scope('p'), holes);
    const gh = results.find((m) => m.metricId === 'approach_green_hit_rate' && (m.dimensions as { band: string }).band === '175_plus_ft')!;
    expect(gh.eligibleCount).toBe(2); // greenside miss + green-finder
    expect(gh.value).toBe(50);
    expect(gh.exclusions).toEqual({ layup: 1 });
  });
});
