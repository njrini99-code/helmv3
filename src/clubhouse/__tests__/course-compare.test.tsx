// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChCompareCard } from '../data/compare-rounds';
import type { ChLibraryRound } from '../data/rounds-shape';
import { RoundsHere } from '../screens/rounds/RoundsHere';

afterEach(cleanup);

const lib = (id: string, date: string, score: number, holes = 18): ChLibraryRound => ({ id, date, course: 'Finley', tee: 'Blue tees', teeColor: null, type: null, holes, score, toPar: score - 72, out: null, inn: null, fairways: null, greens: null, putts: null, countable: true });
const card = (id: string, date: string, score: number): ChCompareCard => ({ id, date, score, scores: Array.from({ length: 18 }, (_, i) => (i === 12 ? 4 + score - 72 : 4)), pars: Array(18).fill(4) });

describe('compare two rounds at a course (P-7 4.2.7)', () => {
  const rounds = [lib('a', '2026-10-03', 76), lib('b', '2026-03-14', 70), lib('c', '2026-02-01', 38, 9)];
  const cards = { a: card('a', '2026-10-03', 76), b: card('b', '2026-03-14', 70) };

  it('CH-11530: picks two comparable rounds, says why the others can’t, and names the pair', () => {
    const { getByRole, getAllByRole, queryByRole } = render(<RoundsHere rounds={rounds} cards={cards} title="Your rounds here" />);
    fireEvent.click(getByRole('button', { name: 'Compare' }));
    const boxes = getAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['Compare Oct 3, 76', 'Compare Mar 14, 70', 'Feb 1, 38. Can’t compare: nine holes']);
    expect(getByRole('region', { name: 'Compare' }).textContent).toContain('Choose two rounds');
    fireEvent.click(boxes[2]!);
    expect(boxes[2]!.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[1]!);
    expect(getByRole('button', { name: 'Compare Oct 3 and Mar 14' })).toBeTruthy();
    fireEvent.click(getByRole('button', { name: 'Cancel' }));
    expect(queryByRole('checkbox')).toBeNull();
  });

  it('offers no Compare with fewer than two comparable rounds', () => {
    const { queryByRole } = render(<RoundsHere rounds={rounds} cards={{ a: cards.a }} title="Your rounds here" />);
    expect(queryByRole('button', { name: 'Compare' })).toBeNull();
  });
});
