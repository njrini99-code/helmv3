// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChCourseHole } from '../../../data/course-page-shape';
import { holeStats, type ChHolePlay } from '../../../data/course-history-shape';
import { avgWords, holeFacts, HoleMap, mostToGain, tileLabel } from '../HoleMap';

afterEach(cleanup);

const play = (score: number, par = 4, i = 0): ChHolePlay => ({ score, par, putts: 2, gir: score <= par, fairway: true, roundId: `r${i}`, date: `2026-09-${String(10 + i).padStart(2, '0')}` });
const hole = (n: number, scores: number[], par = 4): ChCourseHole => {
  const plays = scores.map((s, i) => play(s, par, i));
  return { n, par, yards: n === 14 ? 412 : null, stats: holeStats(plays), plays: plays.map((p) => ({ roundId: p.roundId, date: p.date, score: p.score, par: p.par })) };
};
const HOLES: ChCourseHole[] = Array.from({ length: 18 }, (_, i) => (i + 1 === 14 ? hole(14, [5, 5, 6, 5, 5, 5]) : i + 1 === 3 ? hole(3, [4]) : i + 1 === 9 ? hole(9, []) : hole(i + 1, [4, 4, 4])));

describe('the hole map (P-7 4.2.4, 7.2)', () => {
  it('names each tile in words, the hardest one as most to gain', () => {
    expect(mostToGain(HOLES)).toBe(14);
    expect(tileLabel(HOLES[13]!, true)).toBe('Hole 14, par 4, plus 1.2 average over 6 rounds, most to gain');
    expect(tileLabel(HOLES[2]!, false)).toBe('Hole 3, par 4, played once, level par');
    expect(tileLabel(HOLES[8]!, false)).toBe('Hole 9, not played here');
    expect(tileLabel(HOLES[0]!, false)).toBe('Hole 1, par 4, early read, level average over 3 rounds');
    expect(avgWords(0.04)).toBe('E');
    expect(avgWords(-0.34)).toBe('−0.3');
  });

  it('is a radio group: arrows move a hole and wrap, up and down a nine', () => {
    const onSelect = vi.fn();
    const { getByRole } = render(<HoleMap holes={HOLES} selected={14} onSelect={onSelect} coverage={null} sample={6} />);
    const g = getByRole('radiogroup', { name: 'Hole by hole, average to par' });
    const tiles = [...g.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(tiles).toHaveLength(18);
    expect(tiles.filter((r) => r.getAttribute('tabindex') === '0').map((r) => r.dataset.hole)).toEqual(['14']);
    const at14 = tiles[13]!;
    fireEvent.keyDown(at14, { key: 'ArrowRight' });
    fireEvent.keyDown(at14, { key: 'ArrowUp' });
    fireEvent.keyDown(at14, { key: 'End' });
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual([15, 5, 18]);
  });

  it('the detail says the hole, links each play to its round at that hole, and drops facts under their floors', () => {
    const { container, getByRole } = render(<HoleMap holes={HOLES} selected={14} onSelect={() => {}} coverage="Hole stats from 6 of 7 rounds" sample={6} />);
    expect(getByRole('heading', { name: 'Hole 14' })).toBeTruthy();
    expect(container.querySelector('.ch-hmap-d__h')!.textContent).toContain('par 4 · 412 yards');
    expect(container.querySelector('.ch-hmap-d__tag')!.textContent).toBe('Most to gain');
    expect(container.querySelector('.ch-ch-sec__note')!.textContent).toBe('Hole stats from 6 of 7 rounds · Colour shows from 5 plays of a hole');
    const first = container.querySelector('.ch-hmap-d__pill')!;
    expect(first.getAttribute('href')).toBe('/golf/dashboard/rounds/r0?hole=14');
    expect(holeFacts(HOLES[13]!)).toBe('Fairway 6 of 6 · Green 0 of 6 · 2.0 putts');
    expect(holeFacts(HOLES[2]!)).toBeNull();
  });

  it('the steppers reach every hole with 44 px targets, and the list shows the same holes', () => {
    const onSelect = vi.fn();
    const { getByRole, container } = render(<HoleMap holes={HOLES} selected={1} onSelect={onSelect} coverage={null} sample={6} />);
    fireEvent.click(getByRole('button', { name: 'Previous hole' }));
    expect(onSelect).toHaveBeenLastCalledWith(18);
    fireEvent.click(getByRole('radio', { name: /^List$/ }));
    expect(container.querySelectorAll('.ch-hmap-list tbody tr')).toHaveLength(18);
  });
});
