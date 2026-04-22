import { describe, it, expect } from 'vitest';
import { detectHoled } from '@/lib/coachhelm/v2/shot-analysis/shot-level-sg';

describe('detectHoled (Task B15)', () => {
  it('null / undefined distanceAfter does NOT count as holed', () => {
    expect(detectHoled({ distanceAfter: null, lieAfter: 'green', result: 'on_green' })).toBe(false);
    expect(detectHoled({ distanceAfter: undefined, lieAfter: 'green', result: 'on_green' })).toBe(false);
  });

  it('result="hole" counts as holed regardless of distance', () => {
    expect(detectHoled({ distanceAfter: 0, lieAfter: 'hole', result: 'hole' })).toBe(true);
    expect(detectHoled({ distanceAfter: 5, lieAfter: 'green', result: 'hole' })).toBe(true);
  });

  it('lieAfter="hole" counts as holed', () => {
    expect(detectHoled({ distanceAfter: 0, lieAfter: 'hole', result: 'made' })).toBe(true);
  });

  it('distanceAfter=0 with ordinary lie/result is not a guaranteed holed signal', () => {
    // Distance == 0 is ambiguous: could be a tap-in still on the green that
    // was logged as 0 for approximation. Require an explicit lie/result signal.
    expect(detectHoled({ distanceAfter: 0, lieAfter: 'green', result: 'other' })).toBe(false);
  });

  it('ordinary in-play shots are not holed', () => {
    expect(detectHoled({ distanceAfter: 120, lieAfter: 'fairway', result: 'on_fairway' })).toBe(false);
  });
});
