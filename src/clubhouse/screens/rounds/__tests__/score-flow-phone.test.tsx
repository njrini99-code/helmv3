// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_REVIEW_COACH } from '../../../preview/fixtures-round-review';
import { ScoreFlow, worstPlace } from '../RoundZones';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const r = PREVIEW_REVIEW_COACH;

/** The size the stylesheet sets the picture's words at, as `useLabelSize` reads it (12 on a desk, 34 on a phone's stage). */
const drawnAt = (px: number) => {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) =>
    el instanceof SVGElement && el.tagName.toLowerCase() === 'text' ? ({ fontSize: `${px}px`, display: 'inline' } as unknown as CSSStyleDeclaration) : real(el, pseudo),
  );
};

const chart = () => {
  const { container } = render(<ScoreFlow holes={r.holes} outScore={r.front.score} outToPar={r.front.toPar} inScore={r.back.score} inToPar={r.back.toPar} />);
  const svg = container.querySelector('svg')!;
  const dots = [...svg.querySelectorAll('.ch-rzdots circle:not(.ch-rzdot__halo)')].map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }));
  const ticks = [...svg.querySelectorAll('text[text-anchor="end"].ch-num')].filter((t) => /^(E|[+−]\d+)$/.test(t.textContent ?? ''));
  const worst = [...svg.querySelectorAll('text')].find((t) => /^Hole \d+: /.test(t.textContent ?? ''));
  return { dots, ticks, worst };
};

/**
 * Phone premium sweep (12 Nov 2026), measured in WebKit at 390: the running score's labels are 34 units on a phone's
 * stage. The score labels ended 4px from hole 1's dot and their rows overlapped (16px apart, 17px tall), and "Hole 2: +1"
 * ran through the dots of holes 3 and 4. The axis and the label now follow the words' size; a desk's 12 is as it was.
 */
describe('the running score on a phone: the axis clears hole 1 and the label clears the line', () => {
  it('the score labels end a 0.75em gap short of hole 1, and none runs off the left', () => {
    drawnAt(34);
    const { dots, ticks } = chart();
    const hole1 = dots[0]!.x;
    for (const t of ticks) {
      const right = Number(t.getAttribute('x'));
      expect(hole1 - right).toBeGreaterThanOrEqual(0.75 * 34);
      expect(right - (t.textContent ?? '').length * 34 * 0.62).toBeGreaterThanOrEqual(0);
    }
  });

  it('the rows a phone shows stand at least 1.25em apart (every other one gives way)', () => {
    drawnAt(34);
    const { ticks } = chart();
    const shown = ticks.filter((t) => !t.classList.contains('ch-rzsvg__alt')).map((t) => Number(t.getAttribute('y')));
    expect(shown.length).toBeGreaterThanOrEqual(2);
    expect(shown).toContain(Number(ticks.find((t) => t.textContent === 'E')!.getAttribute('y')));
    for (let i = 1; i < shown.length; i++) expect(Math.abs(shown[i]! - shown[i - 1]!)).toBeGreaterThanOrEqual(1.25 * 34);
  });

  it('the costliest hole’s label covers no dot', () => {
    drawnAt(34);
    const { dots, worst } = chart();
    expect(worst).toBeDefined();
    const x = Number(worst!.getAttribute('x'));
    const y = Number(worst!.getAttribute('y'));
    const w = (worst!.textContent ?? '').length * 34 * 0.55;
    const left = worst!.getAttribute('text-anchor') === 'end' ? x - w : worst!.getAttribute('text-anchor') === 'middle' ? x - w / 2 : x;
    for (const d of dots) {
      const clear = d.x + 9 <= left || d.x - 9 >= left + w || d.y + 9 <= y - 0.72 * 34 || d.y - 9 >= y + 0.22 * 34;
      expect(clear, `dot at ${d.x},${d.y}`).toBe(true);
    }
  });

  it('on a desk the axis and the label are where they were: 52, 14 to the left, 30 under the dot', () => {
    drawnAt(12);
    const { dots, ticks, worst } = chart();
    expect(dots[0]!.x).toBe(52);
    for (const t of ticks) expect(Number(t.getAttribute('x'))).toBe(52 - 14);
    const worstN = Number(/^Hole (\d+)/.exec(worst!.textContent ?? '')![1]);
    const dot = dots[r.holes.findIndex((h) => h.n === worstN)]!;
    expect(Number(worst!.getAttribute('y'))).toBe(dot.y + 30);
  });

  it('flips over the dot when under it would cross the line', () => {
    // A dot with the line falling away under it to the right: under is crossed, over is clear.
    const pts = [
      { x: 100, y: 100 },
      { x: 140, y: 100 },
      { x: 180, y: 140 },
      { x: 220, y: 160 },
    ];
    const at = worstPlace({ at: 140, dotY: 100, text: 'Hole 2: +1', fs: 34, pts, x0: 75, x1: 690, foot: 300 });
    expect(at.y).toBeLessThan(100);
  });
});
