// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChCourseHole } from '../../../data/course-page-shape';
import { holeStats, type ChHolePlay } from '../../../data/course-history-shape';
import { avgWords, HMAP_PHONE_QUERY, holeFacts, HoleMap, mapFits, mostToGain, PHONE_COLS, rowStep, shownHoles, tileLabel } from '../HoleMap';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A phone under 600 px: the media query the six-across grid answers to matches. */
const asPhone = () =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === HMAP_PHONE_QUERY, media: q, addEventListener() {}, removeEventListener() {} }));


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

  // Owner call 2, settled as version (b): three rows of six on a phone, each tile its own 56 px target.
  describe('on a phone, three rows of six', () => {
    const NINE: ChCourseHole[] = Array.from({ length: 18 }, (_, i) =>
      i < 9 ? hole(i + 1, [4, 5, 4]) : { n: i + 1, par: null, yards: null, stats: holeStats([]), plays: [] },
    );

    it('the tiles sit in one six-column grid, in hole order, so 1 to 6, 7 to 12 and 13 to 18 make the rows', () => {
      const { getByRole, container } = render(<HoleMap holes={HOLES} selected={14} onSelect={() => {}} coverage={null} sample={6} />);
      const g = getByRole('radiogroup', { name: 'Hole by hole, average to par' });
      expect(g.classList.contains('ch-hmap__grid')).toBe(true);
      expect(g.dataset.phoneCols).toBe(String(PHONE_COLS));
      expect(PHONE_COLS).toBe(6);
      // The nines' rows dissolve into the grid (display: contents), so the grid places every tile in DOM order.
      const order = [...g.querySelectorAll<HTMLElement>('.ch-hmap__row > [role="radio"]')].map((t) => Number(t.dataset.hole));
      expect(order).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
      const rows = Array.from({ length: Math.ceil(order.length / PHONE_COLS) }, (_, r) => order.slice(r * PHONE_COLS, (r + 1) * PHONE_COLS));
      expect(rows).toEqual([
        [1, 2, 3, 4, 5, 6],
        [7, 8, 9, 10, 11, 12],
        [13, 14, 15, 16, 17, 18],
      ]);
      // Every tile is a ch-hmap-t, whose phone rule is min-height 56 px (course-page-css.test.ts pins the rule).
      for (const t of g.querySelectorAll('[role="radio"]')) expect(t.classList.contains('ch-hmap-t')).toBe(true);
      // The turn lands mid row two: Out and In share one line above the grid, and tile 10 carries the seam.
      const sum = container.querySelector('.ch-hmap__sum')!;
      expect(sum.getAttribute('aria-hidden')).toBe('true');
      expect([...sum.children].map((c) => c.textContent)).toEqual(['Out', 'In · +1.2']);
      expect(g.querySelector('[data-hole="10"]')).toBeTruthy();
    });

    it('fits six across at 320 to 430 wide (16 px page edge, 20 from 414), where nine across did not fit below 414', () => {
      for (const [vw, edge] of [
        [320, 16],
        [375, 16],
        [390, 16],
        [414, 20],
        [430, 20],
      ] as const) {
        const content = vw - 2 * edge;
        expect(mapFits(content, 16, 6), `${vw}`).toBe(true);
        if (vw < 414) expect(mapFits(content, 16, 9), `${vw}`).toBe(false);
        // Each tile: the content less five 4 px gaps, over six. 53.8 at 375, 56.3 at 390.
        expect((content - 5 * 4) / 6).toBeGreaterThanOrEqual(vw >= 375 ? 53.8 : 44.6);
      }
    });

    it('up and down move one row of six and wrap in the same column; Home and End are the ends', () => {
      asPhone();
      const onSelect = vi.fn();
      const { getByRole } = render(<HoleMap holes={HOLES} selected={14} onSelect={onSelect} coverage={null} sample={6} />);
      const at14 = getByRole('radio', { name: /^Hole 14,/ });
      fireEvent.keyDown(at14, { key: 'ArrowDown' });
      fireEvent.keyDown(at14, { key: 'ArrowUp' });
      fireEvent.keyDown(at14, { key: 'Home' });
      fireEvent.keyDown(at14, { key: 'End' });
      expect(onSelect.mock.calls.map((c) => c[0])).toEqual([2, 8, 1, 18]);
      expect(rowStep(1, 18, 6, -1)).toBe(13);
      expect(rowStep(4, 9, 6, 1)).toBe(4);
      expect(rowStep(13, 18, 9, 1)).toBe(4);
    });

    it('a tap is a tap: a touch going down on the map picks nothing until the tile is clicked', () => {
      asPhone();
      const onSelect = vi.fn();
      const { getByRole, container } = render(<HoleMap holes={HOLES} selected={14} onSelect={onSelect} coverage={null} sample={6} />);
      fireEvent.pointerDown(container.querySelector('.ch-hmap')!, { pointerType: 'touch', clientX: 1, clientY: 1 });
      expect(onSelect).not.toHaveBeenCalled();
      fireEvent.click(getByRole('radio', { name: /^Hole 3,/ }), { detail: 1 });
      expect(onSelect).toHaveBeenLastCalledWith(3);
    });

    it('a nine-hole course draws nine tiles (six, then three), with no In', () => {
      asPhone();
      expect(shownHoles(NINE)).toHaveLength(9);
      expect(shownHoles(HOLES)).toHaveLength(18);
      const onSelect = vi.fn();
      const { getByRole, container } = render(<HoleMap holes={NINE} selected={9} onSelect={onSelect} coverage={null} sample={3} />);
      const tiles = getByRole('radiogroup', { name: 'Hole by hole, average to par' }).querySelectorAll('[role="radio"]');
      expect(tiles).toHaveLength(9);
      expect([...container.querySelectorAll('.ch-hmap__cap')].map((c) => c.textContent)).toEqual(['Out · +3.0']);
      expect([...container.querySelector('.ch-hmap__sum')!.children].map((c) => c.textContent)).toEqual(['Out · +3.0']);
      fireEvent.keyDown(tiles[8]!, { key: 'ArrowRight' });
      fireEvent.keyDown(tiles[8]!, { key: 'ArrowLeft' });
      fireEvent.keyDown(tiles[8]!, { key: 'ArrowUp' });
      fireEvent.keyDown(tiles[8]!, { key: 'Home' });
      expect(onSelect.mock.calls.map((c) => c[0])).toEqual([1, 8, 3, 1]);
      expect(container.querySelectorAll('.ch-hmap-list tbody tr')).toHaveLength(9);
    });

    it('a back-nine hole asked of a nine-hole map falls back to hole 1: checked, in the tab order, in the detail, and told to the page', () => {
      const onSelect = vi.fn();
      const { getByRole } = render(<HoleMap holes={NINE} selected={14} onSelect={onSelect} coverage={null} sample={3} />);
      const tiles = [...getByRole('radiogroup', { name: 'Hole by hole, average to par' }).querySelectorAll<HTMLElement>('[role="radio"]')];
      expect(tiles.filter((t) => t.getAttribute('aria-checked') === 'true').map((t) => t.dataset.hole)).toEqual(['1']);
      expect(tiles.filter((t) => t.getAttribute('tabindex') === '0').map((t) => t.dataset.hole)).toEqual(['1']);
      expect(getByRole('heading', { name: 'Hole 1' })).toBeTruthy();
      expect(onSelect).toHaveBeenCalledWith(1);
      fireEvent.keyDown(tiles[0]!, { key: 'ArrowRight' });
      expect(onSelect).toHaveBeenLastCalledWith(2);
    });
  });
});
