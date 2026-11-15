import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CH_SPRING } from '../motion';
import { bezierEase, CH_THUMB, useSlidePlate } from '../slide-plate';

/**
 * MOT-X-2 / MOT-LIST-4: Messages' filter thumb slides for 360 ms on the overshooting CSS spring `(.34, 1.3, .64, 1)`,
 * and jumps under Reduce Motion.
 */
type Played = { keyframes: Keyframe[]; options: KeyframeAnimationOptions };
let played: Played[] = [];
let origAnimate: typeof HTMLElement.prototype.animate | undefined;
const X: Record<string, number> = { a: 0, b: 100, c: 200 };

beforeEach(() => {
  played = [];
  origAnimate = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = function (keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    played.push({ keyframes, options });
    return { currentTime: 0, playState: 'running', cancel: vi.fn() } as unknown as Animation;
  } as never;
  for (const [prop, read] of [
    ['offsetLeft', (el: HTMLElement) => X[el.dataset.k ?? ''] ?? 0],
    ['offsetTop', () => 0],
    ['offsetWidth', () => 80],
    ['offsetHeight', () => 32],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get(this: HTMLElement) { return read(this); } });
  }
});
afterEach(() => {
  cleanup();
  HTMLElement.prototype.animate = origAnimate!;
});

function Thumb({ chosen, reduced = false }: { chosen: string; reduced?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useSlidePlate(ref, '.plate', chosen, { tween: 'thumb', reduced });
  return (
    <div ref={ref}>
      {['a', 'b', 'c'].map((k) => (
        <span key={k} data-k={k}>
          {k === chosen && <i className="plate" />}
        </span>
      ))}
    </div>
  );
}

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 40))));

describe('the filter thumb', () => {
  it('is 360 ms on the (.34, 1.3, .64, 1) curve', async () => {
    const { rerender } = render(<Thumb chosen="a" />);
    await settle();
    rerender(<Thumb chosen="b" />);
    expect(played).toHaveLength(1);
    expect(played[0]!.options.duration).toBe(CH_THUMB.ms);
    expect(CH_THUMB.ms).toBe(360);
    expect(played[0]!.options.easing).toBe(`cubic-bezier(${CH_SPRING.join(', ')})`);
    // It starts where it was (the old option's left edge) and ends at rest.
    expect(played[0]!.keyframes[0]).toMatchObject({ transform: 'translate(-100px, 0px)' });
    expect(played[0]!.keyframes[1]).toMatchObject({ transform: 'none' });
  });

  it('overshoots once and settles: the curve passes 1 and ends on 1', () => {
    const ease = bezierEase(CH_SPRING);
    expect(ease(0)).toBeCloseTo(0, 3);
    expect(ease(1)).toBeCloseTo(1, 3);
    const samples = Array.from({ length: 100 }, (_, i) => ease((i + 1) / 100));
    expect(Math.max(...samples)).toBeGreaterThan(1.02);
    expect(Math.max(...samples)).toBeLessThan(1.1);
  });

  it('jumps under Reduce Motion', async () => {
    const { rerender } = render(<Thumb chosen="a" reduced />);
    await settle();
    rerender(<Thumb chosen="c" reduced />);
    expect(played).toHaveLength(0);
  });
});
