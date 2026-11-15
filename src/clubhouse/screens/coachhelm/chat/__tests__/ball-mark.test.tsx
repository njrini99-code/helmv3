// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BallMark } from '../BallMark';

/**
 * MOTION-AND-VISUAL 3.1, 3.12 (owner, 15 Nov 2026), after MAC-15 / H393-007: the ball never ripples, at rest or on news.
 * Its one motion is the working indicator while it thinks: three waves of points of light on the working beat.
 */
/**
 * A beat's end on one wave. jsdom has no AnimationEvent, so the name is set on a plain event, and React may listen for the
 * prefixed name there, so both are sent.
 */
function beatEnds(el: Element) {
  for (const type of ['animationiteration', 'webkitAnimationIteration']) {
    const ev = new Event(type, { bubbles: true });
    Object.assign(ev, { animationName: 'ch-working' });
    act(() => {
      el.dispatchEvent(ev);
    });
  }
}

describe('BallMark', () => {
  it('draws no rings in any state', () => {
    for (const state of ['rest', 'still', 'thinking'] as const) {
      expect(render(<BallMark state={state} />).container.querySelectorAll('.ch-ball__rip')).toHaveLength(0);
    }
  });

  it('thinking draws three waves of points of light; rest draws none', () => {
    expect(render(<BallMark state="thinking" />).container.querySelectorAll('.ch-ball__dots')).toHaveLength(3);
    expect(render(<BallMark state="rest" />).container.querySelectorAll('.ch-ball__dots')).toHaveLength(0);
  });

  it('a ball that stops thinking finishes its beat: it rests when the first wave’s cycle ends', () => {
    const { container, rerender } = render(<BallMark state="thinking" />);
    rerender(<BallMark state="rest" />);
    // Still thinking until the beat ends.
    expect(container.querySelector('.ch-ball.is-thinking')).not.toBeNull();
    beatEnds(container.querySelector('.ch-ball__dots.is-c')!);
    expect(container.querySelector('.ch-ball.is-thinking')).not.toBeNull();
    beatEnds(container.querySelector('.ch-ball__dots.is-a')!);
    expect(container.querySelector('.ch-ball.is-rest')).not.toBeNull();
  });
});
