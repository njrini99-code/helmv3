// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChReviewHole } from '../../../data/round-review-shape';
import { flowGeometry, flowKeyStep, flowValueText, ScoreFlow } from '../RoundZones';
import { flow, turningStretch } from '../round-insights';

afterEach(cleanup);

/** Eighteen par 4s with these strokes to par. */
const holes = (deltas: number[]): ChReviewHole[] =>
  deltas.map((d, i) => ({ n: i + 1, par: 4, yards: null, score: 4 + d, putts: null, fairway: null, gir: null, penalties: 0, shots: [] }));
const ROUND = holes([0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0]);

const draw = (over: Partial<Parameters<typeof ScoreFlow>[0]> = {}) => {
  const turning = turningStretch(flow(ROUND));
  return render(<ScoreFlow holes={ROUND} outScore={35} outToPar={-1} inScore={39} inToPar={3} selected={14} turning={turning} {...over} />);
};

describe('ScoreFlow is a slider over the holes (P-7, 7.2)', () => {
  it('names itself and speaks the picked hole', () => {
    const { getByRole } = draw();
    const s = getByRole('slider');
    expect(s.getAttribute('aria-label')).toBe('Running score to par');
    expect(s.getAttribute('aria-valuemin')).toBe('1');
    expect(s.getAttribute('aria-valuemax')).toBe('18');
    expect(s.getAttribute('aria-valuenow')).toBe('14');
    expect(s.getAttribute('aria-valuetext')).toBe('Hole 14, par 4, made 6, plus 2 through 14');
    expect(s.getAttribute('tabindex')).toBe('0');
  });

  it('moves a hole on the arrows and three on the Page keys, and says it came from the keyboard', () => {
    const onPick = vi.fn();
    const { getByRole } = draw({ onPick });
    const s = getByRole('slider');
    fireEvent.keyDown(s, { key: 'ArrowRight' });
    fireEvent.keyDown(s, { key: 'PageDown' });
    fireEvent.keyDown(s, { key: 'End' });
    fireEvent.keyDown(s, { key: 'Tab' });
    expect(onPick.mock.calls).toEqual([
      [15, 'key'],
      [11, 'key'],
      [18, 'key'],
    ]);
  });

  it('steps within the ends', () => {
    expect(flowKeyStep('ArrowLeft', 0, 18)).toBe(0);
    expect(flowKeyStep('PageUp', 16, 18)).toBe(17);
    expect(flowKeyStep('Home', 9, 18)).toBe(0);
    expect(flowKeyStep('Enter', 9, 18)).toBeNull();
    expect(flowValueText({ n: 3, par: 3, score: 3, delta: 0, cum: 0, result: 'par' })).toBe('Hole 3, par 3, made 3, level par through 3');
  });
});

describe('the turning band (P-7, 4.5.2)', () => {
  it('draws the stretch behind the line with its sentence, in place of the worst-hole label', () => {
    const { container } = draw();
    const band = container.querySelector('.ch-rzband')!;
    expect(band.getAttribute('class')).toContain('is-loss');
    expect(container.querySelector('.ch-rzband__label')!.textContent).toBe('Lost 3 on 13 to 14');
    // Hole 14 is the worst and sits inside the band, so its own label gives way.
    expect([...container.querySelectorAll('text')].some((t) => t.textContent?.startsWith('Hole 14:'))).toBe(false);
    expect(container.querySelector('.ch-sr-only')!.textContent).toBe('Out in 35, minus 1. In in 39, plus 3. Lost 3 on 13 to 14.');
  });

  it('keeps the worst-hole label when there is no band', () => {
    const { container } = draw({ turning: null });
    expect(container.querySelector('.ch-rzband')).toBeNull();
    expect([...container.querySelectorAll('text')].some((t) => t.textContent?.startsWith('Hole 14:'))).toBe(true);
  });
});

describe('flowGeometry', () => {
  it('spans the holes and puts better above', () => {
    const g = flowGeometry({ x0: 52, x1: 690, top: 44, height: 150, holes: 18, lo: -2, hi: 4 });
    expect(g.x(1)).toBe(52);
    expect(g.x(18)).toBe(690);
    expect(g.y(-2)).toBe(44);
    expect(g.y(0)).toBeLessThan(g.y(1));
    expect(g.split).toBeCloseTo((g.x(9) + g.x(10)) / 2, 6);
    expect(flowGeometry({ x0: 0, x1: 100, top: 0, height: 10, holes: 9, lo: 0, hi: 1 }).split).toBeNull();
  });
});
