import type { LocalFeature, PointM } from './types';

/** Boundary counts as inside; holes in polygons are excluded. */
export function inRing([x, y]: PointM, ring: readonly PointM[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!, b = ring[i]!;
    const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
    if (Math.abs(cross) < 1e-9 && x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0]) &&
      y >= Math.min(a[1], b[1]) && y <= Math.max(a[1], b[1])) return true;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** Axis-aligned bounds of a point set, and a point's distance to them (0
 * inside). A box is never farther than any point it holds, so it is a safe
 * first test before a ring's own boundary distance; its square root can
 * round one ulp above `Math.hypot` of the same offsets, so callers that
 * compare it against a boundary distance leave that much slack. */
export interface PointBox { minX: number; minY: number; maxX: number; maxY: number }
export function pointBox(points: readonly PointM[]): PointBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return { minX, minY, maxX, maxY };
}
export function pointBoxDistance([x, y]: PointM, box: PointBox): number {
  const dx = Math.max(box.minX - x, 0, x - box.maxX), dy = Math.max(box.minY - y, 0, y - box.maxY);
  return Math.sqrt(dx * dx + dy * dy);
}
export function inFeature(point: PointM, feature: LocalFeature): boolean {
  return feature.type !== 'LineString' && feature.parts.some(rings =>
    !!rings[0] && inRing(point, rings[0]) && !rings.slice(1).some(r => inRing(point, r)));
}
export function ringArea(ring: readonly PointM[]): number {
  return Math.abs(ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2);
}
function cross(a: PointM, b: PointM, c: PointM): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
export function segmentsIntersect(a: PointM, b: PointM, c: PointM, d: PointM): boolean {
  const between = (p: PointM, q: PointM, r: PointM) => Math.abs(cross(p, q, r)) < 1e-9 &&
    r[0] >= Math.min(p[0], q[0]) && r[0] <= Math.max(p[0], q[0]) &&
    r[1] >= Math.min(p[1], q[1]) && r[1] <= Math.max(p[1], q[1]);
  return (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
    between(a, b, c) || between(a, b, d) || between(c, d, a) || between(c, d, b);
}
export function simpleRing(ring: readonly PointM[]): boolean {
  if (ring.length < 4 || ringArea(ring) < 0.001) return false;
  for (let i = 0; i < ring.length - 1; i++) {
    if (ring[i]![0] === ring[i + 1]![0] && ring[i]![1] === ring[i + 1]![1]) return false;
    for (let j = i + 2; j < ring.length - 1; j++) {
      if (i === 0 && j === ring.length - 2) continue;
      if (segmentsIntersect(ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!)) return false;
    }
  }
  return true;
}
