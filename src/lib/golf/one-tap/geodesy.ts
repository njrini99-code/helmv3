import type { CourseGeometryPackage, PositionWgs84 } from '../course-geometry/types';

/** One-tap coordinate engine (master plan "Coordinate engine"). WGS84 →
 * ECEF → local ENU about the course package's immutable origin. Every value
 * here is float64; the renderer receives float32 only after origin
 * subtraction (`toRenderFloat32`). The origin's ellipsoid height is not part
 * of any retained source, so it stays `UNSPECIFIED` and the frame is built
 * at height zero, exactly like the package projection `wgs84-local-enu-v1`.
 * The E/N axes therefore agree with `projectToLocal` to float precision. */
export const WGS84 = Object.freeze({ a: 6378137, f: 1 / 298.257223563, e2: 2 / 298.257223563 - 1 / 298.257223563 ** 2 });
export const UNSPECIFIED = 'UNSPECIFIED' as const;
export type Unspecified = typeof UNSPECIFIED;
export type Ecef = readonly [number, number, number];
export type Enu = readonly [number, number, number];
export type Wgs84Position3 = readonly [lon: number, lat: number, ellipsoidHeightM: number];
export interface LocalOrigin {
  lon: number;
  lat: number;
  ellipsoidHeightM: number | Unspecified;
  frame: 'wgs84-local-enu-v1';
}
const RAD = Math.PI / 180;

export function wgs84ToEcef([lon, lat, h]: Wgs84Position3): Ecef {
  if (![lon, lat, h].every(Number.isFinite) || Math.abs(lon) > 180 || Math.abs(lat) > 90) throw new Error('Invalid WGS84 coordinate');
  const phi = lat * RAD, lambda = lon * RAD, sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
  const n = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinPhi * sinPhi);
  return [(n + h) * cosPhi * Math.cos(lambda), (n + h) * cosPhi * Math.sin(lambda), (n * (1 - WGS84.e2) + h) * sinPhi];
}
/** Closed-form-then-refined inverse (Bowring start, three Newton steps: sub-millimetre for course extents). */
export function ecefToWgs84([x, y, z]: Ecef): Wgs84Position3 {
  const lambda = Math.atan2(y, x), p = Math.hypot(x, y);
  let phi = Math.atan2(z, p * (1 - WGS84.e2));
  for (let i = 0; i < 3; i++) {
    const sinPhi = Math.sin(phi), n = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinPhi * sinPhi);
    phi = Math.atan2(z + WGS84.e2 * n * sinPhi, p);
  }
  const sinPhi = Math.sin(phi), n = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinPhi * sinPhi);
  const h = Math.abs(Math.cos(phi)) > 1e-10 ? p / Math.cos(phi) - n : Math.abs(z) / Math.abs(sinPhi) - n * (1 - WGS84.e2);
  return [lambda / RAD, phi / RAD, h];
}
export function frameHeight(origin: LocalOrigin): number {
  return origin.ellipsoidHeightM === UNSPECIFIED ? 0 : origin.ellipsoidHeightM;
}
export function localOriginFor(pkg: Pick<CourseGeometryPackage, 'originWgs84' | 'projection'>, ellipsoidHeightM: number | Unspecified = UNSPECIFIED): LocalOrigin {
  if (pkg.projection !== 'wgs84-local-enu-v1') throw new Error('Unsupported package projection');
  return { lon: pkg.originWgs84[0], lat: pkg.originWgs84[1], ellipsoidHeightM, frame: 'wgs84-local-enu-v1' };
}
function rotation(origin: LocalOrigin) {
  const lon = origin.lon * RAD, lat = origin.lat * RAD;
  const sl = Math.sin(lon), cl = Math.cos(lon), sp = Math.sin(lat), cp = Math.cos(lat);
  return { e: [-sl, cl, 0] as const, n: [-sp * cl, -sp * sl, cp] as const, u: [cp * cl, cp * sl, sp] as const };
}
/** WGS84 (lon, lat, ellipsoid height) → local ENU metres. A `null` height is
 * evaluated on the ellipsoid frame surface and reported by the caller. */
export function wgs84ToEnu(point: readonly [number, number, number | null], origin: LocalOrigin): Enu {
  const p = wgs84ToEcef([point[0], point[1], point[2] ?? frameHeight(origin)]), o = wgs84ToEcef([origin.lon, origin.lat, frameHeight(origin)]);
  const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]] as const, r = rotation(origin);
  const dot = (v: readonly [number, number, number]) => v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
  const enu: Enu = [dot(r.e), dot(r.n), dot(r.u)];
  if (Math.hypot(enu[0], enu[1]) > 5000) throw new Error('Course extent exceeds 5 km local frame');
  return enu;
}
export function enuToWgs84([e, n, u]: Enu, origin: LocalOrigin): Wgs84Position3 {
  const o = wgs84ToEcef([origin.lon, origin.lat, frameHeight(origin)]), r = rotation(origin);
  return ecefToWgs84([o[0] + r.e[0] * e + r.n[0] * n + r.u[0] * u, o[1] + r.e[1] * e + r.n[1] * n + r.u[1] * u, o[2] + r.e[2] * e + r.n[2] * n + r.u[2] * u]);
}
export function positionWgs84(point: PositionWgs84): readonly [number, number, null] { return [point[0], point[1], null]; }
/** Render hand-off: float32 only after origin subtraction (the ENU values are
 * already origin-relative, so this is the one place precision is dropped). */
export function toRenderFloat32(points: readonly Enu[]): Float32Array {
  const out = new Float32Array(points.length * 3);
  points.forEach((p, i) => { out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2]; });
  return out;
}
