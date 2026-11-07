/**
 * Package B's numbers for the thread, the composer and the send flight (MOTION.md MOT-SEND, MOT-JMP, MOT-THR), next to
 * the shared module (`messages-motion.ts`, whose API this only builds on). Every duration and easing here is named so no
 * component carries a literal; `planSendRise` is the whole send flight as data, so the sampler and the unit test read
 * the same numbers the thread plays.
 */
import { CH_ARROW_EASE_POINTS, CH_EASE, CH_FILL_EASE_POINTS, CH_MS, chSpringCurve } from '../../../lib/motion';
import { msAnimate } from './messages-motion';

const bezier = (p: readonly number[]) => `cubic-bezier(${p.join(', ')})`;
/** The house ease-out (`--ch-ease`) as a CSS easing string, for the beats that are not springs. */
export const HOUSE_EASE = bezier(CH_EASE);
/** MOT-SEND-6: the fill and ink coming up under the words. */
export const FILL_EASE = bezier(CH_FILL_EASE_POINTS);
/** MOT-SEND-6: the arrow leaving the send key (200 ms, `CH_MS.arrow`). */
export const ARROW_EASE = bezier(CH_ARROW_EASE_POINTS);
/** MOT-SEND-6: the arrow leaves upward by this much. */
export const ARROW_RISE_PX = 14;
/** MOT-SEND-7: the sideways travel takes this share of the launch spring's time. */
export const LAUNCH_X_SHARE = 0.62;
/** MOT-SEND-8: Delivered rises after this share of the launch time (and takes `CH_MS.receipt`). */
export const LAUNCH_RECEIPT_SHARE = 0.7;
/** MOT-SEND-8: Delivered rises this far. */
export const RECEIPT_RISE_PX = 4;
/** MOT-SEND-7: several bubbles sent at once are delayed and offset one step each. */
export const SEND_STAGGER = { delayMs: 40, offsetPx: 8 } as const;
/** MOT-SEND-6: the tail grows from this scale, holds to this share of its time, and takes the pop spring plus `extraMs`. */
export const TAIL_GROW = { hold: 0.15, from: 0.3, extraMs: 60 } as const;
/** MOT-SEND-8: the field's placeholder fades back after this delay, over `CH_MS.field`. */
export const FIELD_RETURN_DELAY_MS = 140;
/** MOT-SEND-7: a file or poll also fades in from this opacity. */
export const SEND_FADE_FROM = 0.6;
/** MOT-SEND-7: the bubble starts a little small, from its lower left so the words stay put. */
export const SEND_SCALE_FROM = 0.92;
/** MOT-SEND-4: the send key springs in from this scale. */
export const SEND_KEY_SCALE_FROM = 0.4;
/** MOT-SEND-11: a typing bubble grows from this scale. */
export const TYPING_SCALE_FROM = 0.5;
/** MOT-JMP-1: the jump key scales in from the first and leaves to the second, in `CH_MS.fillInk`. */
export const JUMP_SCALE = { from: 0.6, to: 0.8 } as const;
/** MSG-210 / MOT-X-1: the floating date pill stays this far from a day marker, and fades out this long after the scroll stops. */
export const PILL_GAP = 20;
export const PILL_HIDE_MS = 1000;
/** MOT-THR-3: the drag for times follows the finger at this share, up to this many px at Text Size 1, locking after this many. */
export const DRAG_FOLLOW = 0.6;
export const DRAG_MAX_PX = 58;
export const DRAG_LOCK_PX = 8;
/** MSG-203: the thread pins to the bottom within this of it when the field grows (24) and when something arrives (60). */
export const PIN_PX = { grow: 24, arrive: 60 } as const;
/** MSG-211: the jump key shows once the reader is this share of the scroller's height above the end, and the count clears within `clear` px. */
export const JUMP_FAR = 0.9;
export const JUMP_CLEAR_PX = 8;

export interface SendRiseInput {
  /** Where the field's text sat: its left edge and bottom, in viewport px. */
  field: { left: number; bottom: number };
  /** Where the new bubble landed: its left and bottom. */
  bubble: { left: number; bottom: number };
  /** The list holds the rows this far low while it glides (useThreadMakeRoom), so the bubble subtracts it. */
  held: number;
  /** A text bubble (the words become the bubble); a file or poll also fades in. */
  text: boolean;
  /** This bubble's step behind the newest (0 = the newest) when several send at once. */
  step?: number;
}

export interface SendRisePlan {
  /** Vertical: `translate 0 from > 0` on the launch spring. */
  y: { from: number; spring: 'launch'; ms: number; delayMs: number };
  /** Sideways: `translate from 0 > 0` over LAUNCH_X_SHARE of the launch time on the house ease, added to the vertical glide. */
  x: { from: number; ms: number; easing: string; delayMs: number };
  /** `scale .92 > 1` on pop from the bubble's lower left. */
  scale: { from: number; spring: 'pop'; origin: string; delayMs: number };
  /** A file or poll fades in over the fill beat, linear. */
  fade: { from: number; ms: number } | null;
  /** The words become the bubble: the fill and the ink come up over the ink beat. */
  fill: { ms: number; easing: string } | null;
  /** The tail grows in over the pop spring plus a beat, held to 15%. */
  tail: { ms: number; hold: number; from: number } | null;
  /** MOT-SEND-8: Delivered rises after this long. */
  receiptDelayMs: number;
}

/** MOT-SEND-6, -7, -8: every number of the send flight in one pure place. */
export function planSendRise({ field, bubble, held, text, step = 0 }: SendRiseInput): SendRisePlan {
  const launch = chSpringCurve('launch');
  const delayMs = step * SEND_STAGGER.delayMs;
  return {
    y: { from: field.bottom - bubble.bottom - held - step * SEND_STAGGER.offsetPx, spring: 'launch', ms: launch.ms, delayMs },
    x: { from: field.left - 9 - bubble.left, ms: Math.round(launch.ms * LAUNCH_X_SHARE), easing: HOUSE_EASE, delayMs },
    scale: { from: SEND_SCALE_FROM, spring: 'pop', origin: '0% 100%', delayMs },
    fade: text ? null : { from: SEND_FADE_FROM, ms: CH_MS.fill },
    fill: text ? { ms: CH_MS.fillInk, easing: FILL_EASE } : null,
    tail: text ? { ms: chSpringCurve('pop').ms + TAIL_GROW.extraMs, hold: TAIL_GROW.hold, from: TAIL_GROW.from } : null,
    receiptDelayMs: Math.round(launch.ms * LAUNCH_RECEIPT_SHARE),
  };
}

/**
 * Play a send plan on a real bubble (the Q-19 fallback shape: the bubble itself rises, no clone, so MC-01, 02 and 11
 * cannot catch a clone teleporting). Reduce Motion is the launch spring's rule: the bubble crossfades in place.
 * Returns the animations that started.
 */
export function playSendRise(
  bubble: HTMLElement,
  plan: SendRisePlan,
  opts: { reduced: boolean; tail?: HTMLElement | null; ink?: { from: string; to: string; fill: string } | null },
): Animation[] {
  const out: Animation[] = [];
  const add = (a: Animation | null) => {
    if (a) out.push(a);
  };
  if (opts.reduced) {
    add(msAnimate(bubble, [{ opacity: 0 }, { opacity: 1 }], 'launch', { reduced: true }));
    return out;
  }
  bubble.style.transformOrigin = plan.scale.origin;
  add(msAnimate(bubble, [{ translate: `0 ${plan.y.from}px` }, { translate: '0 0' }], 'launch', { delay: plan.y.delayMs, fill: 'backwards' }));
  add(msAnimate(bubble, [{ translate: `${plan.x.from}px 0` }, { translate: '0 0' }], null, { composite: 'add', delay: plan.x.delayMs, fill: 'backwards', timing: { ms: plan.x.ms, easing: plan.x.easing } }));
  add(msAnimate(bubble, [{ scale: String(plan.scale.from) }, { scale: '1' }], 'pop', { delay: plan.scale.delayMs, fill: 'backwards' }));
  if (plan.fade) add(msAnimate(bubble, [{ opacity: plan.fade.from }, { opacity: 1 }], null, { delay: plan.y.delayMs, fill: 'backwards', timing: { ms: plan.fade.ms, easing: 'linear' } }));
  if (plan.fill && opts.ink) {
    add(msAnimate(bubble, [{ backgroundColor: 'transparent', color: opts.ink.from }, { backgroundColor: opts.ink.fill, color: opts.ink.to }], null, { delay: plan.y.delayMs, fill: 'backwards', timing: plan.fill }));
  }
  if (plan.tail && opts.tail) {
    const t = plan.tail;
    add(
      msAnimate(
        opts.tail,
        [
          { opacity: 0, scale: String(t.from), offset: 0 },
          { opacity: 0, scale: String(t.from), offset: t.hold },
          { opacity: 1, scale: '1', offset: 1 },
        ],
        null,
        { delay: plan.y.delayMs, fill: 'backwards', timing: { ms: t.ms, easing: HOUSE_EASE } },
      ),
    );
  }
  return out;
}

/** MOT-SEND-6: the arrow leaves the send key upward as the message goes (200 ms). Reduce Motion: no arrow motion. */
export function playArrowLeave(arrow: HTMLElement, reduced: boolean): Animation | null {
  if (reduced) return null;
  return msAnimate(arrow, [{ translate: '0 0', opacity: 1 }, { translate: `0 ${-ARROW_RISE_PX}px`, opacity: 0 }], null, { timing: { ms: CH_MS.arrow, easing: ARROW_EASE }, rd: null });
}

/** MOT-SEND-8: the field's placeholder fades back last (220 ms linear, after 140 ms). */
export function playFieldReturn(field: HTMLElement, reduced: boolean): Animation | null {
  return msAnimate(field, [{ opacity: 0 }, { opacity: 1 }], null, { delay: FIELD_RETURN_DELAY_MS, fill: 'backwards', reduced, timing: { ms: CH_MS.field, easing: 'linear' } });
}

/** MOT-SEND-8: Delivered rises 4 px into place once the bubble has landed. Reduce Motion: it appears. */
export function playReceiptRise(receipt: HTMLElement, plan: Pick<SendRisePlan, 'receiptDelayMs'>, reduced: boolean): Animation | null {
  if (reduced) return null;
  return msAnimate(receipt, [{ translate: `0 ${RECEIPT_RISE_PX}px`, opacity: 0 }, { translate: '0 0', opacity: 1 }], null, { delay: plan.receiptDelayMs, fill: 'backwards', timing: { ms: CH_MS.receipt, easing: HOUSE_EASE } });
}
