'use client';

import { rubberBand } from './sheet-drag';

/**
 * Swipe row actions (C8, owner decision 14): the pure rules a list row follows when a finger drags it sideways to show
 * the actions behind it. `ui/SwipeRow.tsx` feeds it pointer positions and draws what it answers.
 *
 * A row moves 1:1 with the finger up to the full mark (60% of its width), then gives like a rubber band. On release it
 * lands where the throw would carry it: past the full mark it runs the side's action; past half an action's width it
 * stays open on the action; otherwise it closes.
 */

/** A drag claims the row only once it has gone this far, and only sideways (UIKit's hysteresis, WWDC18). */
export const SWIPE_CLAIM_PX = 10;
/** Each revealed action is this wide, as on iOS. */
export const SWIPE_ACTION_PX = 74;
/** Past this share of the row's width, letting go runs the side's action. */
export const SWIPE_FULL_SHARE = 0.6;
/** How far ahead of the finger a throw is read: the landing is offset + speed × this. */
export const SWIPE_PROJECT_MS = 200;

export type SwipeSide = 'leading' | 'trailing';
export type SwipeAxis = 'x' | 'y' | null;

/**
 * Which way a drag is going after (dx, dy) from where it started: null until it has gone `SWIPE_CLAIM_PX`, then 'x'
 * when it is more sideways than up or down, else 'y' (the list's scroll keeps it).
 */
export function swipeAxis(dx: number, dy: number): SwipeAxis {
  if (Math.hypot(dx, dy) < SWIPE_CLAIM_PX) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

/** The full mark for a row this wide, in pixels. */
export function swipeFullMark(width: number): number {
  return Math.max(SWIPE_ACTION_PX * 1.5, width * SWIPE_FULL_SHARE);
}

/**
 * Where the row sits for a finger `raw` pixels from where the drag took it (positive is toward the trailing edge's
 * opposite, so a leading swipe is positive). A side with no action stays shut; past the full mark the row gives.
 */
export function swipeOffset(raw: number, width: number, sides: { leading: boolean; trailing: boolean }): number {
  if (raw > 0 && !sides.leading) return 0;
  if (raw < 0 && !sides.trailing) return 0;
  const full = swipeFullMark(width);
  const mag = Math.abs(raw);
  const shown = mag <= full ? mag : full + rubberBand(mag - full);
  return Math.sign(raw) * shown;
}

/** Whether the row is past its full mark (armed: letting go here runs the action). */
export function swipeArmed(offset: number, width: number): boolean {
  return Math.abs(offset) >= swipeFullMark(width);
}

export type SwipeLanding = { kind: 'closed' } | { kind: 'open'; side: SwipeSide; offset: number } | { kind: 'full'; side: SwipeSide };

/**
 * Where a released row goes, from where it is (`offset`) and how fast it was moving (`speed`, px per ms, same sign as
 * the offset when moving outward).
 */
export function swipeLanding(offset: number, speed: number, width: number): SwipeLanding {
  if (offset === 0) return { kind: 'closed' };
  const side: SwipeSide = offset > 0 ? 'leading' : 'trailing';
  const landing = offset + speed * SWIPE_PROJECT_MS;
  // A throw back toward closed never runs the action, however far the row had gone.
  if (Math.sign(landing) !== Math.sign(offset)) return { kind: 'closed' };
  const mag = Math.abs(landing);
  if (mag >= swipeFullMark(width)) return { kind: 'full', side };
  if (mag >= SWIPE_ACTION_PX / 2) return { kind: 'open', side, offset: Math.sign(offset) * SWIPE_ACTION_PX };
  return { kind: 'closed' };
}
