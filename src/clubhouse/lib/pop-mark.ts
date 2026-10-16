'use client';

/**
 * When the last Back or Forward happened (popstate), for the page it brings back: RouteFrame returns that page to where
 * it was scrolled, and useArrivalPainted renders all of it in its first frame, so the scroll has the height to land on.
 *
 * Capture, so the mark is set before the router's popstate listener: React commits a Back inside that listener, and a
 * bubbling listener (registered later, as this chunk loads after the router's) had not run yet when the page read it,
 * so every Back opened the page at its top (WebKit, Stats → player → Back, 6 of 6 runs, 2026-10-16).
 */
/** A page shown within this long of a Back or Forward is a return. */
export const CH_RETURN_WINDOW_MS = 1500;
let poppedAt = -Infinity;
if (typeof window !== 'undefined') window.addEventListener('popstate', () => (poppedAt = Date.now()), true);

/** Whether the page shown now is a return by Back or Forward. */
export function chReturning(): boolean {
  const since = Date.now() - poppedAt;
  // A mark ahead of the clock (the clock was set back) is no return.
  return since >= 0 && since < CH_RETURN_WINDOW_MS;
}
