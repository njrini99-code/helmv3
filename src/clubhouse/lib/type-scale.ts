/**
 * The iPhone's Text Size as Clubhouse's type scale (P008-C1), as plain maths: lib/dynamic-type.ts reads it on the client and
 * TypeScaleScript stamps it before first paint, so both must give the same value for the same reading. Server-safe (no
 * 'use client'): the root layout builds the boot script from these.
 */

/** iOS's body size at the default Text Size (`-apple-system-body`). */
export const DEFAULT_BODY_PX = 17;
/** The smallest step followed: below it Clubhouse's 12px floor would break. */
export const MIN_BODY_PX = 14;
/** The largest step followed (XXL); larger sizes cap here. */
export const MAX_BODY_PX = 23;

/** A body size read from `-apple-system-body` as a scale: null at the default (or unreadable), else clamped to 14 to 23px. */
export function typeScaleFor(bodyPx: number): number | null {
  if (!Number.isFinite(bodyPx) || bodyPx === DEFAULT_BODY_PX) return null;
  return Math.max(MIN_BODY_PX / DEFAULT_BODY_PX, Math.min(MAX_BODY_PX / DEFAULT_BODY_PX, bodyPx / DEFAULT_BODY_PX));
}

/** The value written to `--ch-type-scale`, to three places. */
export function typeScaleValue(scale: number): string {
  return String(Math.round(scale * 1000) / 1000);
}
