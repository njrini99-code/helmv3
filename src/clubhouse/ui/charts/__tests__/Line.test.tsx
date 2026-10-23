import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import { Line, lineDomain, linePath, lineTicks, lineY } from '../Line';

afterEach(cleanup);

/**
 * B5: one line chart. Better is up, a missing value is a gap, small multiples share a domain, ticks are distinct, and the
 * plot has a name.
 */
describe('ui/charts/Line (B5)', () => {
  it('with lowerIsBetter, a lower later value sits higher (a smaller y)', () => {
    const y = lineY([68, 80], 10, 100, true);
    expect(y(70)).toBeLessThan(y(76));
    const up = lineY([-2, 2], 10, 100, false);
    expect(up(1)).toBeLessThan(up(-1));
  });

  it('a null point splits the path into two M segments', () => {
    const d = linePath([72, 74, null, 71, 70], (i) => i * 10, (v) => v);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).not.toMatch(/C/);
  });

  it('two lines on the same domain put the same value at the same pixel', () => {
    const shared = lineDomain([70, 74, 79, 72]);
    const a = lineY(shared, 14, 130, true);
    const b = lineY(shared, 14, 130, true);
    expect(a(73)).toBe(b(73));
    const own = lineY(lineDomain([72, 73]), 14, 130, true);
    expect(own(73)).not.toBe(a(73));
  });

  it('tick labels are distinct', () => {
    for (const [lo, hi] of [[-0.6, 0.9], [68, 81], [0, 3], [70.2, 70.9]] as const) {
      const t = lineTicks(lo, hi);
      expect(new Set(t.map(String)).size).toBe(t.length);
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it('the plot is an image with a name, and draws gaps, not zeros', () => {
    const { container } = render(<Line label="Scoring average by round." lowerIsBetter points={[{ x: 'Sep 1', y: 72 }, { x: 'Sep 8', y: null }, { x: 'Sep 15', y: 70 }, { x: 'Sep 22', y: 71 }]} />);
    expect(screen.getByRole('img', { name: 'Scoring average by round.' })).toBeTruthy();
    expect(container.querySelectorAll('.ch-line__dot')).toHaveLength(3);
    expect(container.querySelector('.ch-line__path')!.getAttribute('d')!.match(/M/g)).toHaveLength(2);
  });
});

describe('ui/charts/Line options (B5)', () => {
  it('marks="last" draws only the newest point; axis={false} draws no ticks; a wash closes each segment', () => {
    const { container } = render(
      <Line label="Team trend." lowerIsBetter axis={false} marks="last" wash baseline={{ value: 73, dashed: true }} points={[{ x: 'a', y: 74 }, { x: 'b', y: 72 }, { x: 'c', y: null }, { x: 'd', y: 73 }, { x: 'e', y: 71 }]} />,
    );
    expect(container.querySelectorAll('.ch-line__dot')).toHaveLength(1);
    expect(container.querySelectorAll('.ch-line__grid')).toHaveLength(0);
    expect(container.querySelector('.ch-line__ref.is-dashed')).not.toBeNull();
    expect(container.querySelector('.ch-line__wash')!.getAttribute('d')!.match(/Z/g)).toHaveLength(2);
  });

  it('inside a control (interactive={false}) it is hidden and unfocusable, and a baseline wash closes on the baseline', () => {
    const { container } = render(
      <Line label="Putting." interactive={false} ends={false} axis={false} wash="baseline" baseline={{ value: 0 }} domain={[-1.5, 1]} width={206} height={72} points={[{ x: '1', y: -0.4 }, { x: '2', y: 0.2 }]} />,
    );
    const root = container.querySelector('.ch-line')!;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.hasAttribute('tabindex')).toBe(false);
    expect(container.querySelector('[role="img"]')).toBeNull();
    expect(container.querySelectorAll('.ch-line__t')).toHaveLength(0);
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 206 72');
    const zero = container.querySelector('.ch-line__ref')!.getAttribute('y1');
    const wash = container.querySelector('.ch-line__wash.is-flat')!.getAttribute('d')!;
    expect(wash.startsWith(`M`)).toBe(true);
    expect(wash).toContain(`,${Number(zero).toFixed(1)} Z`);
  });

  it('a wash under a two-point segment is a well-formed path', () => {
    const { container } = render(<Line label="Two rounds." lowerIsBetter axis={false} wash points={[{ x: 'a', y: 74 }, { x: 'b', y: 72 }]} />);
    const d = container.querySelector('.ch-line__wash')!.getAttribute('d')!;
    expect(d).not.toMatch(/LL|[^\d] ,/);
    expect(d).toMatch(/^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+){3} Z$/);
  });
});
