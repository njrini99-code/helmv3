import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/golf/actions/tournaments-holes', () => ({ saveTournamentHole: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { cardLine, nextHole, scoreName, strokeChoices, type SheetHole } from '../HoleSheet';

const holes = (strokes: Array<number | null>, par = 4): SheetHole[] => strokes.map((s, i) => ({ n: i + 1, par, strokes: s }));

describe('strokeChoices', () => {
  it('runs from two under par to four over, never below one', () => {
    expect(strokeChoices(4)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(strokeChoices(3)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(strokeChoices(5)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('scoreName (words, so the chip never leans on colour)', () => {
  it('names strokes against par', () => {
    expect([2, 3, 4, 5, 6, 7].map((s) => scoreName(s, 4))).toEqual(['Eagle', 'Birdie', 'Par', 'Bogey', 'Double bogey', '3 over par']);
    expect(scoreName(1, 3)).toBe('Hole in one');
    expect(scoreName(2, 5)).toBe('Albatross');
  });
});

describe('nextHole', () => {
  it('moves to the next unscored hole after this one, then wraps to the first unscored', () => {
    expect(nextHole(holes([4, null, 5, null]), 1)).toBe(2);
    expect(nextHole(holes([4, 4, 5, null]), 2)).toBe(4);
    expect(nextHole(holes([null, 4, 4, 4]), 3)).toBe(1);
  });

  it('stays put when every hole is scored, and opens on hole 1 for a fresh card', () => {
    expect(nextHole(holes([4, 4, 4]), 2)).toBe(2);
    expect(nextHole(holes([null, null, null]), 0)).toBe(1);
  });
});

describe('cardLine', () => {
  it('counts the holes scored and the to-par over them', () => {
    expect(cardLine(holes([4, 5, null, 3]))).toEqual({ thru: 3, toPar: 0 });
    expect(cardLine(holes([null, null]))).toEqual({ thru: 0, toPar: null });
  });
});
