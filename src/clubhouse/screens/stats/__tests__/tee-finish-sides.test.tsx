// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Stats › a player › Off the tee, "Where tee shots finish" (Nick, 12 Nov: "there's only between left and right, not top
 * or bottom"). The logger records a tee shot's side only, so the grid's long and short rows were always 0. Tee shots
 * are one row now: Left, Center, Right. A shot an older edit logged as short or long counts as center and a diagonal as
 * its side, so every shot is counted once and the three shares add to 100. Approaches keep the 3×3 grid.
 */

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import type { ChSprayGroup } from '../../../data/stats-detail';
import { PREVIEW_PLAYER } from '../../../preview/fixtures-stats';
import { SectorGrid, teeSides, wholeShares } from '../detail';
import { TeeMore } from '../GameMore';

afterEach(cleanup);

const spray = PREVIEW_PLAYER.extra.spray!;
const cellsOf = (root: ParentNode) =>
  [...root.querySelectorAll('.ch-gx-sec__c')].map((c) => ({
    label: c.querySelector('em')?.textContent,
    count: Number(c.querySelector('b')?.textContent),
    pct: c.querySelector('i')?.textContent,
    top: c.classList.contains('is-top'),
  }));

describe('Where tee shots finish: one row', () => {
  it('draws Left, Center, Right and nothing long or short', () => {
    const { container } = render(<TeeMore s={PREVIEW_PLAYER.stats!} x={PREVIEW_PLAYER.extra} />);
    const panel = [...container.querySelectorAll('section, div')].find((n) => n.textContent?.startsWith('Where tee shots finish'))!;
    const grid = panel.querySelector('.ch-gx-sec')!;
    expect(grid.classList.contains('ch-gx-sec--sides')).toBe(true);
    const cells = cellsOf(grid);
    expect(cells.map((c) => c.label)).toEqual(['Left', 'Center', 'Right']);
    expect(grid.textContent).not.toMatch(/Long|Short/);
    expect(container.textContent).toContain('Shots with no direction logged count as center.');
  });

  it('folds short and long into center and a diagonal into its side, so every shot counts once', () => {
    // The fixture: left 24, center 71, right 20, long 1, short 1, short left 1 = 118.
    const sides = teeSides(spray.driving);
    expect(sides.map((s) => [s.key, s.count])).toEqual([
      ['left', 25],
      ['center', 73],
      ['right', 20],
    ]);
    expect(sides.reduce((a, s) => a + s.count, 0)).toBe(spray.driving.shots);
  });

  it('shows shares that add to 100, and keeps the biggest (Center) highlighted', () => {
    const { container } = render(<SectorGrid g={spray.driving} unit="tee shots" sides />);
    const cells = cellsOf(container);
    expect(cells).toHaveLength(3);
    const shares = cells.map((c) => Number(c.pct!.replace('%', '')));
    expect(shares).toEqual([21, 62, 17]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(cells.filter((c) => c.top).map((c) => c.label)).toEqual(['Center']);
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('118 tee shots by side: Left 25, Center 73, Right 20');
  });

  it('a third each still adds to 100', () => {
    expect(wholeShares([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(wholeShares([2, 1, 0])).toEqual([67, 33, 0]);
    expect(wholeShares([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('no tee shots: three zero cells, none highlighted', () => {
    const none: ChSprayGroup = { ...spray.driving, shots: 0, bands: spray.driving.bands.map((b) => ({ ...b, count: 0, pct: 0 })) };
    const { container } = render(<SectorGrid g={none} unit="tee shots" sides />);
    const cells = cellsOf(container);
    expect(cells.map((c) => c.count)).toEqual([0, 0, 0]);
    expect(cells.some((c) => c.top)).toBe(false);
  });
});

describe('Where approaches finish: still the 3×3 grid', () => {
  it('keeps all nine sectors, long and short included', () => {
    const { container } = render(<SectorGrid g={spray.approach} unit="approaches" />);
    const cells = cellsOf(container);
    expect(cells).toHaveLength(9);
    expect(cells.map((c) => c.label)).toEqual(['Long left', 'Long', 'Long right', 'Left', 'Center', 'Right', 'Short left', 'Short', 'Short right']);
    expect(container.querySelector('.ch-gx-sec--sides')).toBeNull();
  });
});
