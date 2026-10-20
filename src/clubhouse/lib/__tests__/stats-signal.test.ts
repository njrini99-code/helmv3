import { describe, expect, it } from 'vitest';
import {
  changeSe,
  deltaTone,
  deltaWords,
  diffSe,
  earlyTag,
  halvesChange,
  meanSe,
  needsText,
  POOLED_SD,
  rankWithTies,
  rollingMean,
  sampleSd,
  sampleState,
  spreadFor,
  standardError,
  wilson,
} from '../stats-signal';

describe('floors', () => {
  it('say none under the show floor, early up to the early floor, steady from it', () => {
    expect([2, 3, 7, 8].map((n) => sampleState('sgLong', n))).toEqual(['none', 'early', 'early', 'steady']);
    expect([4, 5, 14, 15].map((n) => sampleState('sgShort', n))).toEqual(['none', 'early', 'early', 'steady']);
    expect([9, 10, 29, 30].map((n) => sampleState('make', n))).toEqual(['none', 'early', 'early', 'steady']);
    expect(sampleState('score', 1)).toBe('early');
    expect(sampleState('score', null)).toBe('none');
    // A share of holes (the scoring mix): any hole shows, under 30 is an early read.
    expect([0, 1, 29, 30].map((n) => sampleState('holes', n))).toEqual(['none', 'early', 'early', 'steady']);
  });

  it('say what is missing in the stat’s own unit, singular and plural', () => {
    expect(needsText('score')).toBe('Needs 1 round');
    expect(needsText('sgShort')).toBe('Needs 5 rounds');
    expect(needsText('make')).toBe('Needs 10 putts');
    expect(needsText('proximity')).toBe('Needs 8 shots');
    expect(needsText('scramble')).toBe('Needs 10 chances');
    expect(earlyTag(6)).toBe('Early read · 6 rounds');
    expect(earlyTag(1)).toBe('Early read · 1 round');
    // A weighted count (a nine-hole round is half) rounds to whole rounds.
    expect(earlyTag(9.5)).toBe('Early read · 10 rounds');
    // In the stat's own unit when it is not rounds.
    expect(earlyTag(24, 'hole')).toBe('Early read · 24 holes');
    expect(earlyTag(1, 'hole')).toBe('Early read · 1 hole');
    expect(needsText('holes')).toBe('Needs 1 hole');
  });
});

describe('spread and standard error', () => {
  it('uses the pooled spread until a player has five rounds of their own', () => {
    expect(spreadFor([1, 2, 3, 4], 'sg')).toBe(POOLED_SD.sg);
    expect(spreadFor([1, 2, 3, 4], 'score')).toBe(POOLED_SD.score);
    expect(spreadFor([0, 2, 4, 6, 8], 'sg')).toBeCloseTo(sampleSd([0, 2, 4, 6, 8])!, 10);
  });

  it('does not read five identical values as certainty', () => {
    expect(spreadFor([1, 1, 1, 1, 1], 'sg')).toBe(POOLED_SD.sg);
  });

  it('has no spread under two values and no standard error without one', () => {
    expect(sampleSd([3])).toBeNull();
    expect(standardError(null, 5)).toBeNull();
    expect(standardError(3.8, 0)).toBeNull();
    expect(standardError(3.8, 4)).toBeCloseTo(1.9, 10);
  });

  it('combines two standard errors as independent', () => {
    expect(diffSe(3, 4)).toBe(5);
    expect(diffSe(3, null)).toBeNull();
  });
});

describe('the standard error of a window and of a change', () => {
  it('reads a score or strokes gained window on the pooled spread under five rounds, the own one from five', () => {
    expect(meanSe([70, 72, 74], 'score')).toBeCloseTo(POOLED_SD.score / Math.sqrt(3), 10);
    expect(meanSe([0, 2, 4, 6, 8], 'sg')).toBeCloseTo(sampleSd([0, 2, 4, 6, 8])! / Math.sqrt(5), 10);
    // Whole rounds: two nine-hole rounds and one eighteen are two rounds.
    expect(meanSe([1, 2, 3], 'sg', 2)).toBeCloseTo(POOLED_SD.sg / Math.sqrt(2), 10);
    expect(meanSe([], 'sg')).toBeNull();
  });

  it('has none for a figure with no pooled spread until five rounds can measure one', () => {
    expect(meanSe([30, 32, 31, 29], null)).toBeNull();
    expect(meanSe([30, 32, 31, 29, 33], null)).toBeCloseTo(sampleSd([30, 32, 31, 29, 33])! / Math.sqrt(5), 10);
    expect(meanSe([30, 30, 30, 30, 30], null)).toBeNull();
  });

  it('combines the two windows, and has none when either is unmeasured', () => {
    expect(changeSe([70, 72, 74], [71, 73], 'score')).toBeCloseTo(Math.sqrt(POOLED_SD.score ** 2 / 3 + POOLED_SD.score ** 2 / 2), 10);
    expect(changeSe([30, 31, 32, 33, 34], [30, 31], null)).toBeNull();
  });

  it('splits a run of scores into halves as the form line does, the middle one of an odd run in neither', () => {
    const h = halvesChange([76, 74, 75, 72, 71])!;
    expect(h.delta).toBeCloseTo((72 + 71) / 2 - (76 + 74) / 2, 10);
    expect(h.se).toBeCloseTo(Math.sqrt(2 * (POOLED_SD.score ** 2 / 2)), 10);
    expect(halvesChange([74, 72])).toBeNull();
  });
});

describe('deltaTone', () => {
  it('paints a change only when it clears one standard error', () => {
    expect(deltaTone(0.5, 1, false)).toBe('');
    expect(deltaTone(1, 1, false)).toBe('is-gain');
    expect(deltaTone(-1.4, 1, false)).toBe('is-loss');
  });

  it('flips for a stat where lower is better', () => {
    expect(deltaTone(-2, 1, true)).toBe('is-gain');
    expect(deltaTone(2, 1, true)).toBe('is-loss');
  });

  it('never paints a change it cannot measure', () => {
    expect(deltaTone(5, null, false)).toBe('');
    expect(deltaTone(null, 1, false)).toBe('');
    expect(deltaTone(5, 0, false)).toBe('');
  });

  it('words a change no stronger than its tone', () => {
    expect(deltaWords(0.3, '', 'vs previous 10')).toBe('No clear change vs previous 10');
    expect(deltaWords(1.5, 'is-gain', 'vs previous 10')).toBe('Better than previous 10');
    expect(deltaWords(-1.5, 'is-loss', 'vs previous 10')).toBe('Worse than previous 10');
    expect(deltaWords(null, '', 'vs previous 10')).toBe('');
  });
});

describe('wilson', () => {
  it('has no interval without attempts', () => {
    expect(wilson(0, 0)).toBeNull();
  });

  it('stays inside 0 to 1 at the ends, where the plain interval does not', () => {
    const none = wilson(0, 10)!;
    expect(none.lo).toBe(0);
    expect(none.hi).toBeGreaterThan(0.2);
    const all = wilson(10, 10)!;
    expect(all.hi).toBe(1);
    expect(all.lo).toBeLessThan(0.8);
  });

  it('matches a known value: 20 of 50 putts, 95%', () => {
    const w = wilson(20, 50)!;
    expect(w.lo).toBeCloseTo(0.2761, 3);
    expect(w.hi).toBeCloseTo(0.5385, 3);
  });

  it('narrows as attempts grow', () => {
    const a = wilson(10, 20)!;
    const b = wilson(100, 200)!;
    expect(b.hi - b.lo).toBeLessThan(a.hi - a.lo);
  });
});

describe('rollingMean', () => {
  it('starts at the third value and trails five', () => {
    const out = rollingMean([1, 2, 3, 4, 5, 6, 7]);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBe(2);
    expect(out[4]).toBe(3);
    // The window slides: rounds 3 to 7.
    expect(out[6]).toBe(5);
  });

  it('leaves a gap where the window has too few real values', () => {
    const out = rollingMean([1, null, null, 4, 5], 5, 3);
    expect(out[2]).toBeNull();
    expect(out[4]).toBeCloseTo((1 + 4 + 5) / 3, 10);
  });
});

describe('rankWithTies', () => {
  it('orders by value and ties neighbors inside one standard error of their difference', () => {
    const ranked = rankWithTies([
      { id: 'a', value: 1.0, se: 0.5 },
      { id: 'b', value: 0.8, se: 0.5 },
      { id: 'c', value: -2, se: 0.5 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(ranked.map((r) => r.tied)).toEqual([true, true, false]);
  });

  it('ties only players the head of the run cannot be told apart from, so a chain of neighbors does not stretch a tie', () => {
    const ranked = rankWithTies([
      { id: 'a', value: 5, se: 1 },
      { id: 'b', value: 4, se: 1 },
      { id: 'c', value: 3, se: 1 },
      { id: 'd', value: 2, se: 1 },
    ]);
    // Each gap (1) is under the difference's standard error (1.41), but a and c (2 apart) are not.
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3, 3]);
    expect(ranked.map((r) => r.tied)).toEqual([true, true, true, true]);
  });

  it('never ties a player with no standard error, and ranks lower-is-better ascending', () => {
    const ranked = rankWithTies(
      [
        { id: 'a', value: 70, se: null },
        { id: 'b', value: 70.1, se: 1 },
      ],
      true,
    );
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });
});
