import { describe, expect, it } from 'vitest';
import { baseline, baselineWords, bigNumbers, bounceBack, closingThree, holesInPlayOrder, puttsPerGir, type ChPlayHole } from '../stats-extra';

/** 18 holes of par 4, scored as given (null = not scored); putts 2 and greens hit unless overridden. */
const card = (scores: Array<number | null>, over: Partial<ChPlayHole>[] = []): ChPlayHole[] =>
  scores.map((score, i) => ({ n: i + 1, par: 4, score, putts: 2, gir: true, fairway: true, ...over[i] }));

describe('play order', () => {
  it('starts on 10 and wraps; hole order without a start', () => {
    const holes = card(Array(18).fill(4));
    expect(holesInPlayOrder(holes, 10).map((h) => h.n)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(holesInPlayOrder([...holes].reverse(), null).map((h) => h.n).slice(0, 3)).toEqual([1, 2, 3]);
  });
});

describe('the four figures', () => {
  it('bounce-back counts a hole over par followed by a scored hole, made at par or better', () => {
    // Bogey then par (made), double then bogey (missed), bogey on the last hole (never a chance).
    const order = card([5, 4, 6, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5]);
    expect(bounceBack(order)).toEqual({ made: 2, chances: 3 });
    // No bogeys at all: no chances, which the review says as good news.
    expect(bounceBack(card(Array(18).fill(4)))).toEqual({ made: 0, chances: 0 });
  });

  it('putts per green hit reads only greens hit with putts recorded, and needs three', () => {
    const holes = card(Array(18).fill(4), Array(18).fill(null).map((_, i) => (i < 2 ? { gir: true, putts: 1 } : { gir: false })));
    expect(puttsPerGir(holes)).toEqual({ putts: 2, greens: 2, value: null });
    // A 0 putt count is "not recorded", not a holed approach.
    expect(puttsPerGir(card([4, 4, 4, 4], [{ putts: 0 }])).greens).toBe(3);
    expect(puttsPerGir(card([4, 4, 4], [{ putts: 1 }, { putts: 2 }, { putts: 3 }])).value).toBe(2);
  });

  it('closing three is the last three played, and needs all three scored', () => {
    const holes = card([4, 4, 4, 4, 4, 4, 4, 4, 5, 4, 4, 4, 4, 4, 4, 5, 6, 3]);
    expect(closingThree(holesInPlayOrder(holes, null))).toEqual({ holes: [16, 17, 18], toPar: 2 });
    // Started on 10: the round closed on 7, 8 and 9.
    expect(closingThree(holesInPlayOrder(holes, 10))).toEqual({ holes: [7, 8, 9], toPar: 1 });
    expect(closingThree(card([4, null, 4]))).toBeNull();
  });

  it('big numbers are double bogey or worse', () => {
    expect(bigNumbers(card([6, 7, 5, 4, null]))).toBe(2);
  });
});

describe('the usual', () => {
  it('says nothing under five rounds, then each figure past its own floor', () => {
    const r = card([5, 4, 6, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(baselineWords(baseline([r, r, r, r], [null, null, null, null]))).toEqual({ bounce: null, ppg: null, closing: null, big: null });
    const b = baseline([r, r, r, r, r], [null, null, null, null, null]);
    const w = baselineWords(b);
    expect(w.bounce).toBe('Usually 67% · 5 rounds');
    expect(w.ppg).toBe('Usually 2.00 · 5 rounds');
    expect(w.closing).toBe('Usually 0.0 · 5 rounds');
    expect(w.big).toBe('Usually 1.0 a round · 5 rounds');
  });
});
