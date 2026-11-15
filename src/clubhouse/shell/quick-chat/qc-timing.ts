/**
 * Quick chat's thresholds and timer lengths (QUICK-CHAT.md). Thresholds, not motions: every duration of a movement is a
 * token or a spring from lib/motion.ts.
 */
/** One beat: a consequence follows its cause by this much. The thread's own value (`chat/turn-timing.ts`), so the panel and the thread keep one time. */
export { BEAT_MS } from '../../screens/coachhelm/chat/turn-timing';
/** A second, for the hold's clock. */
export const SECOND_MS = 1_000;
/** The live pill says "Added" or "Needs your OK" this long, then returns to the key (07 M-LIVE-out). */
export const PILL_REST_MS = 1_800;
/** A card's first word after Confirm counts as this sitting's doing for this long (a task that saves with no hold). */
export const CONFIRM_FRESH_MS = 15_000;
/** A drag engages after this much travel, so a tap on the header is a tap. */
export const DRAG_SLOP_PX = 10;
/** Released past this share of the sheet's height, or faster than DRAG_FLING, the sheet closes; otherwise it returns. */
export const DRAG_CLOSE_SHARE = 0.3;
/** px per ms. */
export const DRAG_FLING = 0.5;
/** A finger still for this long before it lifts has no speed left to throw the sheet with. */
export const DRAG_REST_MS = 80;
/** Today's thread is read on warm; starts are held back this long after open so they cannot flash before a thread. */
export const RESTORE_GRACE_MS = 120;
