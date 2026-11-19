import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSlidePlate } from '../slide-plate';

/**
 * F-29 (audit 2026-11-19): a plate gliding between options of different widths animates no layout property. A translate
 * carries it across and a rounded clip on its trailing edge shows the width between the two (a scale squashed its corners,
 * owner 2026-11-07; `width` laid the control out on every frame). Going to a narrower option it is widened once for the
 * glide and handed its own width back when the glide ends or is retargeted.
 */
type Played = { keyframes: Keyframe[]; options: KeyframeAnimationOptions; finish: () => void; cancelled: boolean };
let played: Played[] = [];
let origAnimate: typeof HTMLElement.prototype.animate | undefined;
const LEFT: Record<string, number> = { a: 0, b: 60, c: 200 };
const WIDTH: Record<string, number> = { a: 60, b: 140, c: 40 };
const LAYOUT = ['width', 'height', 'left', 'right', 'top', 'margin', 'padding', 'inset'];

beforeEach(() => {
  played = [];
  origAnimate = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = function (keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    let resolve: () => void = () => {};
    const finished = new Promise<void>((r) => (resolve = r));
    const row: Played = { keyframes, options, finish: () => resolve(), cancelled: false };
    played.push(row);
    return { currentTime: 0, playState: 'running', finished, cancel: () => (row.cancelled = true) } as unknown as Animation;
  } as never;
  // The plate fills its option: its width is the option's, as `.ch-seg__pill { inset: 0 }` is.
  const optionOf = (el: HTMLElement) => (el.dataset.k ? el : (el.parentElement as HTMLElement | null));
  for (const [prop, read] of [
    ['offsetLeft', (el: HTMLElement) => LEFT[el.dataset.k ?? ''] ?? 0],
    ['offsetTop', () => 0],
    ['offsetWidth', (el: HTMLElement) => WIDTH[optionOf(el)?.dataset.k ?? ''] ?? 0],
    ['offsetHeight', () => 32],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get(this: HTMLElement) { return read(this); } });
  }
});
afterEach(() => {
  cleanup();
  HTMLElement.prototype.animate = origAnimate!;
});

function Plate({ chosen }: { chosen: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useSlidePlate(ref, '.plate', chosen, { tween: 'thumb' });
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
const props = (k: Keyframe) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite'].includes(p));

describe('a plate between options of different widths', () => {
  it('to a wider option: a translate and a clip opening on its trailing edge, no layout property', async () => {
    const { rerender } = render(<Plate chosen="a" />);
    await settle();
    rerender(<Plate chosen="b" />);
    expect(played).toHaveLength(1);
    const [from, to] = played[0]!.keyframes;
    for (const k of [from!, to!]) expect(props(k).filter((p) => LAYOUT.includes(p))).toEqual([]);
    expect(from).toMatchObject({ transform: 'translate(-60px, 0px)', clipPath: 'inset(0px 80px 0px 0px round 0px)' });
    expect(to).toMatchObject({ transform: 'none', clipPath: 'inset(0px 0px 0px 0px round 0px)' });
    expect((document.querySelector('.plate') as HTMLElement).style.width).toBe('');
  });

  it('to a narrower option: widened once for the glide, its own width back when the glide ends', async () => {
    const { rerender } = render(<Plate chosen="b" />);
    await settle();
    rerender(<Plate chosen="c" />);
    const plate = document.querySelector('.plate') as HTMLElement;
    expect(plate.style.width).toBe('140px');
    const [from, to] = played[0]!.keyframes;
    expect(from).toMatchObject({ transform: 'translate(-140px, 0px)', clipPath: 'inset(0px 0px 0px 0px round 0px)' });
    expect(to).toMatchObject({ transform: 'none', clipPath: 'inset(0px 100px 0px 0px round 0px)' });
    await act(async () => {
      played[0]!.finish();
      await Promise.resolve();
    });
    expect(plate.style.width).toBe('');
    expect(played[0]!.cancelled).toBe(true);
  });

  it('same width: a translate alone', async () => {
    WIDTH.c = 60;
    const { rerender } = render(<Plate chosen="a" />);
    await settle();
    rerender(<Plate chosen="c" />);
    expect(played[0]!.keyframes.map(props)).toEqual([['transform'], ['transform']]);
    WIDTH.c = 40;
  });
});
