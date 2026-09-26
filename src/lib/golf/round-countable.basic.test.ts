import { describe, expect, it } from 'vitest';
import { isCountableRound } from './round-countable';

const base = { holes_played: 18, front_nine: 36, back_nine: 36, total_putts: 30, total_score: 72 };

describe('isCountableRound', () => {
  it('counts a complete, plausible 18-hole round', () => {
    expect(isCountableRound(base)).toBe(true);
  });

  it('drops a partial round logged as 18 holes (37 strokes)', () => {
    expect(isCountableRound({ ...base, total_score: 37, front_nine: 37, back_nine: null })).toBe(false);
  });
});
