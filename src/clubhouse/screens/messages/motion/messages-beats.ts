/**
 * Package B's numbers for the thread and the composer (MOTION.md MOT-SEND, MOT-JMP, MOT-THR), next to the shared module
 * (`messages-motion.ts`, whose API this only builds on). Every duration and easing here is named so no component carries a
 * literal.
 *
 * A sent message is an insert (MOTION-AND-VISUAL 3.5): it rises 8 px with its fade in over the base beat on the iOS curve
 * (ui/ListPresence), and the thread above it moves up to make room on the same beat and curve (useThreadMakeRoom). The send
 * flight it replaces (the launch and send springs, the sideways travel, the scale, the ghost of the words, the tail growing in
 * and the field fading back) is gone.
 */
import { CH_DUR_MS, CH_EASE } from '../../../lib/motion';
import { msAnimate } from './messages-motion';

const bezier = (p: readonly number[]) => `cubic-bezier(${p.join(', ')})`;
/** The house ease-out (`--ch-ease-out`) as a CSS easing string: things leaving. */
export const HOUSE_EASE = bezier(CH_EASE);
/** MOT-SEND-6: the arrow leaves the send key upward by this much. */
export const ARROW_RISE_PX = 14;
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

/** MOT-SEND-6: the arrow leaves the send key upward as the message goes, over the quick beat on ease-out (3.2, things leaving). Reduce Motion: no arrow motion. */
export function playArrowLeave(arrow: HTMLElement, reduced: boolean): Animation | null {
  if (reduced) return null;
  return msAnimate(arrow, [{ translate: '0 0', opacity: 1 }, { translate: `0 ${-ARROW_RISE_PX}px`, opacity: 0 }], null, { timing: { ms: CH_DUR_MS.quick, easing: HOUSE_EASE }, rd: null });
}

/**
 * MOT-SEND-8: how long Delivered still waits when it mounts `elapsedMs` after the send began. The receipt mounts when the
 * server confirms (DmReceipt renders nothing while pending), which can be late or early, so the wait is counted from the
 * send, never from the mount: a fast confirm waits for the bubble's rise (the base beat) to land, a slow one shows at once.
 */
export function receiptDelayAfter(elapsedMs: number): number {
  return Math.max(0, CH_DUR_MS.base - Math.max(0, elapsedMs));
}

/** MOT-SEND-8, 3.5: Delivered is late content: it crossfades in over the quick beat, in place, once the bubble has landed. Reduce Motion: it appears. */
export function playReceiptFade(receipt: HTMLElement, delayMs: number, reduced: boolean): Animation | null {
  if (reduced) return null;
  return msAnimate(receipt, [{ opacity: 0 }, { opacity: 1 }], null, { delay: delayMs, fill: 'backwards', timing: { ms: CH_DUR_MS.quick, easing: HOUSE_EASE } });
}
