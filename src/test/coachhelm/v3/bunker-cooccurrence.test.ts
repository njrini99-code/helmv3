import { describe, it, expect } from 'vitest';
import bunker, {
  coOccurrenceShare,
  clampRecoveryLeaveFt,
} from '@/lib/coachhelm/v3/composite/rules/bunker-miss-side-amplifier';
import type { CompositeMatch } from '@/lib/coachhelm/v3/composite/types';

describe('coOccurrenceShare', () => {
  it('is the Jaccard overlap of the two leak hole-sets', () => {
    expect(coOccurrenceShare([1, 2, 3], [2, 3, 4])).toBeCloseTo(2 / 4, 5);
  });
  it('is 0 when the leaks never share a hole', () => {
    expect(coOccurrenceShare([1, 2], [3, 4])).toBe(0);
  });
  it('is 0 when either set is empty (no co-occurrence to claim)', () => {
    expect(coOccurrenceShare([], [1])).toBe(0);
    expect(coOccurrenceShare([1], [])).toBe(0);
  });
});

describe('clampRecoveryLeaveFt — Grace 129 ft outlier', () => {
  it('drops a leave above the 75 ft greenside ceiling (returns null)', () => {
    expect(clampRecoveryLeaveFt(129)).toBeNull();
    expect(clampRecoveryLeaveFt(513)).toBeNull();
  });
  it('keeps a plausible greenside leave', () => {
    expect(clampRecoveryLeaveFt(22)).toBe(22);
    expect(clampRecoveryLeaveFt(75)).toBe(75);
  });
});

describe('bunker prose only asserts "same holes" when co-occurrence is proven', () => {
  function match(share: number): CompositeMatch {
    return { source_insight_ids: ['s', 'b'], signals: { sand_save_pct: 35, bias_direction: 'left', same_hole_share: share } };
  }
  it('uses the compounding/same-holes wording when share >= 0.3', () => {
    const c = bunker.compose(match(0.5));
    expect(c.content.toLowerCase()).toContain('same holes');
    expect(c.title.toLowerCase()).toContain('compounding');
  });
  it('softens to "two separate leaks" when co-occurrence is unproven (share < 0.3)', () => {
    const c = bunker.compose(match(0));
    expect(c.content.toLowerCase()).not.toContain('same holes');
    expect(c.content.toLowerCase()).toContain('two separate');
    expect(c.title.toLowerCase()).not.toContain('compounding');
  });
});
