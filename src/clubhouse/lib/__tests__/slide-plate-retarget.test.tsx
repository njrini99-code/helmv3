import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chSpringCurve } from '../motion';
import { useSlidePlate } from '../slide-plate';

/**
 * F-0017 (audit 2026-10-29): a second tap mid-glide started the plate from the old target and jumped 12.7 px. The new
 * glide starts from where the plate is now (the running move's live position), carrying its speed.
 */
type Played = { keyframes: Keyframe[]; options: KeyframeAnimationOptions; anim: { currentTime: number | null; playState: string; cancel: () => void } };
let played: Played[] = [];
let origAnimate: typeof HTMLElement.prototype.animate | undefined;
const X: Record<string, number> = { a: 0, b: 100, c: 200 };

beforeEach(() => {
  played = [];
  origAnimate = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = function (keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    const anim = { currentTime: 0 as number | null, playState: 'running', cancel: vi.fn() };
    played.push({ keyframes, options, anim });
    return anim as unknown as Animation;
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

function Pills({ chosen }: { chosen: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useSlidePlate(ref, '.plate', chosen, { kind: 'settle' });
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
const tx = (f: Keyframe) => Number(/translate\((-?[\d.]+)px/.exec(String(f.transform))![1]);

describe('the plate retargets from where it is (F-0017)', () => {
  it('a tap 80 ms into a glide starts the next glide at the live position, within 2 px', async () => {
    const { rerender } = render(<Pills chosen="a" />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    rerender(<Pills chosen="b" />);
    expect(played).toHaveLength(1);
    const first = played[0]!;
    first.anim.currentTime = 80;
    rerender(<Pills chosen="c" />);
    expect(played).toHaveLength(2);
    const { ease } = chSpringCurve('settle');
    const ms = Number(first.options.duration);
    const liveX = X.a + (X.b - X.a) * ease(80 / ms);
    const startX = X.c + tx(played[1]!.keyframes[0]!);
    expect(Math.abs(startX - liveX)).toBeLessThanOrEqual(2);
    expect(first.anim.cancel).toHaveBeenCalled();
  });
});
