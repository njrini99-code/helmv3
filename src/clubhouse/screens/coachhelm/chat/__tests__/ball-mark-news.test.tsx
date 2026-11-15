// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BallMark } from '../BallMark';

/**
 * MAC-15 / H393-007 (production audit 2026-11-15): the ball's rings play once when it arrives and once more on news, then
 * rest. The CSS plays them once per element (`ch-ball-ripple ... 1`), so news is drawn as new ring elements and nothing
 * else is: the same news, or a re-render, keeps the rings that have already played.
 */
describe('BallMark rings', () => {
  const rings = (c: HTMLElement) => [...c.querySelectorAll('.ch-ball__rip')];

  it('news draws the rings again; a re-render with the same news does not', () => {
    const { container, rerender } = render(<BallMark state="rest" news="idle" />);
    const first = rings(container);
    expect(first).toHaveLength(2);

    rerender(<BallMark state="rest" news="idle" />);
    expect(rings(container)).toEqual(first);
    expect(rings(container).every((r, i) => r === first[i])).toBe(true);

    rerender(<BallMark state="rest" news="working" />);
    const next = rings(container);
    expect(next).toHaveLength(2);
    expect(next.some((r) => first.includes(r))).toBe(false);
  });

  it('only a ball at rest has rings', () => {
    expect(rings(render(<BallMark state="still" />).container)).toHaveLength(0);
    expect(rings(render(<BallMark state="thinking" />).container)).toHaveLength(0);
  });
});
