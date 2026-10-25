import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import { Line } from '../../ui/charts/Line';
import { SgBars } from '../../screens/stats/SgBars';
import { CH_GLIDE_MS, useGlide, type ChGlideGeometry } from '../motion-glide';

const realMatchMedia = window.matchMedia;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.matchMedia = realMatchMedia;
});

const reduceMotion = () => {
  window.matchMedia = ((query: string) =>
      ({ matches: query.includes('reduce'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList) as typeof window.matchMedia;
};

function Probe({ at, identity }: { at: ChGlideGeometry; identity?: string }) {
  const g = useGlide(at, identity);
  return <output>{g.map((v) => (v == null ? '-' : v.toFixed(1))).join(',')}</output>;
}
const shown = (c: HTMLElement) => c.querySelector('output')!.textContent;
const frames = (ms: number) => act(() => vi.advanceTimersByTime(ms));

/** B9 (owner decision 1): bars and lines glide to new values on a change, never on first paint; digits never roll. */
describe('useGlide (B9)', () => {
  it('first paint draws the figures where they belong and schedules no frame', () => {
    const { container } = render(<Probe at={[10, null, 40]} />);
    expect(shown(container)).toBe('10.0,-,40.0');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a change starts from the old place, passes between, and ends exactly on the new one', async () => {
    const { container, rerender } = render(<Probe at={[10, 40]} />);
    rerender(<Probe at={[30, 0]} />);
    expect(shown(container)).toBe('10.0,40.0');
    frames(16);
    frames(CH_GLIDE_MS / 2);
    const [a, b] = shown(container)!.split(',').map(Number);
    expect(a).toBeGreaterThan(10);
    expect(a).toBeLessThan(30);
    expect(b).toBeLessThan(40);
    expect(b).toBeGreaterThan(0);
    frames(CH_GLIDE_MS);
    expect(shown(container)).toBe('30.0,0.0');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a re-render that draws the same thing (a hover, a pin) does not animate', () => {
    const { rerender } = render(<Probe at={[10, 40]} />);
    rerender(<Probe at={[10, 40]} />);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a mark that comes or goes, or another set of rows, snaps', () => {
    const { container, rerender } = render(<Probe at={[10, 40]} identity="a|b" />);
    rerender(<Probe at={[10, null]} identity="a|b" />);
    expect(shown(container)).toBe('10.0,-');
    rerender(<Probe at={[20, 30]} identity="a|c" />);
    expect(shown(container)).toBe('20.0,30.0');
    frames(CH_GLIDE_MS * 2);
    expect(shown(container)).toBe('20.0,30.0');
  });

  it('reduced motion is instant', () => {
    reduceMotion();
    const { container, rerender } = render(<Probe at={[10, 40]} />);
    rerender(<Probe at={[30, 0]} />);
    expect(shown(container)).toBe('30.0,0.0');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('charts glide on a change, and their digits do not roll (B9)', () => {
  const legs = (approach: number) => [
    { label: 'Off the tee', value: 0.5 },
    { label: 'Approach', value: approach },
  ];
  const bar = (c: HTMLElement) => c.querySelectorAll<HTMLElement>('.ch-stm-leg__v')[1]!;

  it('SgBars: first paint is in place; a new window glides the bar, through zero, while the figure changes at once', () => {
    const { container, rerender } = render(<SgBars rows={legs(1)} />);
    const before = bar(container).style.width;
    expect(bar(container).style.left).toBe('50%');
    expect(vi.getTimerCount()).toBe(0);
    rerender(<SgBars rows={legs(-1)} />);
    // The digits are the new figure already; the bar has not moved yet.
    expect(container.querySelectorAll('.ch-stm-leg b')[1]!.textContent).toContain('1.0');
    expect(container.querySelectorAll('.ch-stm-leg b')[1]!.textContent).not.toContain('+');
    expect(bar(container).style.width).toBe(before);
    frames(16);
    frames(CH_GLIDE_MS / 2);
    expect(parseFloat(bar(container).style.width)).toBeLessThan(parseFloat(before));
    frames(CH_GLIDE_MS);
    // A loss ends anchored on the zero line, growing left, the same length as the gain it was.
    expect(bar(container).style.right).toBe('50%');
    expect(bar(container).style.width).toBe(before);
  });

  it('Line: a new window moves the path between its old and new heights, and lands on the new one', () => {
    const pts = (ys: number[]) => ys.map((y, i) => ({ x: `R${i + 1}`, y }));
    const view = (ys: number[]) => <Line points={pts(ys)} domain={[60, 90]} label="Scores" />;
    const { container, rerender } = render(view([70, 72, 74]));
    const path = () => container.querySelector('.ch-line__path')!.getAttribute('d');
    const first = path();
    rerender(view([80, 82, 84]));
    const target = (() => {
      const probe = render(view([80, 82, 84]));
      const d = probe.container.querySelector('.ch-line__path')!.getAttribute('d');
      probe.unmount();
      return d;
    })();
    expect(path()).toBe(first);
    frames(16);
    frames(CH_GLIDE_MS / 2);
    expect(path()).not.toBe(first);
    expect(path()).not.toBe(target);
    frames(CH_GLIDE_MS);
    expect(path()).toBe(target);
  });
});
