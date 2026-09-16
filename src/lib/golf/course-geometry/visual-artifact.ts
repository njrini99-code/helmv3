/** Meridian visual world contract (§6, §96–102).
 *
 * A `MeridianVisualArtifact` is everything the renderer needs beyond the
 * canonical terrain mesh: per-vertex albedo, turf and mowing weights,
 * route-local coordinates, boundary distance, context weight, roughness and
 * (from V3) the render-only bunker bowl depth. It is derived from the hash-
 * locked canonical package + terrain and from the frozen style; it never
 * feeds picking, framing, reconstruction or shot metrics. The artifact keys
 * on canonical package hash + terrain hash + style hash, and the renderer
 * refuses (MERIDIAN_ARTIFACT_MISMATCH) any artifact whose keys disagree with
 * the scene in front of it. */
import { boundaryDistance } from './display-outline';
import type { TerrainMesh } from './terrain';
import type { HoleScene, LocalFeature, PointM, SurfaceKind } from './types';
import { hexToRgb, MERIDIAN_STYLE, srgbToLinear, styleHash, type MeridianStyle } from './visual-style';

export const MERIDIAN_VISUAL_COMPILER_VERSION = 'meridian-visual-compiler-1';
export const MERIDIAN_CODES = Object.freeze({
  mismatch: 'MERIDIAN_ARTIFACT_MISMATCH', missing: 'MERIDIAN_ARTIFACT_MISSING', contextLost: 'MERIDIAN_CONTEXT_LOST',
  shaderFailed: 'MERIDIAN_SHADER_FAILED', budgetExceeded: 'MERIDIAN_BUDGET_EXCEEDED', fitFailed: 'MERIDIAN_FIT_FAILED',
  coverageMissing: 'MERIDIAN_COVERAGE_MISSING',
});
export type MeridianCode = typeof MERIDIAN_CODES[keyof typeof MERIDIAN_CODES];

export type SurfaceClass = SurfaceKind | 'ground' | 'surround' | 'fringe';
/** Compiler ribbon materials (compile-course-terrain.py): 0 field, 1 edge
 * ribbon, 2 highlight ribbon, 3 surround, 4 collar. */
export const SURFACE_CLASS_IDS: readonly SurfaceClass[] = ['ground', 'rough', 'fairway', 'tee', 'green', 'fringe', 'surround', 'bunker', 'water', 'woods'];

export interface MeridianVisualAttributes {
  /** sRGB albedo, 3 bytes per vertex, in the mesh's corner order. */
  albedo: Uint8Array;
  /** 0–255 weights. Mowing only inside the played hole's own fairway field. */
  mowingWeight: Uint8Array;
  turfWeight: Uint8Array;
  contextWeight: Uint8Array;
  /** MeshStandard roughness × 255. */
  roughness: Uint8Array;
  /** Surface class id (index into SURFACE_CLASS_IDS) per vertex. */
  surfaceClass: Uint8Array;
  /** Route-local metres: s along the hole route, t signed lateral. */
  routeST: Float32Array;
  /** Metres to the nearest boundary of the vertex's own feature (cm, ≤655 m). */
  boundaryDistanceCm: Uint16Array;
  /** Render-only bunker bowl depth in mm; zero until V3 fills it. */
  bunkerDepthMm: Uint16Array;
}
export interface MeridianVisualArtifact {
  schemaVersion: 1;
  kind: 'meridian_visual_artifact';
  /** Every layer here decorates; nothing is a measurement. */
  basis: 'visual_only';
  compilerVersion: typeof MERIDIAN_VISUAL_COMPILER_VERSION;
  canonicalPackageHash: string;
  terrainHash: string;
  physicalHoleKey: string;
  styleVersion: string;
  styleHash: string;
  vertexCount: number;
  /** FNV-1a over the packed attributes; identical inputs → identical hash. */
  contentHash: string;
  /** Seed for world-space fields: derived from the package hash so two holes
   * of the same course share one turf world and never swim under the camera. */
  seed: readonly [number, number];
  layers: {
    turf: { basis: 'visual_only'; macroM: readonly number[]; microM: readonly number[] };
    mowing: { basis: 'illustrative_style'; bandWidthM: number; frame: 'route_local' };
    boundary: { basis: 'visual_only'; fieldM: number };
    context: { basis: 'visual_only'; roughMix: number };
    bunkerBowl: { basis: 'visual_only'; version: 'none' | 'smoothstep-bowl-v1' };
  };
  attributes: MeridianVisualAttributes;
}

const ATTRIBUTE_ORDER: (keyof MeridianVisualAttributes)[] = ['albedo', 'mowingWeight', 'turfWeight', 'contextWeight', 'roughness', 'surfaceClass', 'routeST', 'boundaryDistanceCm', 'bunkerDepthMm'];

function fnvBytes(views: ArrayBufferView[]): string {
  let hash = 2166136261;
  for (const view of views) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i]!, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function seedFromHash(hash: string): [number, number] {
  const a = Number.parseInt(hash.slice(0, 8), 16) || 0, b = Number.parseInt(hash.slice(8, 16), 16) || 0;
  // A few hundred metres of offset is plenty: the fields are periodic.
  return [(a % 100_000) / 100, (b % 100_000) / 100];
}

interface Bbox { minX: number; minY: number; maxX: number; maxY: number }
function ringBbox(ring: readonly PointM[]): Bbox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return { minX, minY, maxX, maxY };
}
function bboxDistance([x, y]: PointM, box: Bbox): number {
  const dx = Math.max(box.minX - x, 0, x - box.maxX), dy = Math.max(box.minY - y, 0, y - box.maxY);
  return Math.sqrt(dx * dx + dy * dy);
}

class RouteFrame {
  private readonly cumulative: number[] = [0];
  constructor(private readonly line: readonly PointM[]) {
    // sqrt is correctly rounded everywhere; Math.hypot is not, and a one-ulp
    // difference between engines would change the content hash.
    for (let i = 1; i < line.length; i++) this.cumulative.push(this.cumulative[i - 1]! + Math.sqrt((line[i]![0] - line[i - 1]![0]) ** 2 + (line[i]![1] - line[i - 1]![1]) ** 2));
  }
  get length(): number { return this.cumulative.at(-1) ?? 0; }
  /** Nearest-segment projection: s along the route, t signed (left positive). */
  at([x, y]: PointM): [number, number] {
    let best = Infinity, s = 0, t = 0;
    for (let i = 1; i < this.line.length; i++) {
      const [ax, ay] = this.line[i - 1]!, [bx, by] = this.line[i]!;
      const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
      const u = length2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length2));
      const px = ax + dx * u, py = ay + dy * u, d2 = (x - px) ** 2 + (y - py) ** 2;
      if (d2 < best) {
        best = d2;
        const length = Math.sqrt(length2) || 1;
        s = this.cumulative[i - 1]! + u * length;
        t = ((x - ax) * -dy + (y - ay) * dx) / length;
      }
    }
    return [s, t];
  }
}

function classOf(kind: TerrainMesh['featureKinds'][number], material: number): SurfaceClass {
  if (material === 3) return 'surround';
  if (material === 4) return 'fringe';
  return kind;
}
function mix(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
/** Albedo policy shared with the previous inline renderer (three-landscape-v4)
 * so V2 changes the shading, not the base colour identity of each surface. */
function albedoFor(kind: TerrainMesh['featureKinds'][number], material: number, contextOnly: boolean, style: MeridianStyle): [number, number, number] {
  const palette = style.palette, rgb = (key: keyof typeof palette) => hexToRgb(palette[key]);
  let base = rgb(material === 3 ? 'surround' : material === 4 ? 'fringe' : kind);
  if (kind === 'woods') base = mix(base, rgb('rough'), style.surface.woodsUnderstoryMix);
  if (material === 1) base = kind === 'bunker' ? rgb('sandEdge') : mix(base, rgb('ground'), kind === 'green' ? .24 : .14);
  else if (material === 2) base = kind === 'bunker' ? rgb('sandHighlight') : mix(base, hexToRgb('#D5DEA9'), .1);
  if (contextOnly && (kind === 'fairway' || kind === 'tee' || kind === 'green')) base = mix(base, rgb('rough'), style.context.roughMix);
  return base;
}

/** Compile the visual artifact for one hole. Deterministic: the same package,
 * terrain and style produce byte-identical attributes and the same hash. */
export function compileVisualArtifact(scene: HoleScene, mesh: TerrainMesh, style: MeridianStyle = MERIDIAN_STYLE): MeridianVisualArtifact {
  if (mesh.physicalHoleKey !== scene.physicalHoleKey || mesh.geometryHash !== scene.packageHash) throw new Error(MERIDIAN_CODES.mismatch);
  const vertexCount = mesh.vertices.length / 3;
  const attributes: MeridianVisualAttributes = {
    albedo: new Uint8Array(vertexCount * 3), mowingWeight: new Uint8Array(vertexCount), turfWeight: new Uint8Array(vertexCount),
    contextWeight: new Uint8Array(vertexCount), roughness: new Uint8Array(vertexCount), surfaceClass: new Uint8Array(vertexCount),
    routeST: new Float32Array(vertexCount * 2), boundaryDistanceCm: new Uint16Array(vertexCount), bunkerDepthMm: new Uint16Array(vertexCount),
  };
  const featuresById = new Map<string, LocalFeature>();
  for (const feature of scene.contextFeatures ?? []) featuresById.set(feature.id, feature);
  for (const feature of scene.features) featuresById.set(feature.id, feature);
  const contextIds = new Set(scene.contextFeatures?.map(feature => feature.id));
  const route = scene.features.find(feature => feature.id === scene.hole.routeFeatureId)?.parts[0]?.[0];
  const frame = route && route.length >= 2 ? new RouteFrame(route) : null;
  // Rings with bboxes, per feature, so boundary distance only scans rings
  // that can be nearer than the best so far.
  const ringsByFeature = new Map<string, { ring: readonly PointM[]; box: Bbox }[]>();
  const ringsFor = (id: string) => {
    let rings = ringsByFeature.get(id);
    if (!rings) {
      const feature = featuresById.get(id);
      rings = feature && feature.type !== 'LineString' ? feature.parts.flat().map(ring => ({ ring, box: ringBbox(ring) })) : [];
      ringsByFeature.set(id, rings);
    }
    return rings;
  };
  const distanceCache = new Map<string, number>();
  const boundaryFor = (point: PointM, id: string): number => {
    const key = `${id}|${point[0]}|${point[1]}`;
    const cached = distanceCache.get(key);
    if (cached != null) return cached;
    let best = Infinity;
    for (const { ring, box } of ringsFor(id)) {
      if (bboxDistance(point, box) >= best) continue;
      best = Math.min(best, boundaryDistance(point, ring));
    }
    distanceCache.set(key, best);
    return best;
  };
  const roughness = style.surface.roughness;
  const roughnessFor = (surface: SurfaceClass): number => surface in roughness ? roughness[surface as keyof typeof roughness] : roughness.ground;
  const kinds = mesh.featureKinds, ids = mesh.featureIds, v = mesh.vertices;
  for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    const featureIndex = mesh.triangleFeatures[t]!, kind = kinds[featureIndex]!, id = ids[featureIndex]!, material = mesh.triangleMaterials[t]!;
    const contextOnly = contextIds.has(id);
    const surface = classOf(kind, material);
    const albedo = albedoFor(kind, material, contextOnly, style);
    const albedoBytes = albedo.map(channel => Math.round(Math.min(1, Math.max(0, channel)) * 255));
    const mown = kind === 'fairway' && material === 0 && !contextOnly;
    const turf = kind === 'ground' || kind === 'rough' || kind === 'fairway' || kind === 'tee' || kind === 'green' || surface === 'surround' || surface === 'fringe';
    const classId = SURFACE_CLASS_IDS.indexOf(surface);
    const rough = Math.round(roughnessFor(surface) * 255);
    for (let corner = 0; corner < 3; corner++) {
      const vertex = t * 3 + corner, offset = vertex * 3;
      const point: PointM = [v[offset]!, v[offset + 1]!];
      attributes.albedo.set(albedoBytes, offset);
      attributes.turfWeight[vertex] = turf ? 255 : 0;
      attributes.contextWeight[vertex] = contextOnly ? 255 : 0;
      attributes.roughness[vertex] = rough;
      attributes.surfaceClass[vertex] = classId;
      // Mowing fades out before the fairway edge so the bands never touch a
      // boundary pixel (§22.3); the shader applies the route-local pattern.
      const boundary = kind === 'ground' ? 0 : boundaryFor(point, id);
      attributes.boundaryDistanceCm[vertex] = Math.min(65535, Math.round(Math.min(boundary, 655) * 100));
      const fade = mown ? Math.min(1, boundary / style.mowing.edgeFadeM) : 0;
      attributes.mowingWeight[vertex] = Math.round(fade * 255);
      const [s, lateral] = frame ? frame.at(point) : [0, 0];
      // Millimetre quantisation keeps the packed bytes identical across engines.
      attributes.routeST[vertex * 2] = Math.round(s * 1000) / 1000; attributes.routeST[vertex * 2 + 1] = Math.round(lateral * 1000) / 1000;
    }
  }
  const contentHash = fnvBytes(ATTRIBUTE_ORDER.map(key => attributes[key]));
  return {
    schemaVersion: 1, kind: 'meridian_visual_artifact', basis: 'visual_only', compilerVersion: MERIDIAN_VISUAL_COMPILER_VERSION,
    canonicalPackageHash: scene.packageHash, terrainHash: mesh.contentHash, physicalHoleKey: scene.physicalHoleKey,
    styleVersion: style.version, styleHash: styleHash(style), vertexCount, contentHash, seed: seedFromHash(scene.packageHash),
    layers: {
      turf: { basis: 'visual_only', macroM: style.turf.macro.wavelengthsM, microM: style.turf.micro.wavelengthsM },
      mowing: { basis: 'illustrative_style', bandWidthM: style.mowing.bandWidthM, frame: 'route_local' },
      boundary: { basis: 'visual_only', fieldM: style.boundary.fieldM },
      context: { basis: 'visual_only', roughMix: style.context.roughMix },
      bunkerBowl: { basis: 'visual_only', version: 'none' },
    },
    attributes,
  };
}

/** The §6 hash gate. Throws MERIDIAN_ARTIFACT_MISMATCH when the artifact was
 * compiled for a different package, terrain, hole, style, or vertex layout. */
export function assertVisualArtifact(artifact: MeridianVisualArtifact, scene: HoleScene, mesh: TerrainMesh, style: MeridianStyle = MERIDIAN_STYLE): void {
  const expected = styleHash(style);
  const problems: string[] = [];
  if (artifact.kind !== 'meridian_visual_artifact' || artifact.schemaVersion !== 1 || artifact.basis !== 'visual_only') problems.push('kind');
  if (artifact.compilerVersion !== MERIDIAN_VISUAL_COMPILER_VERSION) problems.push('compiler');
  if (artifact.canonicalPackageHash !== scene.packageHash || artifact.canonicalPackageHash !== mesh.geometryHash) problems.push('package');
  if (artifact.terrainHash !== mesh.contentHash) problems.push('terrain');
  if (artifact.physicalHoleKey !== scene.physicalHoleKey || artifact.physicalHoleKey !== mesh.physicalHoleKey) problems.push('hole');
  if (artifact.styleVersion !== style.version || artifact.styleHash !== expected) problems.push('style');
  if (artifact.vertexCount !== mesh.vertices.length / 3) problems.push('vertices');
  const a = artifact.attributes;
  if (a.albedo.length !== artifact.vertexCount * 3 || a.routeST.length !== artifact.vertexCount * 2 ||
    [a.mowingWeight, a.turfWeight, a.contextWeight, a.roughness, a.surfaceClass, a.boundaryDistanceCm, a.bunkerDepthMm].some(view => view.length !== artifact.vertexCount)) problems.push('attributes');
  if (problems.length) throw new Error(`${MERIDIAN_CODES.mismatch}: ${problems.join(',')}`);
}

/** Cache path (§101): keyed by site, canonical package hash and style hash so
 * a new style or a recompiled package can never serve a stale artifact. */
export function visualArtifactCachePath(siteId: string, packageHash: string, hash: string, physicalHoleKey: string): string {
  return `geometry/${siteId}/${packageHash}/visual/${hash}/${physicalHoleKey}.visual.json`;
}

/** Offline pack manifest (§102): one entry per hole for the canonical terrain
 * and one for its visual artifact, both hash-addressed. */
export interface OfflinePackEntry { role: 'terrain' | 'visual'; physicalHoleKey: string; path: string; hash: string }
export function offlinePackManifest(siteId: string, packageHash: string, holes: readonly { physicalHoleKey: string; terrainHash: string; visualContentHash: string }[], hash = styleHash()): { packVersion: 1; siteId: string; packageHash: string; styleHash: string; entries: OfflinePackEntry[] } {
  return { packVersion: 1, siteId, packageHash, styleHash: hash, entries: holes.flatMap(hole => [
    { role: 'terrain', physicalHoleKey: hole.physicalHoleKey, path: `geometry/${siteId}/${packageHash}/terrain/${hole.physicalHoleKey}.json.gz`, hash: hole.terrainHash },
    { role: 'visual', physicalHoleKey: hole.physicalHoleKey, path: visualArtifactCachePath(siteId, packageHash, hash, hole.physicalHoleKey), hash: hole.visualContentHash },
  ]) };
}

const encode = (view: ArrayBufferView): string => {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const decode = (text: string): Uint8Array => {
  const binary = atob(text), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};
/** JSON with little-endian base64 typed arrays. Byte-identical for identical artifacts. */
export function serializeVisualArtifact(artifact: MeridianVisualArtifact): string {
  const { attributes, ...header } = artifact;
  return JSON.stringify({ ...header, encoding: 'base64-le', attributes: Object.fromEntries(ATTRIBUTE_ORDER.map(key => [key, encode(attributes[key])])) });
}
export function parseVisualArtifact(text: string): MeridianVisualArtifact {
  const raw = JSON.parse(text) as Record<string, unknown> & { attributes: Record<string, string> };
  if (raw.kind !== 'meridian_visual_artifact' || raw.schemaVersion !== 1 || raw.encoding !== 'base64-le') throw new Error(MERIDIAN_CODES.mismatch);
  const bytes = (key: string) => decode(raw.attributes[key] ?? '');
  const aligned = (key: string) => { const b = bytes(key); const copy = new Uint8Array(b.length); copy.set(b); return copy.buffer; };
  const attributes: MeridianVisualAttributes = {
    albedo: bytes('albedo'), mowingWeight: bytes('mowingWeight'), turfWeight: bytes('turfWeight'), contextWeight: bytes('contextWeight'),
    roughness: bytes('roughness'), surfaceClass: bytes('surfaceClass'),
    routeST: new Float32Array(aligned('routeST')), boundaryDistanceCm: new Uint16Array(aligned('boundaryDistanceCm')), bunkerDepthMm: new Uint16Array(aligned('bunkerDepthMm')),
  };
  const { encoding: _encoding, attributes: _attributes, ...header } = raw;
  const artifact = { ...(header as Omit<MeridianVisualArtifact, 'attributes'>), attributes };
  if (artifact.contentHash !== fnvBytes(ATTRIBUTE_ORDER.map(key => attributes[key]))) throw new Error(`${MERIDIAN_CODES.mismatch}: content`);
  return artifact;
}

/** Linear-space albedo for the renderer; the artifact stays sRGB bytes. */
export function linearAlbedo(artifact: MeridianVisualArtifact): Float32Array {
  const out = new Float32Array(artifact.attributes.albedo.length), table = new Float32Array(256);
  for (let i = 0; i < 256; i++) table[i] = srgbToLinear(i / 255);
  for (let i = 0; i < out.length; i++) out[i] = table[artifact.attributes.albedo[i]!]!;
  return out;
}
