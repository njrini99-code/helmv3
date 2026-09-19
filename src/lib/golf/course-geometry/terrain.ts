import { z } from 'zod';
import type { CourseGeometryPackage, HoleScene, PointM } from './types';
import { contextPoints, type CourseView } from './camera';
import { metricTerrainNormal, sampleMetricTerrain, terrainSourceFields } from './terrain-source';
import { inRing } from './spatial';

export type Point3M = readonly [number, number, number];
/** Art-directed world-space light, shared by terrain and illustrative canopy. */
/** Sun elevation ≈45° (was ≈53°): a slightly lower presentation sun lengthens
 * shadows and reads relief without inventing detail (Meridian §47, §121). */
export const TERRAIN_LIGHT_DIRECTION: Point3M = [.47, -.53, .706];
/** Lab/review presets (`top`, `terrain`, `side`) plus the production camera
 * states of the player view (outside-world spec §22–23): one composed pose per
 * shot context, selected by state rather than by a debug control. */
export type TerrainPreset = 'top' | 'terrain' | 'side' | 'tee' | 'approach' | 'green' | 'putting';
export type ProductionCameraState = 'tee' | 'approach' | 'green' | 'putting';
export type TerrainProjection = 'orthographic' | 'perspective';
/** A baseline changes only on explicit preset/area selection. An interrupted
 * preset animation may retain its blend without refitting during the drag. */
export type TerrainFitProfile = TerrainPreset | {
  from: TerrainFitProfile; to: TerrainPreset; progress: number;
};
export interface TerrainPose {
  pitch: number; yawOffset: number; exaggeration: number;
  /** Top stays orthographic so on-screen distance remains measurable. Terrain
   * and Side use a real perspective lens (Meridian §9). A blend pose during a
   * preset transition may carry any field of view inside PERSPECTIVE_FOV. */
  projection?: TerrainProjection; fovDegrees?: number;
}
/** Vertical field of view in degrees: preset range per Meridian §9.2, and the
 * wider limits a transition may pass through (a tiny FOV approximates Top). */
export const PERSPECTIVE_FOV = Object.freeze({ min: .5, max: 60, presetMin: 28, presetMax: 34, transitionStart: .5 });
/** The orbit is a full circle (on-course ask, 2026-09-17: "going the whole
 * 360"): any finite yaw offset is a valid heading, folded into (−180, 180]
 * so a pose never grows without bound and 180 and −180 are the same view. */
export function wrapYawDegrees(degrees: number): number {
  const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}
/** Signed shortest turn from one yaw to another, in (−180, 180]. */
export function yawDeltaDegrees(from: number, to: number): number { return wrapYawDegrees(to - from); }
export const TERRAIN_PRESETS: Record<TerrainPreset, TerrainPose> = {
  top: { pitch: 90, yawOffset: 0, exaggeration: 1, projection: 'orthographic' },
  terrain: { pitch: 44, yawOffset: 0, exaggeration: 1, projection: 'perspective', fovDegrees: 32 },
  side: { pitch: 20, yawOffset: 30, exaggeration: 1, projection: 'perspective', fovDegrees: 32 },
  // Production states (§23): the tee state looks down the whole hole from a
  // low elevated position; approach turns a little toward the green from the
  // landing zone; green is steeper and closer; putting is near-overhead so
  // the surface reads as a map without leaving the terrain.
  tee: { pitch: 36, yawOffset: 0, exaggeration: 1, projection: 'perspective', fovDegrees: 30 },
  approach: { pitch: 40, yawOffset: 12, exaggeration: 1, projection: 'perspective', fovDegrees: 30 },
  green: { pitch: 50, yawOffset: -18, exaggeration: 1, projection: 'perspective', fovDegrees: 30 },
  putting: { pitch: 64, yawOffset: 0, exaggeration: 1, projection: 'perspective', fovDegrees: 28 },
};
/** Which area each production state frames. `putting` frames the green
 * complex from nearer overhead; it never becomes a separate 2D diagram. */
export const PRODUCTION_CAMERA_STATES: Readonly<Record<ProductionCameraState, { preset: TerrainPreset; view: CourseView }>> = Object.freeze({
  tee: { preset: 'tee', view: 'hole' }, approach: { preset: 'approach', view: 'approach' }, green: { preset: 'green', view: 'green' }, putting: { preset: 'putting', view: 'green' },
});
/** The production state for a scene view (player view §23). */
export function productionCameraState(view: 'hole' | 'approach' | 'green' | 'putting'): ProductionCameraState {
  return view === 'hole' ? 'tee' : view;
}
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

/** Per-vertex source normals for a mesh: the legacy `sourceNormals` array
 * when the package carries one, otherwise the metric grid's gradient sampled
 * at every vertex (`metricTerrainNormal`, the same DEM slope the renderer
 * samples per fragment). Vertices the grid cannot answer point up. Null only
 * when the mesh has neither, so callers fall back to triangle normals. The
 * array is laid out like `vertices`, three components per vertex. */
export function sourceVertexNormals(mesh: TerrainMesh): Float32Array | null {
  if (mesh.sourceNormals && mesh.sourceNormals.length === mesh.vertices.length) return Float32Array.from(mesh.sourceNormals);
  const grid = mesh.metricGrid;
  if (!grid) return null;
  // One gradient per distinct position (corners share them), keyed by the
  // coordinates themselves rather than a string of them.
  const v = mesh.vertices, normals = new Float32Array(v.length), cache = new Map<number, Map<number, readonly [number, number, number]>>();
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i]!, y = v[i + 1]!;
    let row = cache.get(x);
    if (!row) { row = new Map(); cache.set(x, row); }
    let n = row.get(y);
    if (!n) { n = metricTerrainNormal(grid, [x, y]) ?? [0, 0, 1]; row.set(y, n); }
    normals[i] = n[0]; normals[i + 1] = n[1]; normals[i + 2] = n[2];
  }
  return normals;
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
  referenceElevationM: number; exaggeration: number;
  /** CSS pixels per metre: exact for orthographic, at the focus depth for perspective. */
  scale: number;
  /** Screen position of camera-space origin (orthographic) or the principal
   * point through which the eye axis passes (perspective), in CSS pixels. */
  translation: PointM; matrix: readonly number[]; pitch: number; yawOffset: number;
  /** Stable world-space orbit target; never a ball or pin observation. */
  focusM: Point3M;
  projection: TerrainProjection;
  /** Perspective lens only. `eyeM` is in display space (course-local XY
   * metres, displayed elevation Z after exaggeration); `focalPx` is the CSS
   * pixel focal length. Orthographic cameras carry neither. */
  fovDegrees?: number; focalPx?: number; eyeM?: Point3M;
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
  projection: TerrainProjection;
  /** Perspective fit results (Meridian §10): null for orthographic frames. */
  fovDegrees: number | null; eyeDistanceM: number | null;
  /** Orbit target basis: the tactical centre (orthographic) or the
   * route-mid 45% / green 55% weighted target (perspective, §10.3). */
  targetBasis: 'tactical_centre' | 'route_green_weighted';
  fitVersion: 'tactical-presets-v3';
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
/** Screen position (CSS px) and camera depth of a source point. `liftM` adds a
 * world-up offset AFTER display exaggeration, for illustrative canopy height
 * that must not stretch with the terrain relief setting. The same math drives
 * the SVG overlay, the SVG canopy and (through applyTerrainCamera) the GPU. */
export function projectTerrainPoint(point: Point3M, camera: TerrainCamera, liftM = 0): Point3M {
  if (camera.projection === 'perspective') {
    const eye = camera.eyeM!, focal = camera.focalPx!;
    const dx = point[0] - eye[0], dy = point[1] - eye[1];
    const dz = camera.referenceElevationM + (point[2] - camera.referenceElevationM) * camera.exaggeration + liftM - eye[2];
    const { right: r, up: u, forward: f } = camera;
    const x = r[0] * dx + r[1] * dy + r[2] * dz, y = u[0] * dx + u[1] * dy + u[2] * dz, depth = f[0] * dx + f[1] * dy + f[2] * dz;
    const k = focal / depth;
    return [camera.translation[0] + x * k, camera.translation[1] - y * k, depth];
  }
  const [x, y, depth] = cameraComponents(point, camera);
  const { right: r, up: u, forward: f } = camera;
  return [camera.translation[0] + (x + r[2] * liftM) * camera.scale, camera.translation[1] - (y + u[2] * liftM) * camera.scale, depth + f[2] * liftM];
}
/** CSS pixels per metre at a point's depth: constant for orthographic cameras. */
export function terrainScaleAt(point: Point3M, camera: TerrainCamera): number {
  if (camera.projection !== 'perspective') return camera.scale;
  const depth = projectTerrainPoint(point, camera)[2];
  return depth > 1e-6 ? camera.focalPx! / depth : camera.scale;
}
const fitPoints = new WeakMap<TerrainMesh, Map<CourseView, Point3M[]>>();
const orientations = new WeakMap<TerrainMesh, Map<string, number>>();
interface PerspectiveLens { fovDegrees: number; focalPx: number; distanceM: number; principal: PointM }
interface TerrainFrame { angle: number; focusM: Point3M; scale: number; lens: PerspectiveLens | null; metadata: TerrainFramingMetadata }
const frames = new WeakMap<TerrainMesh, Map<string, TerrainFrame>>();
const FIT_PADDING = 24;
const PRESETS: readonly TerrainPreset[] = ['top', 'terrain', 'side', 'tee', 'approach', 'green', 'putting'];

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

/** Meridian §11: a yaw that hides the green (or the tee) behind a wall of
 * woods is a worse camera than a slightly larger bounding box. For elevated
 * perspective presets the sight line to a ground target clears a canopy of
 * `WOODS_CANOPY_M` once the woods sit farther than `canopy / tan(pitch)` in
 * front of the target, so only that ground strip toward the camera is probed.
 * Woods rings are the reviewed source polygons (own hole plus context); the
 * probe is a display concern and never feeds shot or stat calculations. */
const WOODS_CANOPY_M = 12;
const VISIBILITY_WEIGHTS = { green: .3, tee: .1 } as const;
function ringCentroid(ring: readonly PointM[]): PointM {
  let x = 0, y = 0;
  for (const point of ring) { x += point[0]; y += point[1]; }
  return [x / ring.length, y / ring.length];
}
function woodsRings(scene: HoleScene): readonly (readonly PointM[])[] {
  const rings: (readonly PointM[])[] = [];
  for (const feature of [...scene.features, ...(scene.contextFeatures ?? [])]) {
    if (feature.kind !== 'woods') continue;
    for (const part of feature.parts) if (part[0] && part[0].length >= 3) rings.push(part[0]);
  }
  return rings;
}
/** Fraction of the probe strip from `target` toward the camera that lies
 * inside woods. `angle` and `pitch` follow terrainBasis; the camera sits on
 * the -forward side of the target, so the ground probe walks [-sin, -cos]. */
export function woodsOcclusion(rings: readonly (readonly PointM[])[], target: PointM, angle: number, pitch: number): number {
  if (pitch >= 89 || rings.length === 0) return 0;
  const reach = WOODS_CANOPY_M / Math.tan(pitch * Math.PI / 180);
  const steps = Math.max(4, Math.ceil(reach));
  const dx = -Math.sin(angle), dy = -Math.cos(angle);
  let inside = 0;
  for (let i = 1; i <= steps; i++) {
    const t = reach * i / steps;
    const point: PointM = [target[0] + dx * t, target[1] + dy * t];
    if (rings.some(ring => inRing(point, ring))) inside++;
  }
  return inside / steps;
}
const visibilityTargets = new WeakMap<HoleScene, { rings: readonly (readonly PointM[])[]; green: PointM | null; tee: PointM | null }>();
function visibilityPenalty(scene: HoleScene, angle: number, pitch: number): number {
  if (pitch >= 89) return 0;
  let targets = visibilityTargets.get(scene);
  if (!targets) {
    const greenRing = scene.features.find(f => f.id === scene.target.greenFeatureId)?.parts[0]?.[0]
      ?? scene.features.find(f => f.kind === 'green')?.parts[0]?.[0];
    const teeRing = scene.features.find(f => f.kind === 'tee')?.parts[0]?.[0];
    targets = { rings: woodsRings(scene), green: greenRing ? ringCentroid(greenRing) : null, tee: teeRing ? ringCentroid(teeRing) : null };
    visibilityTargets.set(scene, targets);
  }
  if (targets.rings.length === 0) return 0;
  let penalty = 0;
  if (targets.green) penalty += VISIBILITY_WEIGHTS.green * woodsOcclusion(targets.rings, targets.green, angle, pitch);
  if (targets.tee) penalty += VISIBILITY_WEIGHTS.tee * woodsOcclusion(targets.rings, targets.tee, angle, pitch);
  return penalty;
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
    const score = scale * (1 - .012 * Math.abs(offset) / 70) * (1 - visibilityPenalty(scene, angle, pose.pitch));
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

/** Perspective fit (Meridian §10). The eye sits on the axis through `focus`
 * (display space) along the basis forward vector. The smallest eye distance
 * whose projected tactical footprint fits the padded viewport is found by
 * bisection: moving the eye back along the axis only ever shrinks the
 * footprint, so the search is monotone and deterministic. The residual
 * off-centre of that footprint becomes a principal-point offset (a shift
 * lens), never a change of the orbit target. */
function perspectiveFit(points: readonly Point3M[], basis: Parameters<typeof cameraComponents>[1], focus: Point3M,
  width: number, height: number, fovDegrees: number): PerspectiveLens {
  const focalPx = height / 2 / Math.tan(fovDegrees * Math.PI / 360);
  const { right: r, up: u, forward: f, referenceElevationM: ref, exaggeration } = basis;
  const display = points.map(p => [p[0], p[1], ref + (p[2] - ref) * exaggeration] as Point3M);
  let radius = 0;
  for (const p of display) radius = Math.max(radius, Math.hypot(p[0] - focus[0], p[1] - focus[1], p[2] - focus[2]));
  const spans = (distance: number) => {
    const ex = focus[0] - f[0] * distance, ey = focus[1] - f[1] * distance, ez = focus[2] - f[2] * distance;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of display) {
      const dx = p[0] - ex, dy = p[1] - ey, dz = p[2] - ez;
      const depth = f[0] * dx + f[1] * dy + f[2] * dz;
      if (depth <= 1e-6) return null;
      const nx = (r[0] * dx + r[1] * dy + r[2] * dz) / depth, ny = (u[0] * dx + u[1] * dy + u[2] * dz) / depth;
      minX = Math.min(minX, nx); maxX = Math.max(maxX, nx); minY = Math.min(minY, ny); maxY = Math.max(maxY, ny);
    }
    return { minX, maxX, minY, maxY };
  };
  const fits = (distance: number) => {
    const s = spans(distance);
    return s != null && (s.maxX - s.minX) * focalPx <= width - FIT_PADDING * 2 && (s.maxY - s.minY) * focalPx <= height - FIT_PADDING * 2;
  };
  let low = Math.max(1, radius * .05), high = Math.max(low * 2, 2 * radius / Math.sin(fovDegrees * Math.PI / 360));
  for (let i = 0; i < 40 && !fits(high); i++) high *= 2;
  if (!fits(high)) throw new Error('Perspective fit failed');
  // The bracket must straddle the boundary, so the result is where the
  // footprint actually meets the padding rather than an arbitrary bound.
  for (let i = 0; i < 40 && low > 1e-3 && fits(low); i++) low /= 2;
  if (fits(low)) throw new Error('Perspective fit failed');
  for (let i = 0; i < 64; i++) { const mid = (low + high) / 2; if (fits(mid)) high = mid; else low = mid; }
  const s = spans(high)!;
  return { fovDegrees, focalPx, distanceM: high, principal: [(s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2] };
}

/** Meridian §10.3 orbit target for the whole hole: 45% route midpoint, 55%
 * green centre, on the source terrain. Area views (approach, green) and holes
 * without a route or green keep the tactical centre of the fitted points. */
function weightedTarget(scene: HoleScene, view: CourseView, points: readonly Point3M[], fallback: Point3M): { point: Point3M; basis: TerrainFramingMetadata['targetBasis'] } {
  const route = scene.features.find(f => f.id === scene.hole.routeFeatureId)?.parts[0]?.[0];
  const green = scene.features.find(f => f.id === scene.hole.greenFeatureId && f.kind === 'green');
  if (view !== 'hole' || !route || route.length < 2 || !green) return { point: fallback, basis: 'tactical_centre' };
  let length = 0;
  const cumulative = [0];
  for (let i = 1; i < route.length; i++) { length += Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]); cumulative.push(length); }
  let mid: PointM = route[0]!;
  for (let i = 1; i < route.length; i++) if (cumulative[i]! >= length / 2) {
    const t = (length / 2 - cumulative[i - 1]!) / Math.max(1e-9, cumulative[i]! - cumulative[i - 1]!);
    mid = [route[i - 1]![0] + (route[i]![0] - route[i - 1]![0]) * t, route[i - 1]![1] + (route[i]![1] - route[i - 1]![1]) * t];
    break;
  }
  const ring = green.parts.flat(2);
  const centre: PointM = [ring.reduce((n, p) => n + p[0], 0) / ring.length, ring.reduce((n, p) => n + p[1], 0) / ring.length];
  const xy: PointM = [mid[0] * .45 + centre[0] * .55, mid[1] * .45 + centre[1] * .55];
  // Height comes from the nearest fitted tactical point: the target is a
  // pivot inside the source envelope, never a sampled or claimed position.
  let best = fallback, bestDistance = Infinity;
  for (const p of points) { const d = Math.hypot(p[0] - xy[0], p[1] - xy[1]); if (d < bestDistance) { bestDistance = d; best = p; } }
  return { point: [xy[0], xy[1], best[2]], basis: 'route_green_weighted' };
}

function frameFromPoints(scene: HoleScene, view: CourseView, points: readonly Point3M[], referenceElevationM: number,
  width: number, height: number, preset: TerrainPreset, angle: number): TerrainFrame {
  const pose = TERRAIN_PRESETS[preset], heading = angle + pose.yawOffset * Math.PI / 180;
  const basis = { ...terrainBasis(heading, pose.pitch), referenceElevationM, exaggeration: pose.exaggeration };
  const bounds = projectedBounds(points, basis);
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
  const centred: Point3M = [(projectedX * basis.up[1] - basis.right[1] * projectedY) / determinant,
    (basis.right[0] * projectedY - projectedX * basis.up[0]) / determinant, focusZ];
  const profileWeights = emptyWeights(); profileWeights[preset] = 1;
  const metadata = (scale: number, spanX: number, spanY: number, lens: PerspectiveLens | null, targetBasis: TerrainFramingMetadata['targetBasis']): TerrainFramingMetadata => ({
    profile: preset, profileWeights, baselineHeadingRadians: heading, baselineScale: scale, tacticalBoundsM: bounds,
    baselineBoundsPx: { x: (width - spanX) / 2, y: (height - spanY) / 2, width: spanX, height: spanY },
    occupancy: { width: spanX / width, height: spanY / height, area: spanX * spanY / (width * height) },
    orientationBasis: scene.hole.routeFeatureId ? 'hole_route' : 'source_orientation',
    projection: lens ? 'perspective' : 'orthographic', fovDegrees: lens?.fovDegrees ?? null, eyeDistanceM: lens?.distanceM ?? null,
    targetBasis, fitVersion: 'tactical-presets-v3' });
  if (pose.projection === 'perspective') {
    const target = weightedTarget(scene, view, points, centred);
    const focusM = target.point;
    const display: Point3M = [focusM[0], focusM[1], referenceElevationM + (focusM[2] - referenceElevationM) * pose.exaggeration];
    const lens = perspectiveFit(points, basis, display, width, height, pose.fovDegrees ?? 32);
    const scale = lens.focalPx / lens.distanceM;
    // Footprint in pixels at the fitted lens; the bisection leaves the larger
    // side touching the padding exactly as the orthographic fit does.
    const eye: Point3M = [display[0] - basis.forward[0] * lens.distanceM, display[1] - basis.forward[1] * lens.distanceM, display[2] - basis.forward[2] * lens.distanceM];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = referenceElevationM + (p[2] - referenceElevationM) * pose.exaggeration - eye[2];
      const depth = basis.forward[0] * dx + basis.forward[1] * dy + basis.forward[2] * dz;
      const nx = (basis.right[0] * dx + basis.right[1] * dy + basis.right[2] * dz) / depth, ny = (basis.up[0] * dx + basis.up[1] * dy + basis.up[2] * dz) / depth;
      minX = Math.min(minX, nx); maxX = Math.max(maxX, nx); minY = Math.min(minY, ny); maxY = Math.max(maxY, ny);
    }
    return { angle, focusM, scale, lens, metadata: metadata(scale, (maxX - minX) * lens.focalPx, (maxY - minY) * lens.focalPx, lens, target.basis) };
  }
  const scale = fitScale(bounds, width, height);
  const spanX = (bounds.maxX - bounds.minX) * scale, spanY = (bounds.maxY - bounds.minY) * scale;
  return { angle, focusM: centred, scale, lens: null, metadata: metadata(scale, spanX, spanY, null, 'tactical_centre') };
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
  const frame = frameFromPoints(scene, view, points, mesh.referenceElevationM, width, height, preset, angle);
  if (frameCache.size >= 16) frameCache.clear();
  frameCache.set(key, frame);
  return frame;
}

const emptyWeights = (): Record<TerrainPreset, number> => ({ top: 0, terrain: 0, side: 0, tee: 0, approach: 0, green: 0, putting: 0 });
function profileWeights(profile: TerrainFitProfile, depth = 0): Record<TerrainPreset, number> {
  if (depth > 32) throw new Error('Invalid terrain fit profile');
  if (typeof profile === 'string') {
    if (!PRESETS.includes(profile)) throw new Error('Invalid terrain fit profile');
    const weights = emptyWeights(); weights[profile] = 1; return weights;
  }
  if (!profile || !Number.isFinite(profile.progress) || profile.progress < 0 || profile.progress > 1 || !PRESETS.includes(profile.to)) throw new Error('Invalid terrain fit profile');
  const from = profileWeights(profile.from, depth + 1);
  const weights = emptyWeights();
  for (const key of PRESETS) weights[key] = from[key] * (1 - profile.progress);
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
  // A lens blends toward orthographic as its weight fades: the principal
  // offset mixes to zero and the field of view stays that of the perspective
  // contributors, while the caller's transition pose supplies the actual FOV.
  const perspective = contributing.filter(item => item.frame.lens);
  const perspectiveWeight = perspective.reduce((sum, item) => sum + item.weight, 0);
  const lens: PerspectiveLens | null = perspective.length ? {
    fovDegrees: perspective.reduce((sum, item) => sum + item.frame.lens!.fovDegrees * item.weight, 0) / perspectiveWeight,
    focalPx: perspective.reduce((sum, item) => sum + item.frame.lens!.focalPx * item.weight, 0) / perspectiveWeight,
    distanceM: Math.exp(perspective.reduce((sum, item) => sum + Math.log(item.frame.lens!.distanceM) * item.weight, 0) / perspectiveWeight),
    principal: [mix(f => f.lens?.principal[0] ?? 0), mix(f => f.lens?.principal[1] ?? 0)] } : null;
  return { angle: mix(f => f.angle), focusM: [mix(f => f.focusM[0]), mix(f => f.focusM[1]), mix(f => f.focusM[2])], scale, lens,
    metadata: { ...contributing[0]!.frame.metadata, profile: 'blend', profileWeights: weights,
      baselineHeadingRadians: mix(f => f.metadata.baselineHeadingRadians), baselineScale: scale,
      tacticalBoundsM: bounds, baselineBoundsPx: screenBounds,
      projection: lens ? 'perspective' : 'orthographic', fovDegrees: lens?.fovDegrees ?? null, eyeDistanceM: lens?.distanceM ?? null,
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
  const frame = frameFromPoints(scene, 'hole', points, 0, width, height, 'top', angle);
  return { physicalHoleKey: scene.physicalHoleKey, geometryHash: scene.packageHash, terrainHash: available && mesh ? mesh.contentHash : null,
    status: 'outline_only' as const, reason: available ? 'missing_tactical_elevation' : mesh ? 'terrain_version_mismatch' : 'terrain_missing',
    presets: { top: { ...frame.metadata, focusXYM: [frame.focusM[0], frame.focusM[1]] as PointM, elevation: 'unavailable' as const }, terrain: null, side: null } };
}

export function fitTerrainCamera(scene: HoleScene, mesh: TerrainMesh, view: CourseView, width: number, height: number,
  pose: TerrainPose, zoom = 1, pan: PointM = [0, 0], fitPreset: TerrainFitProfile = 'top'): TerrainCamera {
  if (mesh.physicalHoleKey !== scene.physicalHoleKey || mesh.geometryHash !== scene.packageHash) throw new Error('Terrain geometry version mismatch');
  if (![width, height, pose.pitch, pose.yawOffset, pose.exaggeration, zoom, ...pan].every(Number.isFinite) ||
    width <= 48 || height <= 48 || pose.pitch < 20 || pose.pitch > 90 ||
    pose.exaggeration < 1 || pose.exaggeration > 1.5 || zoom < .5 || zoom > 4) throw new Error('Invalid terrain camera');
  const yawOffset = wrapYawDegrees(pose.yawOffset);
  const projection: TerrainProjection = pose.projection ?? 'orthographic';
  const { angle, focusM, scale: baseScale, lens, metadata } = fittedFrame(scene, mesh, view, width, height, fitPreset);
  const fovDegrees = pose.fovDegrees ?? lens?.fovDegrees ?? 32;
  if (projection === 'perspective' && (!Number.isFinite(fovDegrees) || fovDegrees < PERSPECTIVE_FOV.min || fovDegrees > PERSPECTIVE_FOV.max)) throw new Error('Invalid terrain camera');
  const basis = { ...terrainBasis(angle + yawOffset * Math.PI / 180, pose.pitch),
    referenceElevationM: mesh.referenceElevationM, exaggeration: pose.exaggeration };
  // A drag changes viewing direction only. Refitting each projected bounding
  // box would silently zoom and move the orbit target on every frame.
  const scale = baseScale * zoom;
  const { right: r, up: u, forward: f, exaggeration: ez, referenceElevationM: ref } = basis;
  const dz = 10000;
  if (projection === 'perspective') {
    // Zoom narrows the lens about the focus rather than dollying the eye, so
    // a pinch can never push the eye through the terrain. A transition pose
    // with a smaller FOV keeps the focus size constant by moving the eye back
    // (the dolly-zoom law), which is exactly how Top's orthographic look is
    // approached continuously.
    const focal = height / 2 / Math.tan(fovDegrees * Math.PI / 360), distance = focal / baseScale, focalPx = focal * zoom;
    const principal: PointM = lens?.principal ?? [0, 0];
    const display: Point3M = [focusM[0], focusM[1], ref + (focusM[2] - ref) * ez];
    const eyeM: Point3M = [display[0] - f[0] * distance, display[1] - f[1] * distance, display[2] - f[2] * distance];
    const translation: PointM = [width / 2 - principal[0] * focalPx + pan[0], height / 2 + principal[1] * focalPx + pan[1]];
    // Column-major clip = M · [x, y, sourceZ, 1]; divide by w (= depth) to reach
    // NDC. The constant column folds display exaggeration and the eye offset.
    const ax = 2 * focalPx / width, ay = 2 * focalPx / height, px = 2 * translation[0] / width - 1, py = 1 - 2 * translation[1] / height;
    const constant: Point3M = [r[2] * ref * (1 - ez) - (r[0] * eyeM[0] + r[1] * eyeM[1] + r[2] * eyeM[2]),
      u[2] * ref * (1 - ez) - (u[0] * eyeM[0] + u[1] * eyeM[1] + u[2] * eyeM[2]),
      f[2] * ref * (1 - ez) - (f[0] * eyeM[0] + f[1] * eyeM[1] + f[2] * eyeM[2])];
    const column = (cx: number, cy: number, cd: number) => [ax * cx + px * cd, ay * cy + py * cd, cd / dz, cd];
    const matrix = [...column(r[0], u[0], f[0]), ...column(r[1], u[1], f[1]), ...column(r[2] * ez, u[2] * ez, f[2] * ez), ...column(constant[0], constant[1], constant[2])];
    return { ...basis, scale, translation, matrix, pitch: pose.pitch, yawOffset, focusM, projection, fovDegrees, focalPx, eyeM, framing: metadata };
  }
  const [focusX, focusY] = cameraComponents(focusM, basis);
  const translation: PointM = [width / 2 - focusX * scale + pan[0], height / 2 + focusY * scale + pan[1]];
  const sx = 2 * scale / width, sy = 2 * scale / height;
  // Column-major WebGL matrix, identical to projectTerrainPoint. Lower depth is nearer.
  const matrix = [sx*r[0], sy*u[0], f[0]/dz, 0, sx*r[1], sy*u[1], f[1]/dz, 0,
    sx*r[2]*ez, sy*u[2]*ez, f[2]*ez/dz, 0,
    2*translation[0]/width-1-sx*r[2]*ez*ref, 1-2*translation[1]/height-sy*u[2]*ez*ref, -f[2]*ez*ref/dz, 1];
  return { ...basis, scale, translation, matrix, pitch: pose.pitch, yawOffset, focusM, projection, framing: metadata };
}
