import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MissPattern } from '../visual/blocks';

afterEach(() => cleanup());

/**
 * The miss pattern's wedges (stats and charts audit 2026-11-15, CH-22): a wedge drew 14 units at zero misses and grew with its
 * count along the radius, so its area grew with the square of the count. Now the area is the count, from nothing.
 */
const draw = (wedges: Array<{ direction: string; count: number }>) =>
  render(<MissPattern block={{ type: 'miss_pattern', total: wedges.reduce((n, w) => n + w.count, 0), no_direction: 0, inside_15: 0, inside_25: 0, wedges: wedges.map((w) => ({ ...w, avg_left_ft: null })) }} />).container;
const radius = (el: Element) => Number(/A([\d.]+),/.exec(el.getAttribute('d')!)![1]);

describe('MissPattern · wedge area is the count (CH-22)', () => {
  it('a direction with no misses draws no wedge', () => {
    const c = draw([{ direction: 'short', count: 4 }, { direction: 'long', count: 0 }]);
    const wedges = [...c.querySelectorAll('.ch-aks-miss__wedge')];
    expect(wedges).toHaveLength(1);
    expect(wedges[0]!.getAttribute('aria-label')).toBe('Ask about short misses, 4');
  });

  it('four misses against one draw twice the radius, four times the area', () => {
    const c = draw([{ direction: 'short', count: 4 }, { direction: 'right', count: 1 }]);
    const [short, right] = [...c.querySelectorAll('.ch-aks-miss__wedge')];
    expect(radius(short!) / radius(right!)).toBeCloseTo(2, 5);
  });
});
