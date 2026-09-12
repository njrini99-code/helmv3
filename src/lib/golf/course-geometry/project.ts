import type { PointM, PositionWgs84 } from './types';

/** WGS84 ellipsoid -> local east/north tangent plane at height zero.
 * Suitable for a bounded course (<5 km from origin); no terrain correction.
 * Keep original WGS84 alongside this derived display representation. */
function ecef([lon, lat]: PositionWgs84): readonly [number, number, number] {
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  const e2 = 6.6943799901413165e-3;
  const n = 6378137 / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  return [n * Math.cos(phi) * Math.cos(lambda), n * Math.cos(phi) * Math.sin(lambda),
    n * (1 - e2) * Math.sin(phi)];
}
export function projectToLocal(point: PositionWgs84, origin: PositionWgs84): PointM {
  if (![...point, ...origin].every(Number.isFinite) || Math.abs(point[0]) > 180 ||
    Math.abs(origin[0]) > 180 || Math.abs(point[1]) > 90 || Math.abs(origin[1]) > 90) {
    throw new Error('Invalid WGS84 coordinate');
  }
  const p = ecef(point), o = ecef(origin);
  const d = p.map((v, i) => v - o[i]!);
  const lon = origin[0] * Math.PI / 180, lat = origin[1] * Math.PI / 180;
  const local: PointM = [-Math.sin(lon) * d[0]! + Math.cos(lon) * d[1]!,
    -Math.sin(lat) * Math.cos(lon) * d[0]! - Math.sin(lat) * Math.sin(lon) * d[1]! + Math.cos(lat) * d[2]!];
  if (Math.hypot(...local) > 5000) throw new Error('Course extent exceeds 5 km local frame');
  return local;
}
export function rotate([x, y]: PointM, angle: number): PointM {
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
}
export interface SimilarityTransform {
  scale: number;
  angle: number;
  translation: PointM;
}
export function toScreen(point: PointM, transform: SimilarityTransform): PointM {
  const [x, y] = rotate(point, transform.angle);
  return [x * transform.scale + transform.translation[0], -y * transform.scale + transform.translation[1]];
}
export function fromScreen([x, y]: PointM, transform: SimilarityTransform): PointM {
  return rotate([(x - transform.translation[0]) / transform.scale,
    -(y - transform.translation[1]) / transform.scale], -transform.angle);
}
export function fitCamera(points: readonly PointM[], width: number, height: number, angle: number, padding = 16): SimilarityTransform {
  if (!points.length || ![width, height, angle, padding].every(Number.isFinite) ||
    padding < 0 || width <= 2 * padding || height <= 2 * padding) throw new Error('Invalid camera bounds');
  const rotated = points.map(p => rotate(p, angle));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of rotated) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Non-finite camera point');
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const dx = maxX - minX, dy = maxY - minY;
  if (dx === 0 && dy === 0) throw new Error('Degenerate camera bounds');
  const scale = Math.min(dx > 0 ? (width - padding * 2) / dx : Infinity,
    dy > 0 ? (height - padding * 2) / dy : Infinity);
  return { scale, angle, translation: [width / 2 - scale * (minX + maxX) / 2,
    height / 2 + scale * (minY + maxY) / 2] };
}
