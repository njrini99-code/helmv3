import type { Point3M } from './terrain';

/** A fixed world-space light fit. Context tile corners are intentionally not
 * inputs: only useful receivers and nearby whole casting objects belong here. */
export function fitShadowBounds(points: readonly Point3M[], light: Point3M, mapSize = 2048) {
  if (!points.length || !points.every(p => p.every(Number.isFinite)) || mapSize <= 0) throw new Error('Invalid shadow bounds');
  const length = Math.hypot(...light), horizontal = Math.hypot(light[0], light[1]);
  if (length === 0 || horizontal === 0) throw new Error('Shadow light requires a horizontal direction');
  const axis: Point3M = [light[0] / length, light[1] / length, light[2] / length];
  const right: Point3M = [-light[1] / horizontal, light[0] / horizontal, 0];
  const up: Point3M = [-axis[2] * right[1], axis[2] * right[0], axis[0] * right[1] - axis[1] * right[0]];
  const dot = (p: Point3M, a: Point3M) => p[0] * a[0] + p[1] * a[1] + p[2] * a[2];
  const ranges = [right, up, axis].map(a => {
    let low = Infinity, high = -Infinity;
    for (const p of points) { const value = dot(p, a); low = Math.min(low, value); high = Math.max(high, value); }
    return [low - 2, high + 2] as const;
  });
  const widths = ranges.map(([lo, hi]) => Math.max(8, hi - lo));
  const centers = ranges.map(([lo, hi], i) => {
    const texel = widths[i]! / mapSize;
    return Math.round((lo + hi) / 2 / texel) * texel;
  });
  const center = [0, 1, 2].map(i => right[i]! * centers[0]! + up[i]! * centers[1]! + axis[i]! * centers[2]!) as unknown as Point3M;
  return { center, up, axis, width: widths[0]! + widths[0]! / mapSize * 2,
    height: widths[1]! + widths[1]! / mapSize * 2, depth: widths[2]! };
}
