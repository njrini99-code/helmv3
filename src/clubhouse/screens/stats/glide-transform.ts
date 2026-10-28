/**
 * A chart mark glides by transform, not geometry (rubric H2; Area A request R7, visual pass 2026-10-28). The mark is laid
 * out once at its new place (`left`/`width` or `top`/`bottom` in the rail's %), and while `useGlide` runs, a transform maps
 * that final box onto the in-flight one, so no frame relayouts. At rest, under reduced motion and on first paint the
 * drawn geometry equals the final one and no transform is set.
 */

/** A span of the rail, in its % units, as [start, end]; the order is normalised, so a bar that changes side maps too. */
type Span = readonly [number, number];

const EPS = 1e-6;
const norm = ([a, b]: Span): Span => (a <= b ? [a, b] : [b, a]);

/**
 * The transform that draws a box laid out on `final` where `now` is, along one axis, with its origin at the box's start
 * (left or top). Undefined when they match, or when the final box has no length to scale from (it then simply snaps).
 */
export function spanTransform(axis: 'x' | 'y', final: Span, now: Span): string | undefined {
  const [fs, fe] = norm(final);
  const [ns, ne] = norm(now);
  const len = fe - fs;
  if (len < EPS || (Math.abs(ns - fs) < EPS && Math.abs(ne - fe) < EPS)) return undefined;
  const shift = ((ns - fs) / len) * 100;
  const scale = (ne - ns) / len;
  const A = axis === 'x' ? 'X' : 'Y';
  return `translate${A}(${shift}%) scale${A}(${scale})`;
}

/**
 * The transform for a point mark's slot (a box as big as the rail, holding the mark at its final place): the slot moves by
 * the distance still to travel, in the rail's own %. Undefined at rest.
 */
export function shiftTransform(axis: 'x' | 'y', final: number, now: number): string | undefined {
  if (Math.abs(now - final) < EPS) return undefined;
  return axis === 'x' ? `translateX(${now - final}%)` : `translateY(${now - final}%)`;
}
