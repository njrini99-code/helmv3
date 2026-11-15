/**
 * The iPhone's Text Size as Clubhouse's type scale (P008-C1), as plain maths: lib/dynamic-type.ts reads it on the client and
 * TypeScaleScript stamps it before first paint, so both must give the same value for the same reading. Server-safe (no
 * 'use client'): the root layout builds the boot script from these.
 */

/** iOS's body size at the default Text Size (`-apple-system-body`). */
export const DEFAULT_BODY_PX = 17;
/** The largest step followed (XXL); larger sizes cap here. */
export const MAX_BODY_PX = 23;

/**
 * A body size read from `-apple-system-body` as a scale: null at or under the default (or unreadable), else up to XXL.
 * Text Size is followed upward only (F-0014, CR-03: phone text is never under 12px, and 12 is a step): any scale under 1
 * draws the 12 step under 12px. A smaller setting once followed down to 14px (x14/17 = 0.824) drew the 12, 13 and 14
 * steps at 9.9, 10.7 and 11.5px; a Mac's WebKit under a touch emulation (13px body) took the same path.
 */
export function typeScaleFor(bodyPx: number): number | null {
  if (!Number.isFinite(bodyPx) || bodyPx <= DEFAULT_BODY_PX) return null;
  return Math.min(MAX_BODY_PX / DEFAULT_BODY_PX, bodyPx / DEFAULT_BODY_PX);
}

/** The value written to `--ch-type-scale`, to three places. */
export function typeScaleValue(scale: number): string {
  return String(Math.round(scale * 1000) / 1000);
}
