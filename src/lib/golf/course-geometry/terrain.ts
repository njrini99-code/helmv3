import { z } from 'zod';
import type { CourseGeometryPackage, HoleScene, PointM } from './types';
import { contextPoints, type CourseView } from './camera';
import { sampleMetricTerrain, terrainSourceFields } from './terrain-source';

export type Point3M = readonly [number, number, number];
/** Art-directed world-space light, shared by terrain and illustrative canopy. */
export const TERRAIN_LIGHT_DIRECTION: Point3M = [.4, -.45, .799];
export type TerrainPreset = 'top' | 'terrain' | 'side';
/** A baseline changes only on explicit preset/area selection. An interrupted
 * preset animation may retain its blend without refitting during the drag. */
export type TerrainFitProfile = TerrainPreset | {
  from: TerrainFitProfile; to: TerrainPreset; progress: number;
};
export interface TerrainPose { pitch: number; yawOffset: number; exaggeration: number }
export const TERRAIN_PRESETS: Record<TerrainPreset, TerrainPose> = {
  top: { pitch: 90, yawOffset: 0, exaggeration: 1 },
  terrain: { pitch: 50, yawOffset: 0, exaggeration: 1.5 },
  side: { pitch: 20, yawOffset: 30, exaggeration: 1.5 },
};
/** Bounded per-hole detail budget. The current format stores three XYZ
 * vertices per triangle; source normals use the identical component count. */
export const MAX_TERRAIN_TRIANGLES = 40_000;
export const MAX_TERRAIN_VERTEX_COMPONENTS = MAX_TERRAIN_TRIANGLES * 9;
const meshSchema = z.object({
  ...terrainSourceFields,
  schemaVersion: z.literal(1), physicalHoleKey: z.string().min(1).max(100),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), geometryHash: z.string().regex(/^[a-f0-9]{64}$/),
  displayRevision: z.literal('bounded-outline-v1'), surfaceManifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.literal('source_candidate'), horizontalFrame: z.literal('wgs84-local-enu-v1'),
  originWgs84: z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]),
  verticalDatum: z.literal('NAVD88'), verticalUnits: z.literal('meters'),
  referenceElevationM: z.number().finite().min(-1000).max(9000),
  vertices: z.array(z.number().finite().min(-10000).max(10000)).min(9).max(MAX_TERRAIN_VERTEX_COMPONENTS),
  triangleFeatures: z.array(z.number().int().min(0).max(255)).min(1).max(MAX_TERRAIN_TRIANGLES),
  triangleMaterials: z.array(z.number().int().min(0).max(4)).min(1).max(MAX_TERRAIN_TRIANGLES),
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
  const contextIds = mesh.contextFeatureIds ?? [];
  if (new Set(contextIds).size !== contextIds.length || contextIds.some(id => {
    const feature = pkg.features.find(candidate => candidate.id === id);
    return !feature || feature.kind === 'route';
  })) throw new Error('Invalid terrain context association');
  mesh.featureIds.forEach((id, i) => {
    if (id === 'terrain-context' && mesh.featureKinds[i] === 'ground') return;
    if ((!hole.featureIds.includes(id) && !contextIds.includes(id)) || pkg.features.find(f => f.id === id)?.kind !== mesh.featureKinds[i]) throw new Error('Invalid terrain surface association');
  });
  if (mesh.sourceNormals) {
    if (mesh.sourceNormals.length !== mesh.vertices.length) throw new Error('Invalid terrain source normals');
    for (let i = 0; i < mesh.sourceNormals.length; i += 3) {
      const [x, y, z] = mesh.sourceNormals.slice(i, i + 3) as [number, number, number];
      if (z <= 0 || Math.abs(Math.hypot(x, y, z) - 1) > .005) throw new Error('Invalid terrain source normals');
    }
  }
  for (let i = 0; i < mesh.vertices.length; i += 9) {
    const v = mesh.vertices;
    if (Math.abs((v[i + 3]! - v[i]!) * (v[i + 7]! - v[i + 1]!) - (v[i + 6]! - v[i]!) * (v[i + 4]! - v[i + 1]!)) < 1e-10) throw new Error('Degenerate terrain triangle');
  }
  return mesh;
}

/** Prefer the independent metric source grid when present. Its nodata stays
 * null; it must not be filled by a coarser display triangle. Legacy packages
 * without a source grid retain their compiled-triangle interpolation. */
export function terrainHeight(mesh: TerrainMesh, [x, y]: PointM): number | null {
  if (![x, y].every(Number.isFinite)) return null;
  if (mesh.metricGrid) return sampleMetricTerrain(mesh.metricGrid, [x, y]);
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
  /** Stable world-space orbit target; never a ball or pin observation. */
  focusM: Point3M;
  framing?: TerrainFramingMetadata;
}

export interface TerrainFramingMetadata {
  profile: TerrainPreset | 'blend';
  profileWeights: Readonly<Record<TerrainPreset, number>>;
  baselineHeadingRadians: number;
  baselineScale: number;
  /** Bounds in the fitted baseline camera plane, in meters. These are not
   * current-frame bounds after a user has deliberately orbited or panned. */
  tacticalBoundsM: { minX: number; maxX: number; minY: number; maxY: number };
  baselineBoundsPx: { x: number; y: number; width: number; height: number };
  occupancy: { width: number; height: number; area: number };
  orientationBasis: 'hole_route' | 'source_orientation';
  fitVersion: 'tactical-presets-v2';
}
export function terrainBasis(angle: number, pitch: number) {
  const p = pitch * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  // Analytic basis stays defined at exactly 90 degrees (cross(worldUp, forward) would not).
  return { right: [c, -s, 0] as Point3M,
    up: [s * Math.sin(p), c * Math.sin(p), Math.cos(p)] as Point3M,
    forward: [s * Math.cos(p), c * Math.cos(p), -Math.sin(p)] as Point3M };
}
function cameraComponents(point: Point3M, camera: Pick<TerrainCamera, 'right' | 'up' | 'forward' | 'referenceElevationM' | 'exaggeration'>): Point3M {
  const x = point[0], y = point[1], z = (point[2] - camera.referenceElevationM) * camera.exaggeration;
  const { right: r, up: u, forward: f } = camera;
  return [r[0] * x + r[1] * y + r[2] * z, u[0] * x + u[1] * y + u[2] * z, f[0] * x + f[1] * y + f[2] * z];
}
export function projectTerrainPoint(point: Point3M, camera: TerrainCamera): Point3M {
  const [x, y, depth] = cameraComponents(point, camera);
  return [camera.translation[0] + x * camera.scale, camera.translation[1] - y * camera.scale, depth];
}
const fitPoints = new WeakMap<TerrainMesh, Map<CourseView, Point3M[]>>();
const orientations = new WeakMap<TerrainMesh, Map<string, number>>();
interface TerrainFrame { angle: number; focusM: Point3M; scale: number; metadata: TerrainFramingMetadata }
const frames = new WeakMap<TerrainMesh, Map<string, TerrainFrame>>();
const FIT_PADDING = 24;
const PRESETS: readonly TerrainPreset[] = ['top', 'terrain', 'side'];

/** Tactical surfaces drive framing. Expanded terrain/woods/rough context can
 * extend well beyond the hole, but that display apron must never shrink it. */
function tacticalPoints(scene: HoleScene, view: CourseView): readonly PointM[] {
  const features = scene.features.filter(feature => feature.kind !== 'woods' && feature.kind !== 'rough');
  return contextPoints({ ...scene, features }, view);
}

function sourcePoints(scene: HoleScene, mesh: TerrainMesh, view: CourseView): Point3M[] {
  if (mesh.physicalHoleKey !== scene.physicalHoleKey || mesh.geometryHash !== scene.packageHash) throw new Error('Terrain geometry version mismatch');
  let cache = fitPoints.get(mesh);
  if (!cache) { cache = new Map(); fitPoints.set(mesh, cache); }
  let points = cache.get(view);
  if (!points) {
    points = tacticalPoints(scene, view).map(point => {
      const z = terrainHeight(mesh, point);
      if (z == null) throw new Error('Missing elevation in requested view');
      return [point[0], point[1], z] as Point3M;
    });
    cache.set(view, points);
  }
  return points;
}

function projectedBounds(points: readonly Point3M[], basis: Parameters<typeof cameraComponents>[1]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of points) {
    const [x, y] = cameraComponents(point, basis);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) throw new Error('Empty terrain context');
  return { minX, maxX, minY, maxY };
}
function fitScale(bounds: ReturnType<typeof projectedBounds>, width: number, height: number): number {
  return Math.min((width - FIT_PADDING * 2) / Math.max(.01, bounds.maxX - bounds.minX),
    (height - FIT_PADDING * 2) / Math.max(.01, bounds.maxY - bounds.minY));
}

function orientation(scene: HoleScene, points: readonly Point3M[], referenceElevationM: number,
  width: number, height: number, preset: TerrainPreset): number {
  const route = scene.features.find(f => f.id === scene.hole.routeFeatureId)?.parts[0]?.[0];
  const pose = TERRAIN_PRESETS[preset];
  if (!route || route.length < 2) return scene.orientationRadians - pose.yawOffset * Math.PI / 180;
  const first = route[0]!, last = route.at(-1)!;
  const upright = Math.PI / 2 - Math.atan2(last[1] - first[1], last[0] - first[0]);
  let bestScore = -Infinity, bestOffset = 0;
  // Explore both handednesses. A small upright preference resolves near-ties,
  // while all candidates preserve tee-to-green direction without reflection.
  // This search runs once per geometry, viewport and explicit preset.
  for (let offset = -70; offset <= 70; offset += 2) {
    const angle = upright + offset * Math.PI / 180;
    const basis = { ...terrainBasis(angle, pose.pitch), referenceElevationM, exaggeration: pose.exaggeration };
    const scale = fitScale(projectedBounds(points, basis), width, height);
    const score = scale * (1 - .012 * Math.abs(offset) / 70);
    if (score > bestScore + 1e-9 || Math.abs(score - bestScore) <= 1e-9 && Math.abs(offset) < Math.abs(bestOffset)) {
      bestScore = score; bestOffset = offset;
    }
  }
  return upright + (bestOffset - pose.yawOffset) * Math.PI / 180;
}

function wholeHoleOrientation(scene: HoleScene, mesh: TerrainMesh, width: number, height: number, preset: TerrainPreset): number {
  let cache = orientations.get(mesh);
  if (!cache) { cache = new Map(); orientations.set(mesh, cache); }
  const key = `${width}:${height}:${preset}`;
  const cached = cache.get(key);
  if (cached != null) return cached;
  const angle = orientation(scene, sourcePoints(scene, mesh, 'hole'), mesh.referenceElevationM, width, height, preset);
  if (cache.size >= 16) cache.clear();
  cache.set(key, angle);
  return angle;
}

function frameFromPoints(scene: HoleScene, points: readonly Point3M[], referenceElevationM: number,
  width: number, height: number, preset: TerrainPreset, angle: number): TerrainFrame {
  const pose = TERRAIN_PRESETS[preset], heading = angle + pose.yawOffset * Math.PI / 180;
  const basis = { ...terrainBasis(heading, pose.pitch), referenceElevationM, exaggeration: pose.exaggeration };
  const bounds = projectedBounds(points, basis), scale = fitScale(bounds, width, height);
  const x = (bounds.minX + bounds.maxX) / 2, y = (bounds.minY + bounds.maxY) / 2;
  let minZ = Infinity, maxZ = -Infinity;
  for (const point of points) { minZ = Math.min(minZ, point[2]); maxZ = Math.max(maxZ, point[2]); }
  // The focus is a camera pivot through the source envelope, not a claimed
  // ball/pin position. Solve its XY on a known-height plane so the projected
  // tactical midpoint is actually centred, including tilted terrain relief.
  const focusZ = (minZ + maxZ) / 2;
  const z = (focusZ - referenceElevationM) * pose.exaggeration;
  const projectedX = x - basis.right[2] * z, projectedY = y - basis.up[2] * z;
  const determinant = basis.right[0] * basis.up[1] - basis.right[1] * basis.up[0];
  const focusM: Point3M = [(projectedX * basis.up[1] - basis.right[1] * projectedY) / determinant,
    (basis.right[0] * projectedY - projectedX * basis.up[0]) / determinant, focusZ];
  const spanX = (bounds.maxX - bounds.minX) * scale, spanY = (bounds.maxY - bounds.minY) * scale;
  const profileWeights = { top: 0, terrain: 0, side: 0 }; profileWeights[preset] = 1;
  return { angle, focusM, scale, metadata: { profile: preset, profileWeights,
    baselineHeadingRadians: heading, baselineScale: scale, tacticalBoundsM: bounds,
    baselineBoundsPx: { x: (width - spanX) / 2, y: (height - spanY) / 2, width: spanX, height: spanY },
    occupancy: { width: spanX / width, height: spanY / height, area: spanX * spanY / (width * height) },
    orientationBasis: scene.hole.routeFeatureId ? 'hole_route' : 'source_orientation', fitVersion: 'tactical-presets-v2' } };
}

function terrainFrame(scene: HoleScene, mesh: TerrainMesh, view: CourseView, width: number, height: number, preset: TerrainPreset): TerrainFrame {
  let frameCache = frames.get(mesh);
  if (!frameCache) { frameCache = new Map(); frames.set(mesh, frameCache); }
  const key = `${view}:${width}:${height}:${preset}`;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const points = sourcePoints(scene, mesh, view);
  // Areas inherit the SAME physical-hole heading. Selecting Green must not
  // silently swivel to the source package's unrelated editorial orientation.
  const angle = wholeHoleOrientation(scene, mesh, width, height, preset);
  const frame = frameFromPoints(scene, points, mesh.referenceElevationM, width, height, preset, angle);
  if (frameCache.size >= 16) frameCache.clear();
  frameCache.set(key, frame);
  return frame;
}

function profileWeights(profile: TerrainFitProfile, depth = 0): Record<TerrainPreset, number> {
  if (depth > 32) throw new Error('Invalid terrain fit profile');
  if (typeof profile === 'string') {
    if (!PRESETS.includes(profile)) throw new Error('Invalid terrain fit profile');
    return { top: Number(profile === 'top'), terrain: Number(profile === 'terrain'), side: Number(profile === 'side') };
  }
  if (!profile || !Number.isFinite(profile.progress) || profile.progress < 0 || profile.progress > 1 || !PRESETS.includes(profile.to)) throw new Error('Invalid terrain fit profile');
  const from = profileWeights(profile.from, depth + 1);
  const weights = { top: from.top * (1 - profile.progress), terrain: from.terrain * (1 - profile.progress), side: from.side * (1 - profile.progress) };
  weights[profile.to] += profile.progress;
  return weights;
}

function fittedFrame(scene: HoleScene, mesh: TerrainMesh, view: CourseView, width: number, height: number, profile: TerrainFitProfile): TerrainFrame {
  const weights = profileWeights(profile);
  const contributing = PRESETS.filter(preset => weights[preset] > 0).map(preset => ({ frame: terrainFrame(scene, mesh, view, width, height, preset), weight: weights[preset] }));
  if (contributing.length === 1) return contributing[0]!.frame;
  const mix = (value: (frame: TerrainFrame) => number) => contributing.reduce((sum, item) => sum + value(item.frame) * item.weight, 0);
  const scale = Math.exp(mix(frame => Math.log(frame.scale)));
  const bounds = { minX: mix(f => f.metadata.tacticalBoundsM.minX), maxX: mix(f => f.metadata.tacticalBoundsM.maxX),
    minY: mix(f => f.metadata.tacticalBoundsM.minY), maxY: mix(f => f.metadata.tacticalBoundsM.maxY) };
  const screenBounds = { x: mix(f => f.metadata.baselineBoundsPx.x), y: mix(f => f.metadata.baselineBoundsPx.y),
    width: mix(f => f.metadata.baselineBoundsPx.width), height: mix(f => f.metadata.baselineBoundsPx.height) };
  return { angle: mix(f => f.angle), focusM: [mix(f => f.focusM[0]), mix(f => f.focusM[1]), mix(f => f.focusM[2])], scale,
    metadata: { ...contributing[0]!.frame.metadata, profile: 'blend', profileWeights: weights,
      baselineHeadingRadians: mix(f => f.metadata.baselineHeadingRadians), baselineScale: scale,
      tacticalBoundsM: bounds, baselineBoundsPx: screenBounds,
      occupancy: { width: screenBounds.width / width, height: screenBounds.height / height, area: screenBounds.width * screenBounds.height / (width * height) } } };
}

/** Read-only contact-sheet metadata. A missing/mismatched terrain package
 * supplies only an XY Top fit; Terrain/Side stay explicitly unavailable. */
export function courseFramingMetadata(scene: HoleScene, width: number, height: number, mesh?: TerrainMesh | null) {
  if (![width, height].every(Number.isFinite) || width <= 48 || height <= 48) throw new Error('Invalid terrain viewport');
  const available = mesh?.physicalHoleKey === scene.physicalHoleKey && mesh.geometryHash === scene.packageHash;
  if (available && mesh) {
    try {
      const presets = Object.fromEntries(PRESETS.map(preset => {
        const frame = terrainFrame(scene, mesh, 'hole', width, height, preset);
        return [preset, { ...frame.metadata, focusXYM: [frame.focusM[0], frame.focusM[1]] as PointM, elevation: 'source_elevation' as const }];
      })) as Record<TerrainPreset, TerrainFramingMetadata & { focusXYM: PointM; elevation: 'source_elevation' }>;
      return { physicalHoleKey: scene.physicalHoleKey, geometryHash: scene.packageHash, terrainHash: mesh.contentHash,
        status: 'terrain_available' as const, reason: null, presets };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Missing elevation in requested view') throw error;
      // A contact sheet must report this hole's missing source coverage rather
      // than aborting all other holes or assigning zero heights to its gaps.
    }
  }
  // Zero here is only an algebraic XY plane for a Top report, never a shipped
  // elevation, TerrainMesh, or basis for a Terrain/Side drawing.
  const points = tacticalPoints(scene, 'hole').map(point => [point[0], point[1], 0] as Point3M);
  const angle = orientation(scene, points, 0, width, height, 'top');
  const frame = frameFromPoints(scene, points, 0, width, height, 'top', angle);
  return { physicalHoleKey: scene.physicalHoleKey, geometryHash: scene.packageHash, terrainHash: available && mesh ? mesh.contentHash : null,
    status: 'outline_only' as const, reason: available ? 'missing_tactical_elevation' : mesh ? 'terrain_version_mismatch' : 'terrain_missing',
    presets: { top: { ...frame.metadata, focusXYM: [frame.focusM[0], frame.focusM[1]] as PointM, elevation: 'unavailable' as const }, terrain: null, side: null } };
}

export function fitTerrainCamera(scene: HoleScene, mesh: TerrainMesh, view: CourseView, width: number, height: number,
  pose: TerrainPose, zoom = 1, pan: PointM = [0, 0], fitPreset: TerrainFitProfile = 'top'): TerrainCamera {
  if (mesh.physicalHoleKey !== scene.physicalHoleKey || mesh.geometryHash !== scene.packageHash) throw new Error('Terrain geometry version mismatch');
  if (![width, height, pose.pitch, pose.yawOffset, pose.exaggeration, zoom, ...pan].every(Number.isFinite) ||
    width <= 48 || height <= 48 || pose.pitch < 20 || pose.pitch > 90 || Math.abs(pose.yawOffset) > 45 ||
    pose.exaggeration < 1 || pose.exaggeration > 1.5 || zoom < .5 || zoom > 4) throw new Error('Invalid terrain camera');
  const { angle, focusM, scale: baseScale, metadata } = fittedFrame(scene, mesh, view, width, height, fitPreset);
  const basis = { ...terrainBasis(angle + pose.yawOffset * Math.PI / 180, pose.pitch),
    referenceElevationM: mesh.referenceElevationM, exaggeration: pose.exaggeration };
  const [focusX, focusY] = cameraComponents(focusM, basis);
  // A drag changes viewing direction only. Refitting each projected bounding
  // box would silently zoom and move the orbit target on every frame.
  const scale = baseScale * zoom;
  const translation: PointM = [width / 2 - focusX * scale + pan[0], height / 2 + focusY * scale + pan[1]];
  const { right: r, up: u, forward: f, exaggeration: ez, referenceElevationM: ref } = basis;
  const sx = 2 * scale / width, sy = 2 * scale / height, dz = 10000;
  // Column-major WebGL matrix, identical to projectTerrainPoint. Lower depth is nearer.
  const matrix = [sx*r[0], sy*u[0], f[0]/dz, 0, sx*r[1], sy*u[1], f[1]/dz, 0,
    sx*r[2]*ez, sy*u[2]*ez, f[2]*ez/dz, 0,
    2*translation[0]/width-1-sx*r[2]*ez*ref, 1-2*translation[1]/height-sy*u[2]*ez*ref, -f[2]*ez*ref/dz, 1];
  return { ...basis, scale, translation, matrix, pitch: pose.pitch, yawOffset: pose.yawOffset, focusM, framing: metadata };
}
