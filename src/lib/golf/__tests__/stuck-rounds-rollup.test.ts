import { describe, it, expect } from 'vitest';
import { shouldRollupStuckRounds, formatStuckRollupLabel } from '../stuck-rounds-rollup';

describe('shouldRollupStuckRounds', () => {
  it('does not roll up 0-3 stuck rounds', () => {
    expect(shouldRollupStuckRounds(0)).toBe(false);
    expect(shouldRollupStuckRounds(1)).toBe(false);
    expect(shouldRollupStuckRounds(3)).toBe(false);
  });

  it('rolls up more than 3 stuck rounds into one summary row', () => {
    expect(shouldRollupStuckRounds(4)).toBe(true);
    // The reported scenario had 10 platform-wide — even if every one of
    // them were genuinely stuck (not just abandoned), no surface should
    // stack 10 individual rows/cards.
    expect(shouldRollupStuckRounds(10)).toBe(true);
  });
});

describe('formatStuckRollupLabel', () => {
  it('names the count and points at the Tracer tab', () => {
    expect(formatStuckRollupLabel(10)).toBe('10 rounds idle — view in Tracer');
  });
});
