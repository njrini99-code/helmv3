import { describe, expect, it } from 'vitest';
import { scoreChangeChip } from '../shs-figures';

/**
 * W27 (owner's preview, 11 Nov 2026): the same team change read "−0.8 No clear change vs previous 10" on Home and "↓ 0.8 lower than
 * the 10 before" on Stats. One rule: an arrow and "lower than" only once the change clears its standard error.
 */
const words = { than: 'than the 10 before', vs: 'vs previous 10' };

describe('scoreChangeChip', () => {
  it('under its standard error: the signed number, no arrow, "No clear change"', () => {
    const c = scoreChangeChip(-0.8, 1.0, true, words);
    expect(c.tone).toBe('flat');
    expect(c.direction).toBe('flat');
    expect(c.chip).toMatch(/^[−-]0\.8$/);
    expect(c.words).toBe('No clear change vs previous 10');
  });

  it('past its standard error: the arrow, "lower", and the gain tone for a lower score', () => {
    const c = scoreChangeChip(-0.8, 0.5, true, words);
    expect(c).toEqual({ chip: '0.8 lower', tone: 'gain', direction: 'down', words: 'than the 10 before' });
  });

  it('a clear rise in score is a loss, told "higher"', () => {
    const c = scoreChangeChip(1.2, 0.5, true, words);
    expect(c).toEqual({ chip: '1.2 higher', tone: 'loss', direction: 'up', words: 'than the 10 before' });
  });

  it('with no standard error the change is never painted', () => {
    expect(scoreChangeChip(-3, null, true, words).tone).toBe('flat');
  });
});
