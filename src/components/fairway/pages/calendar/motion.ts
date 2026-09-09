/**
 * Staggered list reveal for the calendar's `.enter` material class
 * (CalendarSurfaces.module.css). Each row starts 30ms after the previous
 * one, capped at 8 rows so a long agenda never waits on the animation.
 * Returns `undefined` for rows rendered alone so no inline style lands.
 * Reduced-motion users get nothing extra: the CSS sets `animation: none`,
 * and an unused delay is inert.
 */
export const ENTER_STAGGER_MS = 30;
export const ENTER_STAGGER_CAP = 8;

export function enterStyle(index?: number): React.CSSProperties | undefined {
  if (index === undefined) return undefined;
  return { animationDelay: `${Math.min(index, ENTER_STAGGER_CAP) * ENTER_STAGGER_MS}ms` };
}
