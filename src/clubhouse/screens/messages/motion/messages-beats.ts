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
  /** Where the new bubble comes to rest: its left and bottom, less whatever the thread's make-room glide holds it low by when measured. */
  bubble: { left: number; bottom: number };
  /** A text bubble (the words become the bubble); a file or poll also fades in. */
  text: boolean;
  /** This bubble's step behind the newest (0 = the newest) when several send at once. */
  step?: number;
}

export interface SendRisePlan {
  /** Vertical: `translateY(from) > 0` on the launch spring, in the page's own space. */
  y: { from: number; spring: 'launch'; ms: number; delayMs: number };
  /** Sideways: `translate from 0 > 0` over LAUNCH_X_SHARE of the launch time on the house ease, on the bubble inside the rising stack. */
  x: { from: number; ms: number; easing: string; delayMs: number };
  /** `scale .92 > 1` on pop from the bubble's lower left. */
  scale: { from: number; spring: 'pop'; origin: string; delayMs: number };
  /** A file or poll fades in over the fill beat, linear. */
  fade: { from: number; ms: number } | null;
  /** The words become the bubble: the filled bubble fades in under a ghost of the words in the field's ink, over the ink beat. */
  fill: { ms: number; easing: string } | null;
  /** The tail grows in over the pop spring plus a beat, held to 15%. */
  tail: { ms: number; hold: number; from: number } | null;
  /** MOT-SEND-8: Delivered rises after this long. */
  receiptDelayMs: number;
}

/** MOT-SEND-6, -7, -8: every number of the send flight in one pure place. */
export function planSendRise({ field, bubble, text, step = 0 }: SendRiseInput): SendRisePlan {
  const launch = chSpringCurve('launch');
  const delayMs = step * SEND_STAGGER.delayMs;
  return {
    y: { from: field.bottom - bubble.bottom - step * SEND_STAGGER.offsetPx, spring: 'launch', ms: launch.ms, delayMs },
    x: { from: field.left - 9 - bubble.left, ms: Math.round(launch.ms * LAUNCH_X_SHARE), easing: HOUSE_EASE, delayMs },
    scale: { from: SEND_SCALE_FROM, spring: 'pop', origin: '0% 100%', delayMs },
    fade: text ? null : { from: SEND_FADE_FROM, ms: CH_MS.fill },
    fill: text ? { ms: CH_MS.fillInk, easing: FILL_EASE } : null,
    tail: text ? { ms: chSpringCurve('pop').ms + TAIL_GROW.extraMs, hold: TAIL_GROW.hold, from: TAIL_GROW.from } : null,
    receiptDelayMs: Math.round(launch.ms * LAUNCH_RECEIPT_SHARE),
  };
}

/**
 * Play a send plan on the real bubble (the Q-19 fallback shape: no copy flies over the app, so MC-01, 02 and 11 have no
 * clone to teleport). Everything that moves is a transform or an opacity, one animation per property per element and never
 * additive, so the whole flight runs on the compositor while React and the send's request keep the main thread busy:
 *
 * - up: `carrier` (the row's stack) rises `plan.y.from > 0` on `launch`, in the page's own space. `counter` cancels the
 *   thread's make-room glide on this row alone, so the bubble follows the launch spring and nothing else: one rise, one
 *   soft landing, while everything above it glides up on `send`.
 * - sideways and the scale: the bubble itself, on the house ease over 62% of the launch time and on `pop` from its lower left.
 * - the words become the bubble: the bubble (green fill, light ink) fades in over the ink beat while a ghost of the same
 *   words in the field's ink, laid exactly over it, fades out. The words never leave the screen; the fill comes up under them.
 * - the tail grows in last.
 *
 * Reduce Motion is the launch spring's rule: the bubble crossfades in place. Returns the animations that started.
 */
export function playSendRise(
  bubble: HTMLElement,
  plan: SendRisePlan,
  opts: {
    reduced: boolean;
    tail?: HTMLElement | null;
    /** What carries the rise: the row's stack. Without one (a unit test, a bare bubble) the bubble carries it. */
    carrier?: HTMLElement | null;
    /** The thread's make-room glide, as it holds this row low at the first frame: cancelled on `el` with the same clock. */
    counter?: { el: HTMLElement; from: number; ms: number; easing: string } | null;
    /** The field's ink, for the ghost of the words. */
    ink?: string | null;
  },
): Animation[] {
  const out: Animation[] = [];
  const add = (a: Animation | null) => {
    if (a) out.push(a);
    return a;
  };
  if (opts.reduced) {
    add(msAnimate(bubble, [{ opacity: 0 }, { opacity: 1 }], 'launch', { reduced: true }));
    return out;
  }
  const carrier = opts.carrier ?? bubble;
  const delay = plan.y.delayMs;
  add(msAnimate(carrier, [{ transform: `translateY(${plan.y.from}px)` }, { transform: 'translateY(0px)' }], 'launch', { delay, fill: 'backwards' }));
  if (opts.counter && Math.abs(opts.counter.from) >= 1) {
    add(msAnimate(opts.counter.el, [{ transform: `translateY(${-opts.counter.from}px)` }, { transform: 'translateY(0px)' }], null, { timing: { ms: opts.counter.ms, easing: opts.counter.easing } }));
  }
  const side = (el: HTMLElement) => {
    el.style.transformOrigin = plan.scale.origin;
    add(msAnimate(el, [{ translate: `${plan.x.from}px 0` }, { translate: '0 0' }], null, { delay: plan.x.delayMs, fill: 'backwards', timing: { ms: plan.x.ms, easing: plan.x.easing } }));
    add(msAnimate(el, [{ scale: String(plan.scale.from) }, { scale: '1' }], 'pop', { delay: plan.scale.delayMs, fill: 'backwards' }));
  };
  side(bubble);
  if (plan.fade) add(msAnimate(bubble, [{ opacity: plan.fade.from }, { opacity: 1 }], null, { delay, fill: 'backwards', timing: { ms: plan.fade.ms, easing: 'linear' } }));
  if (plan.fill) {
    add(msAnimate(bubble, [{ opacity: 0 }, { opacity: 1 }], null, { delay, fill: 'backwards', timing: plan.fill }));
    if (opts.ink && carrier !== bubble) {
      const ghost = sendGhost(bubble, opts.ink);
      carrier.appendChild(ghost);
      side(ghost);
      const fade = add(msAnimate(ghost, [{ opacity: 1 }, { opacity: 0 }], null, { delay, fill: 'both', timing: plan.fill }));
      if (fade) fade.onfinish = fade.oncancel = () => ghost.remove();
      else ghost.remove();
    }
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
        { delay, fill: 'backwards', timing: { ms: t.ms, easing: HOUSE_EASE } },
      ),
    );
  }
  return out;
}

/** The mark a send's ghost carries, so nothing else mistakes it for a message. */
export const SEND_GHOST_ATTR = 'data-ch-send-ghost';

/**
 * The words as they sat in the field: the bubble's own box and type with no fill, no shadow and no tail, in the field's ink,
 * laid over the bubble inside its (relatively positioned) stack. Hidden from assistive tech and from every pointer.
 */
function sendGhost(bubble: HTMLElement, ink: string): HTMLElement {
  const ghost = bubble.cloneNode(true) as HTMLElement;
  for (const name of ['id', 'data-ch-bubble', 'tabindex', 'role']) ghost.removeAttribute(name);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute(SEND_GHOST_ATTR, '');
  ghost.querySelectorAll('svg').forEach((n) => n.remove());
  Object.assign(ghost.style, {
    position: 'absolute',
    left: `${bubble.offsetLeft}px`,
    top: `${bubble.offsetTop}px`,
    width: `${bubble.offsetWidth}px`,
    height: `${bubble.offsetHeight}px`,
    margin: '0',
    background: 'none',
    boxShadow: 'none',
    filter: 'none',
    outline: '0',
    color: ink,
    pointerEvents: 'none',
  });
  return ghost;
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

/**
 * MOT-SEND-8: how long Delivered still waits when it mounts `elapsedMs` after the send began. The receipt mounts when the
 * server confirms (DmReceipt renders nothing while pending), which can be late or early, so the 70% mark is counted from the
 * send, never from the mount: a slow confirm rises at once, a fast one waits for the bubble to land.
 */
export function receiptDelayAfter(elapsedMs: number): number {
  return Math.max(0, Math.round(chSpringCurve('launch').ms * LAUNCH_RECEIPT_SHARE) - Math.max(0, elapsedMs));
}

/** MOT-SEND-8: Delivered rises 4 px into place once the bubble has landed. Reduce Motion: it appears. */
export function playReceiptRise(receipt: HTMLElement, plan: Pick<SendRisePlan, 'receiptDelayMs'>, reduced: boolean): Animation | null {
  if (reduced) return null;
  return msAnimate(receipt, [{ translate: `0 ${RECEIPT_RISE_PX}px`, opacity: 0 }, { translate: '0 0', opacity: 1 }], null, { delay: plan.receiptDelayMs, fill: 'backwards', timing: { ms: CH_MS.receipt, easing: HOUSE_EASE } });
}
