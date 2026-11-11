/**
 * Quick chat's thresholds and timer lengths (QUICK-CHAT.md). Thresholds, not motions: every duration of a movement is a
 * token or a spring from lib/motion.ts.
 */
/** One beat: a consequence follows its cause by this much. The lead's `chat/turn-timing.ts` names the same value; import that one when it lands. */
export const BEAT_MS = 120;
/** A second, for the hold's clock. */
export const SECOND_MS = 1_000;
/** The live pill says "Added" or "Needs your OK" this long, then returns to the key (07 M-LIVE-out). */
export const PILL_REST_MS = 1_800;
/** A drag engages after this much travel, so a tap on the header is a tap. */
export const DRAG_SLOP_PX = 10;
/** Released past this share of the sheet's height, or faster than DRAG_FLING, the sheet closes; otherwise it returns. */
export const DRAG_CLOSE_SHARE = 0.3;
/** px per ms. */
export const DRAG_FLING = 0.5;
/** Today's thread is read on warm; starts are held back this long after open so they cannot flash before a thread. */
export const RESTORE_GRACE_MS = 120;
