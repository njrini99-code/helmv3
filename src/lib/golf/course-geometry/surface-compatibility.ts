import { inFeature } from './spatial';
import type { LocalFeature, PointM } from './types';

/** Mapped sand/water/green must not become fairway merely because a broad OSM
 * fairway polygon contains them. This is a display eligibility check, not a
 * repair of overlapping source geometry. Woods are not an inferred ball lie. */
const BLOCKERS: Partial<Record<LocalFeature['kind'], readonly LocalFeature['kind'][]>> = {
  fairway: ['bunker', 'water', 'green', 'tee'],
  rough: ['fairway', 'bunker', 'water', 'green', 'tee'],
  green: ['bunker', 'water'],
  bunker: ['green', 'water'],
  tee: ['green', 'bunker', 'water'],
};

function segmentDistance(point: PointM, a: PointM, b: PointM): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const t = length2 ? Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2)) : 0;
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}

/** Precompute immutable local bounds once per reconstruction/quality check.
 * Clearance lets an entire region cell avoid known incompatible surfaces. */
export function createSurfaceGuard(features: readonly LocalFeature[]) {
  const areas = features.filter(f => f.reviewed && f.type !== 'LineString' && f.kind !== 'woods').map(feature => {
    const points = feature.parts.flat(2), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return { feature, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  });
  return {
    clearance(point: PointM, kind: LocalFeature['kind'], maximum = Infinity): number {
      let limit = maximum;
      for (const area of areas) {
        if (!BLOCKERS[kind]?.includes(area.feature.kind)) continue;
        const dx = Math.max(area.minX - point[0], 0, point[0] - area.maxX);
        const dy = Math.max(area.minY - point[1], 0, point[1] - area.maxY);
        if (Math.hypot(dx, dy) > limit) continue;
        if (inFeature(point, area.feature)) return 0;
        for (const ring of area.feature.parts.flat()) for (let i = 1; i < ring.length; i++) {
          limit = Math.min(limit, segmentDistance(point, ring[i - 1]!, ring[i]!));
        }
      }
      return limit;
    },
  };
}
