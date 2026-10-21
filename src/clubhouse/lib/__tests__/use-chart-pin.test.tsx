import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useChartPin } from '../use-chart-pin';

function Chart({ count = 3, axis = 'y' as const }: { count?: number; axis?: 'x' | 'y' }) {
  const pin = useChartPin(count, axis);
  return (
    <div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the chart under test is focusable so the arrow keys work */}
      <div data-testid="chart" role="group" tabIndex={0} {...pin.container}>
        {Array.from({ length: count }, (_, i) => (
          <button key={i} type="button" data-testid={`m${i}`} {...pin.item(i)}>
            mark {i}
          </button>
        ))}
      </div>
      <output data-testid="out">{`${pin.active ?? '-'}|${pin.pinned ?? '-'}`}</output>
      <button type="button" data-testid="outside">
        outside
      </button>
    </div>
  );
}

const out = () => screen.getByTestId('out').textContent;

describe('useChartPin', () => {
  it('reads a mark under a mouse without pinning it, and lets go on leave', () => {
    render(<Chart />);
    fireEvent.pointerEnter(screen.getByTestId('m1'), { pointerType: 'mouse' });
    expect(out()).toBe('1|-');
    fireEvent.pointerLeave(screen.getByTestId('m1'), { pointerType: 'mouse' });
    expect(out()).toBe('-|-');
  });

  it('ignores touch hover: a tap is a click', () => {
    render(<Chart />);
    fireEvent.pointerEnter(screen.getByTestId('m1'), { pointerType: 'touch' });
    expect(out()).toBe('-|-');
    fireEvent.click(screen.getByTestId('m1'));
    expect(out()).toBe('1|1');
  });

  it('pins on click, moves the pin to another mark, and a second click lets go', () => {
    render(<Chart />);
    fireEvent.click(screen.getByTestId('m0'));
    expect(out()).toBe('0|0');
    fireEvent.click(screen.getByTestId('m2'));
    expect(out()).toBe('2|2');
    fireEvent.click(screen.getByTestId('m2'));
    expect(out()).toBe('-|-');
  });

  it('marks the active and pinned marks for styling', () => {
    render(<Chart />);
    fireEvent.click(screen.getByTestId('m1'));
    expect(screen.getByTestId('m1').hasAttribute('data-active')).toBe(true);
    expect(screen.getByTestId('m1').hasAttribute('data-pinned')).toBe(true);
    expect(screen.getByTestId('m0').hasAttribute('data-active')).toBe(false);
  });

  it('steps with the arrow keys (a list: up and down), clamps at the ends, Home and End jump', () => {
    render(<Chart />);
    const chart = screen.getByTestId('chart');
    fireEvent.keyDown(chart, { key: 'ArrowDown' });
    expect(out()).toBe('0|0');
    fireEvent.keyDown(chart, { key: 'ArrowDown' });
    fireEvent.keyDown(chart, { key: 'ArrowDown' });
    fireEvent.keyDown(chart, { key: 'ArrowDown' });
    expect(out()).toBe('2|2');
    fireEvent.keyDown(chart, { key: 'ArrowUp' });
    expect(out()).toBe('1|1');
    fireEvent.keyDown(chart, { key: 'Home' });
    expect(out()).toBe('0|0');
    fireEvent.keyDown(chart, { key: 'End' });
    expect(out()).toBe('2|2');
  });

  it('steps a line of columns with left and right, entering at the last one', () => {
    render(<Chart axis="x" />);
    const chart = screen.getByTestId('chart');
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(out()).toBe('2|2');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(out()).toBe('1|1');
    fireEvent.keyDown(chart, { key: 'ArrowDown' });
    expect(out()).toBe('1|1');
  });

  it('clears on Escape and on a press outside the chart, but not on a press inside it', () => {
    render(<Chart />);
    fireEvent.click(screen.getByTestId('m1'));
    fireEvent.pointerDown(screen.getByTestId('m0'));
    expect(out()).toBe('1|1');
    fireEvent.keyDown(screen.getByTestId('chart'), { key: 'Escape' });
    expect(out()).toBe('-|-');
    fireEvent.click(screen.getByTestId('m1'));
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(out()).toBe('-|-');
  });

  it('drops a pin whose mark no longer exists', () => {
    const { rerender } = render(<Chart count={3} />);
    fireEvent.click(screen.getByTestId('m2'));
    expect(out()).toBe('2|2');
    act(() => rerender(<Chart count={2} />));
    expect(out()).toBe('-|-');
  });
});
