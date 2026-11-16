import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import { Line } from '../../ui/charts/Line';
import { renderToString } from 'react-dom/server';
import { CH_EASE_IOS_CSS } from '../motion';
import { CH_GLIDE_MS, firstViewKey, resetFirstViews, useFirstViewGrow, useGlide, type ChGlideGeometry } from '../motion-glide';

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
  it('a window change glides over the marks beat, 360ms, on the iOS curve (MOTION-AND-VISUAL 3.7)', () => {
    expect(CH_GLIDE_MS).toBe(360);
    const src = readFileSync(join(process.cwd(), 'src/clubhouse/lib/motion-glide.ts'), 'utf8');
    expect(src).toMatch(/const ease = cubicBezier\(\.\.\.CH_EASE_IOS\);/);
  });

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

/** 3.7: a bar chart's first view in a session grows its bars from the origin it gives, once per screen; never a revisit. */
describe('useFirstViewGrow (MOTION-AND-VISUAL 3.7)', () => {
  type Run = { el: Element; frames: Keyframe[]; opts: KeyframeAnimationOptions };
  let runs: Run[] = [];
  const realAnimate = HTMLElement.prototype.animate;
  beforeEach(() => {
    runs = [];
    sessionStorage.clear();
    resetFirstViews();
    HTMLElement.prototype.animate = function (this: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) {
      runs.push({ el: this, frames, opts });
      return { cancel: vi.fn() } as unknown as Animation;
    } as never;
  });
  afterEach(() => {
    HTMLElement.prototype.animate = realAnimate;
    document.documentElement.removeAttribute('data-motion');
  });

  function Bars({ screen = 'stats-overview', values = [2, -1] }: { screen?: string; values?: number[] }) {
    const grow = useFirstViewGrow<HTMLDivElement>(screen, 'x');
    return (
      <div ref={grow}>
        {values.map((v, i) => (
          <i key={i} className="bar" data-ch-grow={v >= 0 ? 'left' : 'right'} />
        ))}
        <span className="label">Zero</span>
      </div>
    );
  }

  it('the first view grows each bar from its own origin over 360ms on the iOS curve, and nothing else', () => {
    render(<Bars />);
    expect(runs.map((r) => (r.el as HTMLElement).className)).toEqual(['bar', 'bar']);
    expect(runs[0]!.frames).toEqual([
      { transform: 'scaleX(0)', transformOrigin: 'left' },
      { transform: 'none', transformOrigin: 'left' },
    ]);
    expect(runs[1]!.frames[0]).toEqual({ transform: 'scaleX(0)', transformOrigin: 'right' });
    expect(runs[0]!.opts).toEqual({ duration: 360, easing: CH_EASE_IOS_CSS });
    expect(sessionStorage.getItem(firstViewKey('stats-overview'))).toBe('1');
  });

  it('a revisit in the same session never grows, and another screen keeps its own first view', () => {
    const first = render(<Bars />);
    first.unmount();
    frames(1000);
    runs = [];
    render(<Bars />);
    expect(runs).toEqual([]);
    render(<Bars screen="stats-team-phone" />);
    expect(runs).toHaveLength(2);
  });

  it('a session that has seen the screen (a reload, a new tab copy) never grows it', () => {
    sessionStorage.setItem(firstViewKey('stats-overview'), '1');
    render(<Bars />);
    expect(runs).toEqual([]);
  });

  it('two charts arriving with the same page both grow', () => {
    render(
      <>
        <Bars />
        <Bars values={[1]} />
      </>,
    );
    expect(runs).toHaveLength(3);
  });

  it('never under Reduce Motion or Animations off, and the view still counts as seen', () => {
    reduceMotion();
    render(<Bars />);
    expect(runs).toEqual([]);
    expect(sessionStorage.getItem(firstViewKey('stats-overview'))).toBe('1');
    cleanup();
    window.matchMedia = realMatchMedia;
    document.documentElement.setAttribute('data-motion', 'off');
    render(<Bars screen="stats-team-phone" />);
    expect(runs).toEqual([]);
  });

  it('never over bars the server drew: hydration leaves them at full length', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Bars />);
    document.body.appendChild(container);
    render(<Bars />, { container, hydrate: true });
    expect(runs).toEqual([]);
    expect(sessionStorage.getItem(firstViewKey('stats-overview'))).toBe('1');
  });
});
