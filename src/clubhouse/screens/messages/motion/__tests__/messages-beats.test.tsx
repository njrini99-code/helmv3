import { describe, expect, it, vi } from 'vitest';
import { CH_FADE_MS, CH_MS, CH_SPRINGS, chSpringCurve } from '../../../../lib/motion';
import { FADE_MS, KEYBOARD_EASE, KEYBOARD_MS, layoutEnd, msAnimate, springScroll } from '../messages-motion';
import {
  ARROW_EASE,
  FILL_EASE,
  HOUSE_EASE,
  JUMP_FAR,
  JUMP_SCALE,
  LAUNCH_RECEIPT_SHARE,
  LAUNCH_X_SHARE,
  PILL_GAP,
  PILL_HIDE_MS,
  SEND_KEY_SCALE_FROM,
  SEND_STAGGER,
  playArrowLeave,
  playFieldReturn,
  playReceiptRise,
  playSendRise,
  planSendRise,
} from '../messages-beats';
import { pillRead } from '../../thread-v2';

const node = () => {
  const el = document.createElement('div');
  (el as unknown as { animate: unknown }).animate = vi.fn(() => ({ currentTime: 0 }));
  return el;
};
const calls = (el: HTMLElement) => (el.animate as unknown as ReturnType<typeof vi.fn>).mock.calls as [Keyframe[], KeyframeAnimationOptions][];

/** MOTION.md, one assertion group per MOT id the package builds. */
describe('MOT-SPR: the seven springs through the app curve', () => {
  it.each([
    ['smooth', 0.26, 0, 462],
    ['settle', 0.26, 0.1, 417],
    ['reveal', 0.52, 0, 921],
    ['send', 0.42, 0.12, 700],
    ['launch', 0.5, 0.2, 812],
    ['pop', 0.25, 0.35, 496],
    ['lift', 0.28, 0.15, 471],
  ] as const)('%s is %s visual / %s bounce, %s ms by chSpringCurve', (kind, visual, bounce, ms) => {
    expect(CH_SPRINGS[kind]).toEqual({ visualDuration: visual, bounce });
    expect(chSpringCurve(kind).ms).toBe(ms);
    expect(chSpringCurve(kind).linear).toMatch(/^linear\(/);
  });
});

describe('MOT-R: Reduce Motion', () => {
  it('R-1: an opacity motion is a linear crossfade of the shared length; one without opacity does not play', () => {
    const el = node();
    msAnimate(el, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], 'pop', { reduced: true });
    expect(calls(el)[0]).toEqual([[{ opacity: 0 }, { opacity: 1 }], expect.objectContaining({ duration: FADE_MS, easing: 'linear' })]);
    expect(FADE_MS).toBe(CH_FADE_MS);
    expect(msAnimate(node(), [{ transform: 'a' }, { transform: 'b' }], 'pop', { reduced: true })).toBeNull();
  });
  it('R-4: a spring scroll under Reduce Motion jumps at once', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollHeight', { value: 1000 });
    Object.defineProperty(el, 'clientHeight', { value: 400 });
    springScroll(el, 'end', 'reveal', true);
    expect(el.scrollTop).toBe(600);
    expect(layoutEnd(el)).toBe(600);
  });
  it('R-6: the sent bubble crossfades in place, no flight, no clone', () => {
    const b = node();
    const plan = planSendRise({ field: { left: 20, bottom: 800 }, bubble: { left: 200, bottom: 700 }, held: 40, text: true });
    playSendRise(b, plan, { reduced: true });
    expect(calls(b)).toHaveLength(1);
    expect(calls(b)[0]![0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(playArrowLeave(node(), true)).toBeNull();
  });
});

describe('MOT-KB-1 / MOT-SEND-1: the keyboard ride', () => {
  it('480 ms on the iOS curve', () => {
    expect(KEYBOARD_MS).toBe(480);
    expect(KEYBOARD_EASE).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
  });
});

describe('MOT-SEND-4: the send key', () => {
  it('springs in from 0.4 on pop', () => {
    expect(SEND_KEY_SCALE_FROM).toBe(0.4);
  });
});

describe('MOT-SEND-6 / -7 / -8: the send flight', () => {
  const input = { field: { left: 40, bottom: 800 }, bubble: { left: 220, bottom: 700 }, held: 30, text: true } as const;

  it('SEND-7: up on launch (812 ms), sideways on the house ease over 62% of it, scale .92 on pop from the lower left', () => {
    const plan = planSendRise(input);
    expect(plan.y).toEqual({ from: 800 - 700 - 30, spring: 'launch', ms: 812, delayMs: 0 });
    expect(plan.x).toEqual({ from: 40 - 9 - 220, ms: Math.round(812 * LAUNCH_X_SHARE), easing: HOUSE_EASE, delayMs: 0 });
    expect(plan.x.ms).toBe(503);
    expect(plan.scale).toEqual({ from: 0.92, spring: 'pop', origin: '0% 100%', delayMs: 0 });
    expect(HOUSE_EASE).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
  });

  it('SEND-7: a file or poll also fades in from .6 over 150 ms; a text bubble does not', () => {
    expect(planSendRise({ ...input, text: false }).fade).toEqual({ from: 0.6, ms: CH_MS.fill });
    expect(planSendRise(input).fade).toBeNull();
  });

  it('SEND-7: several bubbles at once are delayed 40 ms and lifted 8 px a step', () => {
    const plan = planSendRise({ ...input, step: 2 });
    expect(plan.y.delayMs).toBe(2 * SEND_STAGGER.delayMs);
    expect(plan.y.from).toBe(800 - 700 - 30 - 2 * SEND_STAGGER.offsetPx);
  });

  it('SEND-6: the words become the bubble in 160 ms on the fill curve; the tail grows over pop + 60 ms, held to 15%', () => {
    const plan = planSendRise(input);
    expect(plan.fill).toEqual({ ms: 160, easing: FILL_EASE });
    expect(FILL_EASE).toBe('cubic-bezier(0.3, 0, 0.5, 1)');
    expect(plan.tail).toEqual({ ms: 496 + 60, hold: 0.15, from: 0.3 });
  });

  it('SEND-6: the arrow leaves 14 px up in 200 ms on its curve', () => {
    const arrow = node();
    playArrowLeave(arrow, false);
    const [frames, opts] = calls(arrow)[0]!;
    expect(frames).toEqual([{ translate: '0 0', opacity: 1 }, { translate: '0 -14px', opacity: 0 }]);
    expect(opts).toMatchObject({ duration: 200, easing: ARROW_EASE });
    expect(ARROW_EASE).toBe('cubic-bezier(0.4, 0, 0.9, 0.3)');
  });

  it('SEND-8: Delivered rises 4 px in 260 ms after 70% of launch (568 ms); the field fades back in 220 ms after 140 ms', () => {
    const plan = planSendRise(input);
    expect(plan.receiptDelayMs).toBe(Math.round(812 * LAUNCH_RECEIPT_SHARE));
    expect(plan.receiptDelayMs).toBe(568);
    const rec = node();
    playReceiptRise(rec, plan, false);
    expect(calls(rec)[0]![1]).toMatchObject({ duration: 260, delay: 568 });
    expect(playReceiptRise(node(), plan, true)).toBeNull();
    const field = node();
    playFieldReturn(field, false);
    expect(calls(field)[0]![1]).toMatchObject({ duration: 220, delay: 140, easing: 'linear' });
  });

  it('plays the vertical glide, the stacked sideways glide, the scale, the fill and the tail on the real bubble', () => {
    const b = node();
    const tail = node();
    const plan = planSendRise(input);
    playSendRise(b, plan, { reduced: false, tail, ink: { from: 'rgb(0,0,0)', to: 'rgb(255,255,255)', fill: 'rgb(21,90,57)' } });
    const c = calls(b);
    expect(c).toHaveLength(4);
    expect(c[0]![1]).toMatchObject({ duration: 812 });
    expect(c[1]![1]).toMatchObject({ duration: 503, composite: 'add' });
    expect(c[2]![1]).toMatchObject({ duration: 496 });
    expect(c[3]![1]).toMatchObject({ duration: 160 });
    expect(calls(tail)[0]![0].map((k) => k.offset)).toEqual([0, 0.15, 1]);
  });
});

describe('MOT-JMP: the jump key', () => {
  it('JMP-1: shows past 0.9 of the scroller above the end, scales in from .6 and leaves to .8 in 160 ms', () => {
    expect(JUMP_FAR).toBe(0.9);
    expect(JUMP_SCALE).toEqual({ from: 0.6, to: 0.8 });
    expect(CH_MS.fillInk).toBe(160);
  });
});

describe('MOT-THR-2 / MOT-X-1: the floating date pill', () => {
  const markers = [
    { top: -300, bottom: -280, label: 'Mon' },
    { top: -60, bottom: -40, label: 'Tue' },
    { top: 400, bottom: 420, label: 'Wed' },
  ];
  it('names the last day that has passed the pill and hides 1 s after the scroll stops', () => {
    expect(pillRead(markers, { top: 100, bottom: 126 }).label).toBe('Tue');
    expect(PILL_HIDE_MS).toBe(1000);
  });
  it('within PILL_GAP (20) of a marker it is linked and its opacity is near / 20, above or below', () => {
    expect(PILL_GAP).toBe(20);
    const near = pillRead([{ top: -10, bottom: 90, label: 'Tue' }], { top: 100, bottom: 126 });
    expect(near.linked).toBe(true);
    expect(near.opacity).toBe(0.5);
    const touching = pillRead([{ top: 90, bottom: 110, label: 'Tue' }], { top: 100, bottom: 126 });
    expect(touching.opacity).toBe(0);
    const below = pillRead([{ top: -50, bottom: -40, label: 'Mon' }, { top: 136, bottom: 150, label: 'Tue' }], { top: 100, bottom: 126 });
    expect(below.linked).toBe(true);
    expect(below.opacity).toBe(0.5);
    expect(pillRead(markers, { top: 100, bottom: 126 }).linked).toBe(false);
  });
  it('shows nothing before any day has passed', () => {
    expect(pillRead([{ top: 400, bottom: 420, label: 'Wed' }], { top: 100, bottom: 126 }).label).toBeNull();
  });
});
