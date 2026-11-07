import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plateCrossing, useSlidePlate } from '../slide-plate';

/**
 * Motion bar: a segmented label reads at 4.5:1 or better through the glide. The ink swaps in one step, so a label takes its new ink as the
 * pill crosses it. On a fixed delay the pill got there first, and a dark label sat on the dark pill for about 100 ms at 1.3:1.
 */
describe('plateCrossing', () => {
  const linear = (p: number) => p;
  it('crosses next-door options at the halfway point', () => {
    const c = plateCrossing(linear, 400, 100, 100, 100);
    expect(c.leaving).toBe(200);
    expect(c.arriving).toBe(200);
  });
  it('leaves sooner and arrives later over a longer trip', () => {
    const c = plateCrossing(linear, 400, 200, 100, 100);
    expect(c.leaving).toBe(100);
    expect(c.arriving).toBe(300);
  });
  it('reads the curve, so a fast spring crosses early', () => {
    const fast = (p: number) => 1 - (1 - p) ** 4;
    expect(plateCrossing(fast, 400, 100, 100, 100).leaving).toBeLessThan(100);
  });
});

describe('useSlidePlate ink', () => {
  const delays = new Map<string, number>();
  const orig = HTMLElement.prototype.animate;
  beforeEach(() => {
    delays.clear();
    HTMLElement.prototype.animate = vi.fn(() => ({ currentTime: 0, playState: 'running', cancel: vi.fn() })) as never;
    Object.defineProperty(HTMLElement.prototype, 'offsetLeft', { configurable: true, get(this: HTMLElement) { return Number(this.dataset.x ?? 0); } });
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get: () => 0 });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 80 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 32 });
    HTMLElement.prototype.getAnimations = function (this: HTMLElement) {
      const k = this.dataset.k;
      if (!k) return [];
      return [
        { transitionProperty: 'color', effect: { updateTiming: ({ delay }: { delay: number }) => delays.set(k, delay) } },
        { transitionProperty: 'transform', effect: { updateTiming: () => delays.set(`${k}-wrong`, 1) } },
      ] as never;
    };
  });
  afterEach(() => {
    cleanup();
    HTMLElement.prototype.animate = orig;
  });
  function Seg({ chosen, reduced = false }: { chosen: string; reduced?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useSlidePlate(ref, '.plate', chosen, { reduced, ink: '.opt' });
    return (
      <div ref={ref}>
        {['a', 'b', 'c'].map((k, i) => (
          <button key={k} className="opt" data-k={k} data-x={i * 100}>
            {k === chosen && <i className="plate" />}
          </button>
        ))}
      </div>
    );
  }
  const settle = () => new Promise((r) => requestAnimationFrame(() => r(null)));
  it('retimes only the colour swap, the chosen label at the arrival and the rest at the leaving', async () => {
    const { rerender } = render(<Seg chosen="a" />);
    await settle();
    rerender(<Seg chosen="c" />);
    expect(delays.get('a')).toBeGreaterThan(0);
    expect(delays.get('c')).toBeGreaterThan(delays.get('a')!);
    expect(delays.has('a-wrong')).toBe(false);
  });
  it('swaps at once under Reduce Motion, where the pill does not travel', async () => {
    const { rerender } = render(<Seg chosen="a" reduced />);
    await settle();
    rerender(<Seg chosen="c" reduced />);
    expect(delays.get('a')).toBe(0);
    expect(delays.get('c')).toBe(0);
  });
});
