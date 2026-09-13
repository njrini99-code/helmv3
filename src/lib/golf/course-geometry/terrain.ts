import { z } from 'zod';
import type { CourseGeometryPackage, HoleScene, PointM } from './types';
import { contextPoints, type CourseView } from './camera';

export type Point3M = readonly [number, number, number];
export type TerrainPreset = 'top' | 'terrain' | 'side';
export interface TerrainPose { pitch: number; yawOffset: number; exaggeration: number }
export const TERRAIN_PRESETS: Record<TerrainPreset, TerrainPose> = {
  top: { pitch: 90, yawOffset: 0, exaggeration: 1 },
  terrain: { pitch: 50, yawOffset: 0, exaggeration: 1.5 },
  side: { pitch: 20, yawOffset: 30, exaggeration: 1.5 },
};
const meshSchema = z.object({
  schemaVersion: z.literal(1), physicalHoleKey: z.string().min(1).max(100),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), geometryHash: z.string().regex(/^[a-f0-9]{64}$/),
  displayRevision: z.literal('bounded-outline-v1'), surfaceManifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.literal('source_candidate'), horizontalFrame: z.literal('wgs84-local-enu-v1'),
  originWgs84: z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]),
  verticalDatum: z.literal('NAVD88'), verticalUnits: z.literal('meters'),
  referenceElevationM: z.number().finite().min(-1000).max(9000),
  vertices: z.array(z.number().finite().min(-10000).max(10000)).min(9).max(180000),
  triangleFeatures: z.array(z.number().int().min(0).max(255)).min(1).max(20000),
  triangleMaterials: z.array(z.number().int().min(0).max(4)).min(1).max(20000),
  featureIds: z.array(z.string().min(1).max(100)).min(1).max(256),
  featureKinds: z.array(z.enum(['ground', 'woods', 'rough', 'water', 'fairway', 'tee', 'green', 'bunker'])).min(1).max(256),
  source: z.object({ provider: z.literal('USGS 3DEP'), title: z.string().max(300), url: z.string().url().max(2000),
    acquisitionStart: z.string().max(20), acquisitionEnd: z.string().max(20), nativeResolutionM: z.number().positive(),
    verticalAccuracyM: z.number().nonnegative().nullable(), registrationResidualM: z.number().nonnegative().nullable() }).passthrough(),
  limitations: z.array(z.string().max(300)).max(20),
});
/** XY is the existing course-local EN frame. Z is orthometric NAVD88 height,
 * NOT geocentric ENU Up or phone altitude. Rendering never feeds shot metrics. */
export type TerrainMesh = z.infer<typeof meshSchema>;
export function parseTerrainMesh(value: unknown, pkg: CourseGeometryPackage): TerrainMesh {
  const mesh = meshSchema.parse(value);
  const hole = pkg.holes.find(h => h.key === mesh.physicalHoleKey);
  if (!hole || mesh.geometryHash !== pkg.contentHash || mesh.originWgs84.some((v, i) => v !== pkg.originWgs84[i])) throw new Error('Terrain geometry version mismatch');
  if (mesh.vertices.length !== mesh.triangleFeatures.length * 9 || mesh.triangleMaterials.length !== mesh.triangleFeatures.length || mesh.featureIds.length !== mesh.featureKinds.length ||
    new Set(mesh.featureIds).size !== mesh.featureIds.length || mesh.triangleFeatures.some(i => i >= mesh.featureIds.length)) throw new Error('Invalid terrain topology');
  mesh.featureIds.forEach((id, i) => {
    if (id === 'terrain-context' && mesh.featureKinds[i] === 'ground') return;
    if (!hole.featureIds.includes(id) || pkg.features.find(f => f.id === id)?.kind !== mesh.featureKinds[i]) throw new Error('Invalid terrain surface association');
  });
  for (let i = 0; i < mesh.vertices.length; i += 9) {
    const v = mesh.vertices;
    if (Math.abs((v[i + 3]! - v[i]!) * (v[i + 7]! - v[i + 1]!) - (v[i + 6]! - v[i]!) * (v[i + 4]! - v[i + 1]!)) < 1e-10) throw new Error('Degenerate terrain triangle');
  }
  return mesh;
}

/** Interpolate the same compiled triangle rendered by the GPU. Unknown stays null. */
export function terrainHeight(mesh: TerrainMesh, [x, y]: PointM): number | null {
  if (![x, y].every(Number.isFinite)) return null;
  const v = mesh.vertices;
  for (let i = 0; i < v.length; i += 9) {
    const ax = v[i]!, ay = v[i + 1]!, bx = v[i + 3]!, by = v[i + 4]!, cx = v[i + 6]!, cy = v[i + 7]!;
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-10) continue;
    const a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
    const b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
    if (a >= -1e-6 && b >= -1e-6 && a + b <= 1 + 1e-6) return a * v[i + 2]! + b * v[i + 5]! + (1 - a - b) * v[i + 8]!;
  }
  return null;
}

export interface TerrainCamera {
  right: Point3M; up: Point3M; forward: Point3M;
  referenceElevationM: number; exaggeration: number; scale: number;
  translation: PointM; matrix: readonly number[]; pitch: number; yawOffset: number;
}
export function terrainBasis(angle: number, pitch: number) {
  const p = pitch * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  // Analytic basis stays defined at exactly 90 degrees (cross(worldUp, forward) would not).
  return { right: [c, -s, 0] as Point3M,
    up: [s * Math.sin(p), c * Math.sin(p), Math.cos(p)] as Point3M,
    forward: [s * Math.cos(p), c * Math.cos(p), -Math.sin(p)] as Point3M };
}
function cameraComponents(point: Point3M, camera: Pick<TerrainCamera, 'right' | 'up' | 'forward' | 'referenceElevationM' | 'exaggeration'>): Point3M {
  const p = [point[0], point[1], (point[2] - camera.referenceElevationM) * camera.exaggeration];
  return [camera.right, camera.up, camera.forward].map(axis => axis.reduce((n, v, i) => n + v * p[i]!, 0)) as unknown as Point3M;
}
export function projectTerrainPoint(point: Point3M, camera: TerrainCamera): Point3M {
  const [x, y, depth] = cameraComponents(point, camera);
  return [camera.translation[0] + x * camera.scale, camera.translation[1] - y * camera.scale, depth];
}
const fitPoints = new WeakMap<TerrainMesh, Map<CourseView, Point3M[]>>();
const orientations = new WeakMap<TerrainMesh, Map<string, number>>();
function wholeHoleOrientation(scene: HoleScene, mesh: TerrainMesh, points: readonly Point3M[], width: number, height: number): number {
  let cache = orientations.get(mesh);
  if (!cache) { cache = new Map(); orientations.set(mesh, cache); }
  const key = `${width}:${height}`;
  const cached = cache.get(key);
  if (cached != null) return cached;
  const route = scene.features.find(f => f.id === scene.hole.routeFeatureId)?.parts[0]?.[0];
  if (!route || route.length < 2) return scene.orientationRadians;
  const first = route[0]!, last = route.at(-1)!;
  const up = Math.PI / 2 - Math.atan2(last[1] - first[1], last[0] - first[0]);
  let best = 0, angle = up;
  // Fit the default Terrain preset once per viewport. Keep this base bearing
  // throughout orbit; never turn an automatic fit into a counter-rotation.
  for (let degrees = -44; degrees <= 0; degrees += 2) {
    const candidate = up + degrees * Math.PI / 180;
    const basis = { ...terrainBasis(candidate, 50), referenceElevationM: mesh.referenceElevationM, exaggeration: 1.5 };
    const projected = points.map(p => cameraComponents(p, basis));
    const xs = projected.map(p => p[0]), ys = projected.map(p => p[1]);
    const scale = Math.min((width - 48) / Math.max(.01, Math.max(...xs) - Math.min(...xs)),
      (height - 48) / Math.max(.01, Math.max(...ys) - Math.min(...ys)));
    if (scale > best) { best = scale; angle = candidate; }
  }
  if (cache.size >= 16) cache.clear();
  cache.set(key, angle);
  return angle;
}
export function fitTerrainCamera(scene: HoleScene, mesh: TerrainMesh, view: CourseView, width: number, height: number,
  pose: TerrainPose, zoom = 1, pan: PointM = [0, 0]): TerrainCamera {
  if (![width, height, pose.pitch, pose.yawOffset, pose.exaggeration, zoom, ...pan].every(Number.isFinite) ||
    width <= 48 || height <= 48 || pose.pitch < 20 || pose.pitch > 90 || Math.abs(pose.yawOffset) > 45 ||
    pose.exaggeration < 1 || pose.exaggeration > 1.5 || zoom < 1 || zoom > 4) throw new Error('Invalid terrain camera');
  let cache = fitPoints.get(mesh);
  if (!cache) { cache = new Map(); fitPoints.set(mesh, cache); }
  let points = cache.get(view);
  if (!points) {
    points = contextPoints(scene, view).map(p => {
      const z = terrainHeight(mesh, p);
      if (z == null) throw new Error('Missing elevation in requested view');
      return [p[0], p[1], z] as Point3M;
    });
    cache.set(view, points);
  }
  const angle = view === 'hole' ? wholeHoleOrientation(scene, mesh, points, width, height) : scene.orientationRadians;
  const basis = { ...terrainBasis(angle + pose.yawOffset * Math.PI / 180, pose.pitch),
    referenceElevationM: mesh.referenceElevationM, exaggeration: pose.exaggeration };
  const projected = points.map(p => cameraComponents(p, basis));
  const xs = projected.map(p => p[0]), ys = projected.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min((width - 48) / Math.max(.01, maxX - minX), (height - 48) / Math.max(.01, maxY - minY)) * zoom;
  const translation: PointM = [width / 2 - (minX + maxX) / 2 * scale + pan[0], height / 2 + (minY + maxY) / 2 * scale + pan[1]];
  const { right: r, up: u, forward: f, exaggeration: ez, referenceElevationM: ref } = basis;
  const sx = 2 * scale / width, sy = 2 * scale / height, dz = 10000;
  // Column-major WebGL matrix, identical to projectTerrainPoint. Lower depth is nearer.
  const matrix = [sx*r[0], sy*u[0], f[0]/dz, 0, sx*r[1], sy*u[1], f[1]/dz, 0,
    sx*r[2]*ez, sy*u[2]*ez, f[2]*ez/dz, 0,
    2*translation[0]/width-1-sx*r[2]*ez*ref, 1-2*translation[1]/height-sy*u[2]*ez*ref, -f[2]*ez*ref/dz, 1];
  return { ...basis, scale, translation, matrix, pitch: pose.pitch, yawOffset: pose.yawOffset };
}
