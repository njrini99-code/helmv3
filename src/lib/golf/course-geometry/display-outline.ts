import type { LocalFeature, PointM } from './types';
import { inRing, ringArea, segmentsIntersect, simpleRing } from './spatial';

const cache = new WeakMap<LocalFeature, LocalFeature>();
export const DISPLAY_EDGE_LIMIT_M = .5;
function distanceToSegment(p: PointM, a: PointM, b: PointM): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export function boundaryDistance(p: PointM, ring: readonly PointM[]): number {
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) best = Math.min(best, distanceToSegment(p, ring[i - 1]!, ring[i]!));
  return best;
}
function tidyRing(ring: PointM[]): PointM[] {
  const sampled: PointM[] = [];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1]!, b = ring[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .8));
    if (sampled.length + steps > 1800) return ring;
    for (let j = 0; j < steps; j++) sampled.push([a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps]);
  }
  if (sampled.length > 1800) return ring; // Bounded preparation work.
  const smoothed = sampled.map((p, i): PointM => {
    const prev = sampled[(i + sampled.length - 1) % sampled.length]!, next = sampled[(i + 1) % sampled.length]!;
    return [(prev[0] + 2 * p[0] + next[0]) / 4, (prev[1] + 2 * p[1] + next[1]) / 4];
  });
  smoothed.push(smoothed[0]!);
  // The corner-cut lies within .4m of its original vertex (two <=.8m
  // edges at weight 1/4). Bidirectional checks also protect narrow necks.
  if (Math.abs(ringArea(smoothed) / ringArea(ring) - 1) > .015 || !simpleRing(smoothed) ||
    smoothed.some(p => boundaryDistance(p, ring) > DISPLAY_EDGE_LIMIT_M) ||
    ring.some(p => boundaryDistance(p, smoothed) > DISPLAY_EDGE_LIMIT_M)) return ring;
  return smoothed;
}
function ringsCross(a: PointM[], b: PointM[]) {
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) if (segmentsIntersect(a[i - 1]!, a[i]!, b[j - 1]!, b[j]!)) return true;
  return false;
}
/** Reviewed display cleanup only. Canonical coordinates/anchors stay intact.
 * Smooths small trace steps, never a free spline or independent feature scale.
 * Polygon interiors, components and narrow shapes retain a topology fallback. */
export function displayOutline(feature: LocalFeature): LocalFeature {
  if (!['fairway', 'green', 'bunker'].includes(feature.kind)) return feature;
  const cached = cache.get(feature);
  if (cached) return cached;
  const parts = feature.parts.map(rings => rings.map(tidyRing));
  const rings = parts.flat();
  const invalid = parts.some(component => component.slice(1).some(hole => !inRing(hole[0]!, component[0]!))) ||
    rings.some((ring, i) => rings.slice(i + 1).some(other => ringsCross(ring, other)));
  const cleaned = invalid ? feature : { ...feature, parts };
  cache.set(feature, cleaned);
  return cleaned;
}
