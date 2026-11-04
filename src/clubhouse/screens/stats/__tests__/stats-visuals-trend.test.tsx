import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const scrub = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: scrub }));

import { ScoringFeatureChart } from '../ScoringFeatureChart';
import type { TrendRound } from '../round-trend';
import { nearestIndex, stepIndex } from '../scrub';

const ROUNDS = [74, 72, 76, 71, 70].map((value, i) => ({ id: `r${i}`, label: `Oct ${i + 1}`, value, toPar: value - 72, holes: 18 })) as unknown as TrendRound[];

function Harness({ rounds = ROUNDS, onRead }: { rounds?: TrendRound[]; onRead: (i: number | null) => void }) {
  const [, set] = useState<number | null>(null);
  return (
    <ScoringFeatureChart
      rounds={rounds}
      tone="gain"
      onRead={(i) => {
        set(i);
        onRead(i);
      }}
    />
  );
}

afterEach(cleanup);

/** Stats-home criteria 68, 109: the scrub's maths. */
describe('scrub maths', () => {
  it('finds the nearest of equal columns and snaps past either end', () => {
    expect(nearestIndex(5, 0, 100, 5)).toBe(0);
    expect(nearestIndex(99, 0, 100, 5)).toBe(4);
    expect(nearestIndex(50, 0, 100, 5)).toBe(2);
    expect(nearestIndex(-40, 0, 100, 5)).toBe(0);
    expect(nearestIndex(900, 0, 100, 5)).toBe(4);
    expect(nearestIndex(10, 0, 0, 5)).toBe(0);
    expect(nearestIndex(10, 0, 100, 0)).toBe(-1);
  });
  it('steps and stops at the ends', () => {
    expect(stepIndex(2, 'ArrowLeft', 5)).toBe(1);
    expect(stepIndex(2, 'ArrowRight', 5)).toBe(3);
    expect(stepIndex(0, 'ArrowLeft', 5)).toBe(0);
    expect(stepIndex(4, 'ArrowRight', 5)).toBe(4);
    expect(stepIndex(2, 'Home', 5)).toBe(0);
    expect(stepIndex(2, 'End', 5)).toBe(4);
    expect(stepIndex(null, 'ArrowLeft', 5)).toBe(4);
    expect(stepIndex(null, 'x', 5)).toBeNull();
    expect(stepIndex(1, 'x', 5)).toBeNull();
    expect(stepIndex(1, 'ArrowLeft', 0)).toBeNull();
  });
});

/** The scrub keyboard test of PR 4c: arrows step, Escape ends. */
describe('scrub keyboard', () => {
  it('the first right arrow reads the oldest round, and left the newest', () => {
    const onRead = vi.fn();
    render(<Harness onRead={onRead} />);
    const s = screen.getByRole('slider');
    fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(onRead).toHaveBeenLastCalledWith(0);
    cleanup();
    const other = vi.fn();
    render(<Harness onRead={other} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
    expect(other).toHaveBeenLastCalledWith(4);
  });

  it('arrows step and stop at the ends, with a tick per round crossed', () => {
    const onRead = vi.fn();
    render(<Harness onRead={onRead} />);
    const s = screen.getByRole('slider');
    scrub.mockClear();
    fireEvent.keyDown(s, { key: 'ArrowRight' });
    fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(onRead).toHaveBeenLastCalledWith(1);
    expect(scrub).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(s, { key: 'ArrowLeft' });
    fireEvent.keyDown(s, { key: 'ArrowLeft' });
    fireEvent.keyDown(s, { key: 'ArrowLeft' });
    expect(onRead).toHaveBeenLastCalledWith(0);
  });

  it('Escape ends the read; with nothing read it is left for the page', () => {
    const onRead = vi.fn();
    const page = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- stands for the page's own Escape handler
      <div onKeyDown={page}>
        <Harness onRead={onRead} />
      </div>,
    );
    const s = screen.getByRole('slider');
    fireEvent.keyDown(s, { key: 'Escape' });
    expect(onRead).not.toHaveBeenCalled();
    expect(page).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(s, { key: 'ArrowRight' });
    fireEvent.keyDown(s, { key: 'Escape' });
    expect(onRead).toHaveBeenLastCalledWith(null);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it('leaving the chart restores the average', () => {
    const onRead = vi.fn();
    render(<Harness onRead={onRead} />);
    const s = screen.getByRole('slider');
    fireEvent.keyDown(s, { key: 'ArrowRight' });
    fireEvent.blur(s);
    expect(onRead).toHaveBeenLastCalledWith(null);
  });

  it('says where it is to a screen reader', () => {
    render(<Harness onRead={vi.fn()} />);
    const s = screen.getByRole('slider');
    expect(s.getAttribute('aria-valuemin')).toBe('1');
    expect(s.getAttribute('aria-valuemax')).toBe('5');
    expect(s.getAttribute('aria-valuenow')).toBe('5');
    expect(s.getAttribute('aria-valuetext')).toBe('Latest 70, Oct 5');
    fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(s.getAttribute('aria-valuenow')).toBe('1');
    expect(s.getAttribute('aria-valuetext')).toBe('74, Oct 1');
  });
});

describe('the chart, drawn', () => {
  it('marks itself so a drag never opens the card', () => {
    render(<Harness onRead={vi.fn()} />);
    expect(document.querySelector('[data-ch="stats-hero-chart"]')!.hasAttribute('data-ch-no-open')).toBe(true);
  });

  it('newest dot r 5, others r 3.6, a read round r 6 (criteria 12, 109)', () => {
    render(<Harness onRead={vi.fn()} />);
    const r = () => [...document.querySelectorAll('.ch-shs-rdot')].map((c) => c.getAttribute('r'));
    expect(r()).toEqual(['3.6', '3.6', '3.6', '3.6', '5']);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(r()[0]).toBe('6');
  });

  it('under-par rounds carry the under mark, and the SVG is 160 tall', () => {
    render(<Harness onRead={vi.fn()} />);
    const under = [...document.querySelectorAll('.ch-shs-rdot')].map((c) => c.classList.contains('is-under'));
    expect(under).toEqual([false, false, false, true, true]);
    expect(document.querySelector('.ch-shs-chart svg')!.getAttribute('height')).toBe('160');
  });

  it('one round: one dot, no slider, not focusable (CP-126)', () => {
    render(<Harness rounds={ROUNDS.slice(0, 1)} onRead={vi.fn()} />);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(document.querySelector('[data-ch="stats-hero-chart"]')!.hasAttribute('tabindex')).toBe(false);
    expect(document.querySelectorAll('.ch-shs-rdot')).toHaveLength(1);
  });

  it('no rounds: nothing', () => {
    render(<Harness rounds={[]} onRead={vi.fn()} />);
    expect(document.querySelector('[data-ch="stats-hero-chart"]')).toBeNull();
  });
});
