import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scrub = vi.hoisted(() => vi.fn());
vi.mock('../haptics', () => ({ haptic: vi.fn(), hapticScrub: scrub }));

import { Line } from '../../ui/charts/Line';
import { useChartPin } from '../use-chart-pin';

function Plot({ count = 3 }: { count?: number }) {
  const pin = useChartPin(count, 'x');
  return (
    <div {...pin.container}>
      <div data-testid="plot" {...pin.area} />
      <output data-testid="out">{`${pin.active ?? '-'}|${pin.pinned ?? '-'}`}</output>
    </div>
  );
}

const box = (el: Element) => {
  (el as HTMLElement).getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, right: 300, bottom: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) });
};
const calls = () => scrub.mock.calls.map((c) => c[0]);

beforeEach(() => scrub.mockClear());
afterEach(cleanup);

/** B5: every chart that scrubs ticks per point under the finger, from useChartPin, not from one chart's own effect. */
describe('useChartPin scrub haptics (B5)', () => {
  it('3 points give 3 ticks: start as the scrub begins, a step per point read (the first included), end on release', () => {
    render(<Plot />);
    const plot = screen.getByTestId('plot');
    box(plot);
    fireEvent.pointerDown(plot, { pointerType: 'touch', clientX: 10, clientY: 50 });
    fireEvent.pointerMove(plot, { pointerType: 'touch', clientX: 30, clientY: 51 });
    fireEvent.pointerMove(plot, { pointerType: 'touch', clientX: 60, clientY: 51 });
    fireEvent.pointerMove(plot, { pointerType: 'touch', clientX: 150, clientY: 52 });
    fireEvent.pointerMove(plot, { pointerType: 'touch', clientX: 160, clientY: 52 });
    fireEvent.pointerMove(plot, { pointerType: 'touch', clientX: 250, clientY: 52 });
    fireEvent.pointerUp(plot, { pointerType: 'touch', clientX: 250, clientY: 52 });
    expect(calls()).toEqual(['start', 'step', 'step', 'step', 'end']);
    expect(screen.getByTestId('out').textContent).toBe('2|2');
  });

  it('a cancelled scrub (the page took the swipe) ends the engine too', () => {
    render(<Plot />);
    const plot = screen.getByTestId('plot');
    box(plot);
    fireEvent.pointerDown(plot, { pointerType: 'touch', clientX: 10, clientY: 50 });
    fireEvent.pointerMove(plot, { pointerType: 'touch', clientX: 150, clientY: 51 });
    fireEvent.pointerCancel(plot, { pointerType: 'touch' });
    expect(calls()).toEqual(['start', 'step', 'end']);
  });

  it('a mouse passing over, a tap, a vertical swipe and the arrow keys never tick', () => {
    render(<Plot />);
    const plot = screen.getByTestId('plot');
    box(plot);
    fireEvent.pointerMove(plot, { pointerType: 'mouse', clientX: 30 });
    fireEvent.pointerMove(plot, { pointerType: 'mouse', clientX: 250 });
    fireEvent.pointerDown(plot, { pointerType: 'touch', clientX: 150, clientY: 50 });
    fireEvent.pointerUp(plot, { pointerType: 'touch', clientX: 150, clientY: 50 });
    fireEvent.pointerDown(plot, { pointerType: 'touch', clientX: 150, clientY: 50 });
    fireEvent.pointerMove(plot, { pointerType: 'touch', clientX: 152, clientY: 90 });
    fireEvent.pointerCancel(plot, { pointerType: 'touch' });
    fireEvent.keyDown(plot.parentElement!, { key: 'ArrowLeft' });
    expect(calls()).toEqual([]);
  });

  it('Line ticks through the hook (its own effect is gone): a scrub across its plot ticks each point once', () => {
    render(<Line points={[{ x: 'A', y: 70 }, { x: 'B', y: 72 }, { x: 'C', y: 71 }]} label="Scores" />);
    const svg = document.querySelector('.ch-line__svg')!;
    box(svg);
    fireEvent.pointerDown(svg, { pointerType: 'touch', clientX: 40, clientY: 50 });
    // The plot spans 34..326 of 340 viewBox units: these land on the first, second and third columns.
    for (const x of [60, 70, 150, 160, 260]) fireEvent.pointerMove(svg, { pointerType: 'touch', clientX: x, clientY: 51 });
    fireEvent.pointerUp(svg, { pointerType: 'touch', clientX: 260, clientY: 51 });
    expect(calls()).toEqual(['start', 'step', 'step', 'step', 'end']);
  });
});
