import { describe, expect, it, vi } from 'vitest';
import { CH_DUR_MS, CH_FADE_MS, CH_MS, CH_SPRINGS, chSpringAt, chSpringCurve } from '../../../../lib/motion';
import { FADE_MS, KEYBOARD_EASE, KEYBOARD_MS, layoutEnd, msAnimate, springScroll } from '../messages-motion';
import * as beats from '../messages-beats';
import { HOUSE_EASE, JUMP_FAR, JUMP_SCALE, PILL_GAP, PILL_HIDE_MS, SEND_KEY_SCALE_FROM, playArrowLeave, playReceiptFade, receiptDelayAfter } from '../messages-beats';
import { pillRead } from '../../thread-v2';

const node = () => {
  const el = document.createElement('div');
  (el as unknown as { animate: unknown }).animate = vi.fn(() => ({ currentTime: 0 }));
  return el;
};
const calls = (el: HTMLElement) => (el.animate as unknown as ReturnType<typeof vi.fn>).mock.calls as [Keyframe[], KeyframeAnimationOptions][];

/** MOTION.md, one assertion group per MOT id the package builds. */
describe('MOT-SPR: the springs Messages still rides, through the app curve', () => {
  it.each([
    ['smooth', 0.26, 0, 462],
    // Production audit 2026-11-15 (S3.1, MOT-08): bounce 0 on every tap-opened surface, so settle is the smooth spring.
    ['settle', 0.26, 0, 462],
    ['reveal', 0.52, 0, 921],
  ] as const)('%s is %s visual / %s bounce, %s ms by chSpringCurve', (kind, visual, bounce, ms) => {
    expect(CH_SPRINGS[kind]).toEqual({ visualDuration: visual, bounce });
    expect(chSpringCurve(kind).ms).toBe(ms);
    expect(chSpringCurve(kind).linear).toMatch(/^linear\(/);
    let high = 0;
    for (let t = 0; t <= 1.5; t += 0.001) high = Math.max(high, chSpringAt(kind, t));
    expect(high - 1).toBeLessThanOrEqual(0);
  });

  it('MOTION-AND-VISUAL 3.12 and 3.5: the send, launch and lift springs are gone, and with them the send flight', () => {
    for (const kind of ['send', 'launch', 'lift']) expect(kind in CH_SPRINGS, kind).toBe(false);
    for (const name of ['planSendRise', 'playSendRise', 'playFieldReturn', 'playReceiptRise', 'SEND_GHOST_ATTR', 'LAUNCH_RECEIPT_SHARE', 'FILL_EASE', 'ARROW_EASE']) {
      expect(name in beats, name).toBe(false);
    }
  });
});

describe('MOT-R: Reduce Motion', () => {
  it('R-1: an opacity motion is a linear crossfade of the shared length; one without opacity does not play', () => {
    const el = node();
    msAnimate(el, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], 'settle', { reduced: true });
    expect(calls(el)[0]).toEqual([[{ opacity: 0 }, { opacity: 1 }], expect.objectContaining({ duration: FADE_MS, easing: 'linear' })]);
    expect(FADE_MS).toBe(CH_FADE_MS);
    expect(msAnimate(node(), [{ transform: 'a' }, { transform: 'b' }], 'settle', { reduced: true })).toBeNull();
  });
  it('R-4: a spring scroll under Reduce Motion jumps at once', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollHeight', { value: 1000 });
    Object.defineProperty(el, 'clientHeight', { value: 400 });
    springScroll(el, 'end', 'reveal', true);
    expect(el.scrollTop).toBe(600);
    expect(layoutEnd(el)).toBe(600);
  });
  it('R-6: the arrow does not move, and the receipt appears', () => {
    expect(playArrowLeave(node(), true)).toBeNull();
    expect(playReceiptFade(node(), 0, true)).toBeNull();
  });
});

describe('MOT-KB-1 / MOT-SEND-1: the keyboard ride', () => {
  it('480 ms on the iOS curve', () => {
    expect(KEYBOARD_MS).toBe(480);
    expect(KEYBOARD_EASE).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
  });
});

describe('MOT-SEND-4: the send key', () => {
  it('springs in from 0.4', () => {
    expect(SEND_KEY_SCALE_FROM).toBe(0.4);
  });
});

/** MOTION-AND-VISUAL 3.5: a sent message is an insert (ui/ListPresence, useThreadMakeRoom); what is left of the send is the key and the receipt. */
describe('MOT-SEND-6 / -8: the send key and Delivered', () => {
  it('SEND-6: the arrow leaves 14 px up over the quick beat on ease-out (3.2: things leaving)', () => {
    const arrow = node();
    playArrowLeave(arrow, false);
    const [frames, opts] = calls(arrow)[0]!;
    expect(frames).toEqual([{ translate: '0 0', opacity: 1 }, { translate: '0 -14px', opacity: 0 }]);
    expect(opts).toMatchObject({ duration: CH_DUR_MS.quick, easing: HOUSE_EASE });
    expect(HOUSE_EASE).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
  });

  it('SEND-8: Delivered is late content: it crossfades in over the quick beat, in place, once the bubble has risen', () => {
    const rec = node();
    playReceiptFade(rec, receiptDelayAfter(0), false);
    const [frames, opts] = calls(rec)[0]!;
    expect(frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(opts).toMatchObject({ duration: CH_DUR_MS.quick, delay: CH_DUR_MS.base, fill: 'backwards' });
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
