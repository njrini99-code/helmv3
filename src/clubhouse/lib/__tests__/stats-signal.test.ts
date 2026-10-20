import { describe, expect, it } from 'vitest';
import {
  deltaTone,
  deltaWords,
  diffSe,
  earlyTag,
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
