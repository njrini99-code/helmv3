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
import { TERRAIN_LIGHT_DIRECTION, terrainHeight, type TerrainMesh } from './terrain';
import { inRing } from './spatial';
import type { HoleScene, LocalFeature, PointM, SurfaceKind } from './types';
import { hexToRgb, MERIDIAN_STYLE, srgbToLinear, styleHash, type MeridianPaletteKey, type MeridianStyle } from './visual-style';

export const MERIDIAN_VISUAL_COMPILER_VERSION = 'meridian-visual-compiler-6';
export const MERIDIAN_CODES = Object.freeze({
  mismatch: 'MERIDIAN_ARTIFACT_MISMATCH', missing: 'MERIDIAN_ARTIFACT_MISSING', contextLost: 'MERIDIAN_CONTEXT_LOST',
  shaderFailed: 'MERIDIAN_SHADER_FAILED', budgetExceeded: 'MERIDIAN_BUDGET_EXCEEDED', fitFailed: 'MERIDIAN_FIT_FAILED',
  coverageMissing: 'MERIDIAN_COVERAGE_MISSING',
});
export type MeridianCode = typeof MERIDIAN_CODES[keyof typeof MERIDIAN_CODES];

/** Ground zone classes the compiler paints from the context layer (outside
 * world §10–16): each is a named, source-backed tone, never invented filler. */
export type GroundZoneClass = 'open_field' | 'wetland' | 'parking' | 'ski_slope' | 'recreation' | 'buffer_grass' | 'native' | 'rough_secondary';
export type SurfaceClass = SurfaceKind | 'ground' | 'surround' | 'fringe' | 'rough_outer' | 'apron' | 'runoff' | GroundZoneClass;
/** Compiler ribbon materials (compile-course-terrain.py): 0 field, 1 edge
 * ribbon, 2 highlight ribbon, 3 surround, 4 collar. Ids 0–9 are the V1–V5
 * classes and never move; 10+ are the rough hierarchy and ground zones. */
export const SURFACE_CLASS_IDS: readonly SurfaceClass[] = ['ground', 'rough', 'fairway', 'tee', 'green', 'fringe', 'surround', 'bunker', 'water', 'woods',
  'rough_secondary', 'rough_outer', 'native', 'apron', 'open_field', 'wetland', 'parking', 'ski_slope', 'recreation', 'buffer_grass', 'runoff'];
/** Context zone classes that paint a ground tone, and the palette key each uses. */
export const GROUND_ZONE_CLASSES: Readonly<Record<string, { surface: GroundZoneClass; palette: MeridianPaletteKey; turf: boolean }>> = Object.freeze({
  open_field: { surface: 'open_field', palette: 'openField', turf: true }, wetland: { surface: 'wetland', palette: 'wetland', turf: true },
  parking: { surface: 'parking', palette: 'parking', turf: false }, ski_slope: { surface: 'ski_slope', palette: 'skiSlope', turf: true },
  recreation: { surface: 'recreation', palette: 'recreation', turf: true }, buffer_grass: { surface: 'buffer_grass', palette: 'bufferGrass', turf: true },
  rough_native: { surface: 'native', palette: 'native', turf: true }, rough_secondary: { surface: 'rough_secondary', palette: 'roughSecondary', turf: true },
});

/** One bunker's render-only bowl (§27–30). `depthBasis` names where the depth
 * came from: today always a size-class default; a future source-supported
 * depth (survey, lidar cross-section) would say so and carry its provenance. */
export interface VisualBunkerProfile {
  featureId: string;
  areaM2: number;
  sizeClass: 'small' | 'medium' | 'large';
  /** Class depth the profile asks for, and the deepest vertex actually
   * lowered: a coarsely triangulated (context) bunker with no interior vertex
   * stays flat, and says so here. */
  depthM: number;
  effectiveDepthM: number;
  bowlRadiusM: number;
  depthBasis: 'visual_class';
  contextOnly: boolean;
  /** Renderer redesign §9: pot (small), greenside (near a green ring) or fairway; scales depth and lip. */
  family: 'pot' | 'greenside' | 'fairway';
  /** Fidelity §26–28: this bunker's render-only lip height and edge band/shade (seeded). */
  lipM: number;
  edgeBandM: number;
  edgeShade: number;
  /** Vertex range (inclusive start, exclusive end) is not contiguous, so the
   * profile records the vertex count it touched instead. */
  vertexCount: number;
  /** 0–1: interior vertex support for the bowl; below 1 the bowl is shallower than `depthM`. */
  bowlSupport: number;
}
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
  /** Render-only bunker bowl depth in mm (§28); zero outside bunkers. */
  bunkerDepthMm: Uint16Array;
  /** ∂depth/∂x, ∂depth/∂y in m/m × 4096 so display normals follow the bowl. */
  bunkerSlope: Int16Array;
  /** Metres to the nearest playing surface (fairway, tee, green, fringe,
   * surround, apron) in cm, capped at 655 m; the rough hierarchy's key. */
  surroundDistanceCm: Uint16Array;
  /** Render-only rise of the turf around a bunker rim in mm (fidelity §26). */
  lipLiftMm: Uint16Array;
  /** Signed render-only ground offset in mm: path cut/fill (redesign 12). */
  groundLevelMm: Int16Array;
  /** ∂level/∂x, ∂level/∂y in m/m × 4096 so display normals follow the banks. */
  groundLevelSlope: Int16Array;
}
export const BUNKER_SLOPE_SCALE = 4096;
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
  /** Context layer the ground zones were painted from (null when the scene
   * carried none). Part of the hash gate: a context edit recompiles. */
  contextLayerHash: string | null;
  layers: {
    turf: { basis: 'visual_only'; macroM: readonly number[]; microM: readonly number[] };
    mowing: { basis: 'illustrative_style'; bandWidthM: number; frame: 'route_local' };
    boundary: { basis: 'visual_only'; fieldM: number };
    context: { basis: 'visual_only'; roughMix: number };
    bunkerBowl: { basis: 'visual_only'; version: 'smoothstep-bowl-v1'; depthBasis: 'visual_class'; profiles: VisualBunkerProfile[] };
    /** §42–45: interior tone is distance from the drawn shoreline, never depth. */
    water: { basis: 'visual_only'; version: 'static-fresnel-v1'; depthBasis: 'shoreline_distance'; shorelineM: number; interiorM: number; contactVertices: number };
    /** Outside world §21: rough bands by distance from the nearest playing surface. */
    roughHierarchy: { basis: 'visual_only'; version: 'distance-bands-v2'; firstCutM: number; secondaryM: number; outerM: number; secondaryVertices: number; outerVertices: number };
    /** Outside world §10–16: ground tones painted from classified context zones. */
    groundZones: { basis: 'visual_only'; version: 'context-zones-v1'; painted: number; classes: Record<string, number>; skippedUncertain: number };
    /** Fidelity §13–21: derived apron neck, green/collar edge lip, pad setting shade. */
    greenComplex: { basis: 'visual_only'; version: 'green-complex-v2'; apronBasis: 'derived_neck'; runoffBasis: 'canonical_slope'; runoffVertices: number; apronVertices: number; edgeVertices: number; settingVertices: number };
    /** Fidelity §10: fairway edge types by neighbour. */
    fairwayEdges: { basis: 'visual_only'; version: 'edge-types-v2'; terrainBasis: 'canonical_slope'; crispVertices: number; softVertices: number; terrainVertices: number };
    /** Renderer redesign §16: ground contact shade under context structures and path shoulders. */
    contextContact: { basis: 'visual_only'; version: 'context-contact-v2'; structures: number; ribbons: number; vertices: number; levelled: number };
  };
  attributes: MeridianVisualAttributes;
}

const ATTRIBUTE_ORDER: (keyof MeridianVisualAttributes)[] = ['albedo', 'mowingWeight', 'turfWeight', 'contextWeight', 'roughness', 'surfaceClass', 'routeST', 'boundaryDistanceCm', 'bunkerDepthMm', 'bunkerSlope', 'surroundDistanceCm', 'lipLiftMm', 'groundLevelMm', 'groundLevelSlope'];

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

/** Nearest point on a ring's boundary (segments), with its distance. */
function nearestOnRings(p: PointM, rings: readonly { ring: readonly PointM[]; box: Bbox }[]): { distance: number; point: PointM; ringIndex: number; segment: number } {
  let best = Infinity, bx = p[0], by = p[1], ringIndex = 0, segment = 0;
  rings.forEach(({ ring, box }, r) => {
    if (bboxDistance(p, box) >= best) return;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]!, b = ring[i]!, dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
      const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
      const qx = a[0] + t * dx, qy = a[1] + t * dy, d = Math.sqrt((p[0] - qx) ** 2 + (p[1] - qy) ** 2);
      if (d < best) { best = d; bx = qx; by = qy; ringIndex = r; segment = i - 1; }
    }
  });
  return { distance: best, point: [bx, by], ringIndex, segment };
}
/** Inward (toward the sand) unit normal per ring segment, length-weighted
 * over a five-segment window so a wiggly source rim yields one steady
 * facing per stretch of edge instead of a facing that flips vertex to
 * vertex. Ring 0 is the outer boundary; later rings are holes, whose sand
 * lies on the other side. */
function smoothedInwardNormals(rings: readonly { ring: readonly PointM[] }[]): PointM[][] {
  const outer = rings[0]?.ring ?? [];
  let signedArea = 0;
  for (let i = 1; i < outer.length; i++) signedArea += outer[i - 1]![0] * outer[i]![1] - outer[i]![0] * outer[i - 1]![1];
  const leftIsInside = signedArea > 0;
  return rings.map(({ ring }, r) => {
    const count = Math.max(0, ring.length - 1), raw: PointM[] = [], weights: number[] = [];
    const sign = (r === 0) === leftIsInside ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const a = ring[i]!, b = ring[i + 1]!, dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1;
      raw.push([-dy / length * sign, dx / length * sign]); weights.push(length);
    }
    return raw.map((_, i) => {
      let x = 0, y = 0;
      for (let k = -2; k <= 2; k++) { const j = ((i + k) % count + count) % count; x += raw[j]![0] * weights[j]!; y += raw[j]![1] * weights[j]!; }
      const length = Math.hypot(x, y) || 1;
      return [x / length, y / length] as PointM;
    });
  });
}
/** Quintic smoothstep 6u⁵ − 15u⁴ + 10u³ and its derivative (§28). */
const smootherstep = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);
const smootherstepSlope = (u: number) => 30 * u * u * (u - 1) * (u - 1);
function featureSeed(id: string): number {
  let seed = 2166136261;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619);
  let n = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}
function polygonArea(feature: LocalFeature): number {
  if (feature.type === 'LineString') return 0;
  return feature.parts.reduce((total, rings) => total + rings.reduce((sum, ring, index) => {
    const area = Math.abs(ring.reduce((acc, a, i) => { const b = ring[(i + 1) % ring.length]!; return acc + a[0] * b[1] - b[0] * a[1]; }, 0) / 2);
    return index === 0 ? sum + area : sum - area;
  }, 0), 0);
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
    bunkerSlope: new Int16Array(vertexCount * 2), surroundDistanceCm: new Uint16Array(vertexCount), lipLiftMm: new Uint16Array(vertexCount), groundLevelMm: new Int16Array(vertexCount), groundLevelSlope: new Int16Array(vertexCount * 2),
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
  const hierarchy = compileRoughHierarchy(scene, mesh, style, attributes, featuresById, ringsFor);
  const greenComplex = compileGreenComplex(scene, mesh, style, attributes, contextIds, ringsFor);
  const fairwayEdges = compileFairwayEdges(scene, mesh, style, attributes, contextIds, ringsFor, smoothVertexNormals(mesh));
  const greenRings = [...scene.features, ...(scene.contextFeatures ?? [])].filter(f => f.kind === 'green')
    .flatMap(f => f.parts.map(part => part[0]).filter((ring): ring is PointM[] => !!ring && ring.length >= 3)).map(ring => ({ ring, box: ringBbox(ring) }));
  const profiles = compileBunkerBowls(mesh, style, attributes, featuresById, contextIds, ringsFor, greenRings);
  const contactVertices = compileShorelines(mesh, style, attributes, featuresById, ringsFor);
  const contextContact = compileContextContact(scene, mesh, style, attributes);
  const contentHash = fnvBytes(ATTRIBUTE_ORDER.map(key => attributes[key]));
  return {
    schemaVersion: 1, kind: 'meridian_visual_artifact', basis: 'visual_only', compilerVersion: MERIDIAN_VISUAL_COMPILER_VERSION,
    canonicalPackageHash: scene.packageHash, terrainHash: mesh.contentHash, physicalHoleKey: scene.physicalHoleKey,
    styleVersion: style.version, styleHash: styleHash(style), vertexCount, contentHash, seed: seedFromHash(scene.packageHash),
    contextLayerHash: scene.contextLayerHash ?? null,
    layers: {
      turf: { basis: 'visual_only', macroM: style.turf.macro.wavelengthsM, microM: style.turf.micro.wavelengthsM },
      mowing: { basis: 'illustrative_style', bandWidthM: style.mowing.bandWidthM, frame: 'route_local' },
      boundary: { basis: 'visual_only', fieldM: style.boundary.fieldM },
      context: { basis: 'visual_only', roughMix: style.context.roughMix },
      bunkerBowl: { basis: 'visual_only', version: 'smoothstep-bowl-v1', depthBasis: 'visual_class', profiles },
      water: { basis: 'visual_only', version: 'static-fresnel-v1', depthBasis: 'shoreline_distance', shorelineM: style.water.shorelineM, interiorM: style.water.interiorM, contactVertices },
      roughHierarchy: { basis: 'visual_only', version: 'distance-bands-v2', firstCutM: style.roughHierarchy.firstCutM, secondaryM: style.roughHierarchy.secondaryM, outerM: style.roughHierarchy.outerM,
        secondaryVertices: hierarchy.secondary, outerVertices: hierarchy.outer },
      groundZones: { basis: 'visual_only', version: 'context-zones-v1', painted: hierarchy.painted, classes: hierarchy.classes, skippedUncertain: hierarchy.skippedUncertain },
      greenComplex: { basis: 'visual_only', version: 'green-complex-v2', apronBasis: 'derived_neck', runoffBasis: 'canonical_slope', ...greenComplex },
      fairwayEdges: { basis: 'visual_only', version: 'edge-types-v2', terrainBasis: 'canonical_slope', ...fairwayEdges },
      contextContact: { basis: 'visual_only', version: 'context-contact-v2', ...contextContact },
    },
    attributes,
  };
}

/** Nearest distance from a point to any ring in a list, capped; bbox-pruned. */
function nearestRingDistance(point: PointM, rings: readonly { ring: readonly PointM[]; box: Bbox }[], cap: number): number {
  let best = cap;
  for (const { ring, box } of rings) {
    if (bboxDistance(point, box) >= best) continue;
    best = Math.min(best, boundaryDistance(point, ring));
  }
  return best;
}
const shadeAlbedo = (attributes: MeridianVisualAttributes, vertex: number, shade: number) => {
  for (let c = 0; c < 3; c++) attributes.albedo[vertex * 3 + c] = Math.round(Math.min(255, Math.max(0, attributes.albedo[vertex * 3 + c]! * shade)));
};

/** Smooth per-vertex normals for slope evidence: the package's DEM normals
 * when present, else triangle normals summed over every vertex that shares a
 * position, so a slope test follows the landform, not one triangle. */
export function smoothVertexNormals(mesh: TerrainMesh): Float32Array {
  const v = mesh.vertices, count = v.length / 3, normals = new Float32Array(v.length);
  if (mesh.sourceNormals && mesh.sourceNormals.length === v.length) { normals.set(mesh.sourceNormals); return normals; }
  const groups = new Int32Array(count), keys = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(v[i * 3]! * 1000)},${Math.round(v[i * 3 + 1]! * 1000)}`;
    let index = keys.get(key); if (index === undefined) { index = keys.size; keys.set(key, index); }
    groups[i] = index;
  }
  const summed = new Float64Array(keys.size * 3);
  for (let t = 0; t < count / 3; t++) {
    const i0 = t * 9, ax = v[i0 + 3]! - v[i0]!, ay = v[i0 + 4]! - v[i0 + 1]!, az = v[i0 + 5]! - v[i0 + 2]!;
    const bx = v[i0 + 6]! - v[i0]!, by = v[i0 + 7]! - v[i0 + 1]!, bz = v[i0 + 8]! - v[i0 + 2]!;
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    for (let corner = 0; corner < 3; corner++) { const j = groups[t * 3 + corner]! * 3; summed[j] = summed[j]! + nx; summed[j + 1] = summed[j + 1]! + ny; summed[j + 2] = summed[j + 2]! + nz; }
  }
  for (let i = 0; i < count; i++) {
    const j = groups[i]! * 3, length = Math.hypot(summed[j]!, summed[j + 1]!, summed[j + 2]!) || 1;
    normals[i * 3] = summed[j]! / length; normals[i * 3 + 1] = summed[j + 1]! / length; normals[i * 3 + 2] = summed[j + 2]! / length;
  }
  return normals;
}

/** Green complex (fidelity §13–21). Three render-only refinements around the
 * hole's own green(s): a derived apron neck where its own fairway runs into
 * the green, a crisper albedo lip on the green and its collar than any other
 * edge (§18), and a pad-setting shade on the bank below the green so a
 * perched or shelved green reads as a landform (§20). Nothing moves; every
 * shape stays the reviewed outline. */
function compileGreenComplex(scene: HoleScene, mesh: TerrainMesh, style: MeridianStyle, attributes: MeridianVisualAttributes,
  contextIds: Set<string>, ringsFor: (id: string) => { ring: readonly PointM[]; box: Bbox }[]): { apronVertices: number; edgeVertices: number; settingVertices: number; runoffVertices: number } {
  const cfg = style.greenComplex, v = mesh.vertices;
  const own = scene.features.filter(feature => !contextIds.has(feature.id));
  const greens = own.filter(feature => feature.kind === 'green'), fairways = own.filter(feature => feature.kind === 'fairway');
  const greenRings = greens.flatMap(feature => ringsFor(feature.id)), fairwayRings = fairways.flatMap(feature => ringsFor(feature.id));
  const counts = { apronVertices: 0, edgeVertices: 0, settingVertices: 0, runoffVertices: 0 };
  if (!greenRings.length) return counts;
  // §39–40 run-off evidence: the direction away from the nearest green centre
  // and, per vertex, the canonical downhill direction and slope.
  const runoff = cfg.runoff, vertexNormals = smoothVertexNormals(mesh);
  const greenCentres = greenRings.map(({ ring }) => {
    let sx = 0, sy = 0; for (const [x, y] of ring) { sx += x; sy += y; }
    return [sx / ring.length, sy / ring.length] as PointM;
  });
  const awayFromGreen = (point: PointM): PointM => {
    let best = greenCentres[0]!, bestD = Infinity;
    for (const centre of greenCentres) { const d = Math.hypot(point[0] - centre[0], point[1] - centre[1]); if (d < bestD) { bestD = d; best = centre; } }
    return bestD > 0 ? [(point[0] - best[0]) / bestD, (point[1] - best[1]) / bestD] : [0, 0];
  };
  // Pad elevation per green: mean canonical z of its own vertices.
  const greenIds = new Set(greens.map(feature => feature.id));
  let padSum = 0, padCount = 0;
  for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    const featureIndex = mesh.triangleFeatures[t]!;
    if (!greenIds.has(mesh.featureIds[featureIndex]!) || mesh.triangleMaterials[t] !== 0) continue;
    for (let corner = 0; corner < 3; corner++) { padSum += v[(t * 3 + corner) * 3 + 2]!; padCount++; }
  }
  const padZ = padCount ? padSum / padCount : 0;
  const apronAlbedo = hexToRgb(style.palette.apron), apronId = SURFACE_CLASS_IDS.indexOf('apron');
  const apronRoughness = Math.round(style.surface.roughness.apron * 255), runoffId = SURFACE_CLASS_IDS.indexOf('runoff');
  const greenId = SURFACE_CLASS_IDS.indexOf('green'), fringeId = SURFACE_CLASS_IDS.indexOf('fringe');
  const roughIds = new Set([SURFACE_CLASS_IDS.indexOf('rough'), SURFACE_CLASS_IDS.indexOf('ground'), SURFACE_CLASS_IDS.indexOf('rough_secondary'), SURFACE_CLASS_IDS.indexOf('surround')]);
  const reach = Math.max(cfg.apronGreenM, cfg.settingReachM);
  for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    const featureIndex = mesh.triangleFeatures[t]!, kind = mesh.featureKinds[featureIndex]!, id = mesh.featureIds[featureIndex]!;
    if (contextIds.has(id)) continue;
    for (let corner = 0; corner < 3; corner++) {
      const vertex = t * 3 + corner, cls = attributes.surfaceClass[vertex]!;
      const point: PointM = [v[vertex * 3]!, v[vertex * 3 + 1]!];
      const nx = vertexNormals[vertex * 3]!, ny = vertexNormals[vertex * 3 + 1]!, nz = vertexNormals[vertex * 3 + 2]!;
      const horizontal = Math.hypot(nx, ny), slope = horizontal / Math.max(1e-9, nz);
      if (cls === greenId || cls === fringeId) {
        // §18 / §16: the cleanest edge in the scene. Boundary distance is the
        // vertex's own feature edge: the green ring for green vertices, the
        // shared green edge for the collar ring inside the rough feature.
        const d = attributes.boundaryDistanceCm[vertex]! / 100;
        if (d < cfg.edgeFieldM) { shadeAlbedo(attributes, vertex, 1 - (cls === greenId ? cfg.greenEdgeShade : cfg.fringeEdgeShade) * (1 - d / cfg.edgeFieldM)); counts.edgeVertices++; }
        continue;
      }
      if (kind !== 'rough' && kind !== 'ground') continue;
      if (!roughIds.has(cls)) continue;
      const dGreen = nearestRingDistance(point, greenRings, reach + 1);
      if (dGreen > reach) continue;
      // §21 apron: the neck between this hole's fairway and its green.
      if (dGreen <= cfg.apronGreenM && fairwayRings.length) {
        const dFairway = nearestRingDistance(point, fairwayRings, cfg.apronFairwayM + 1);
        if (dFairway <= cfg.apronFairwayM) {
          const blend = Math.min(1, (cfg.apronGreenM - dGreen) / cfg.apronBlendM, (cfg.apronFairwayM - dFairway) / cfg.apronBlendM);
          const base: [number, number, number] = [attributes.albedo[vertex * 3]! / 255, attributes.albedo[vertex * 3 + 1]! / 255, attributes.albedo[vertex * 3 + 2]! / 255];
          const albedo = mix(base, apronAlbedo, blend);
          for (let c = 0; c < 3; c++) attributes.albedo[vertex * 3 + c] = Math.round(Math.min(1, Math.max(0, albedo[c]!)) * 255);
          if (blend >= .5) { attributes.surfaceClass[vertex] = apronId; attributes.roughness[vertex] = apronRoughness; attributes.turfWeight[vertex] = 255; attributes.mowingWeight[vertex] = 0; }
          counts.apronVertices++;
          continue;
        }
      }
      // §39–40 run-off: short grass where the ground falls away from the
      // green steeply enough. Flat or rising ground gets none.
      if (runoff.reachM > 0 && dGreen <= runoff.reachM && slope >= runoff.slopeMin && horizontal > 0) {
        const away = awayFromGreen(point), dot = (nx * away[0] + ny * away[1]) / horizontal;
        if (dot >= runoff.awayDot) {
          const strength = Math.min(1, (slope - runoff.slopeMin) / Math.max(1e-6, runoff.slopeFull - runoff.slopeMin)) * (1 - dGreen / runoff.reachM);
          const base: [number, number, number] = [attributes.albedo[vertex * 3]! / 255, attributes.albedo[vertex * 3 + 1]! / 255, attributes.albedo[vertex * 3 + 2]! / 255];
          const albedo = mix(base, apronAlbedo, runoff.mix * strength);
          for (let c = 0; c < 3; c++) attributes.albedo[vertex * 3 + c] = Math.round(Math.min(1, Math.max(0, albedo[c]!)) * 255);
          if (strength >= .5) { attributes.surfaceClass[vertex] = runoffId; attributes.roughness[vertex] = apronRoughness; attributes.turfWeight[vertex] = 255; attributes.mowingWeight[vertex] = 0; }
          counts.runoffVertices++;
        }
      }
      // §20 setting: the bank below the pad darkens toward the green.
      if (dGreen <= cfg.settingReachM) {
        const drop = Math.min(1, Math.max(0, (padZ - v[vertex * 3 + 2]!) / cfg.settingDropM));
        if (drop > 0) { shadeAlbedo(attributes, vertex, 1 - cfg.settingShade * drop * (1 - dGreen / cfg.settingReachM)); counts.settingVertices++; }
      }
    }
  }
  return counts;
}

/** Fairway edge types (fidelity §10). A fairway edge within `crispNearM` of a
 * bunker or green is a maintained boundary and gets the crisp lip; every
 * other fairway edge gets the soft one. Both are albedo-only over `fieldM`
 * inside the reviewed outline, which never moves. */
function compileFairwayEdges(scene: HoleScene, mesh: TerrainMesh, style: MeridianStyle, attributes: MeridianVisualAttributes,
  contextIds: Set<string>, ringsFor: (id: string) => { ring: readonly PointM[]; box: Bbox }[], vertexNormals: Float32Array): { crispVertices: number; softVertices: number; terrainVertices: number } {
  const cfg = style.fairwayEdge, v = mesh.vertices, counts = { crispVertices: 0, softVertices: 0, terrainVertices: 0 };
  const neighbours = [...(scene.contextFeatures ?? []), ...scene.features].filter(feature => feature.kind === 'bunker' || feature.kind === 'green').flatMap(feature => ringsFor(feature.id));
  const fairwayId = SURFACE_CLASS_IDS.indexOf('fairway'), ownRings = new Map<string, { ring: readonly PointM[]; box: Bbox }[]>();
  for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    const featureIndex = mesh.triangleFeatures[t]!, id = mesh.featureIds[featureIndex]!;
    if (mesh.featureKinds[featureIndex] !== 'fairway' || contextIds.has(id)) continue;
    let rings = ownRings.get(id);
    if (!rings) { rings = ringsFor(id); ownRings.set(id, rings); }
    for (let corner = 0; corner < 3; corner++) {
      const vertex = t * 3 + corner;
      if (attributes.surfaceClass[vertex] !== fairwayId) continue;
      const d = attributes.boundaryDistanceCm[vertex]! / 100;
      if (d >= cfg.fieldM) continue;
      const point: PointM = [v[vertex * 3]!, v[vertex * 3 + 1]!];
      const crisp = nearestRingDistance(point, neighbours, cfg.crispNearM + 1) <= cfg.crispNearM;
      // §10.3 terrain-biased edge: the lip follows landform. `outward` points
      // from the fairway to its own edge; the canonical cross-slope along it
      // (smoothed vertex normal, never an invented break) strengthens the
      // lip where the ground falls away and softens it where it rises.
      let bias = 0;
      const nearest = nearestOnRings(point, rings);
      if (nearest.distance > 1e-3) {
        const ox = (nearest.point[0] - point[0]) / nearest.distance, oy = (nearest.point[1] - point[1]) / nearest.distance;
        const downhill = -(ox * vertexNormals[vertex * 3]! + oy * vertexNormals[vertex * 3 + 1]!);
        bias = Math.max(-1, Math.min(1, downhill / cfg.terrainSlopeFull));
      }
      const shade = (crisp ? cfg.crispShade : cfg.softShade) * (1 + cfg.terrainBias * bias);
      shadeAlbedo(attributes, vertex, 1 - shade * (1 - d / cfg.fieldM));
      if (crisp) counts.crispVertices++; else counts.softVertices++;
      if (Math.abs(bias) >= .25) counts.terrainVertices++;
    }
  }
  return counts;
}

/** Rough hierarchy and ground zones (outside world §10–16, §21). Rough and
 * unfeatured ground are never one flat green: a vertex inside a classified,
 * source-backed context zone takes that zone's tone; everything else banks
 * by distance from the nearest playing surface into primary, secondary and
 * outer rough. Steeper non-playing ground darkens a little by slope alone
 * (no aspect, so nothing directional is baked into albedo). `uncertain`
 * zones paint nothing: an unexplained region stays honestly unexplained. */
const PLAYING_KINDS = new Set<string>(['fairway', 'tee', 'green']);
/** When two zones overlap, the more specific class wins. */
const GROUND_ZONE_PRIORITY = ['parking', 'wetland', 'ski_slope', 'recreation', 'open_field', 'buffer_grass', 'rough_native', 'rough_secondary'];
const SURROUND_SEARCH_M = 60;
const SURFACE_CLASS_GROUND = SURFACE_CLASS_IDS.indexOf('ground'), SURFACE_CLASS_ROUGH = SURFACE_CLASS_IDS.indexOf('rough');
const smoothstep = (a: number, b: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
function compileRoughHierarchy(scene: HoleScene, mesh: TerrainMesh, style: MeridianStyle, attributes: MeridianVisualAttributes,
  featuresById: Map<string, LocalFeature>, ringsFor: (id: string) => { ring: readonly PointM[]; box: Bbox }[]):
  { secondary: number; outer: number; painted: number; classes: Record<string, number>; skippedUncertain: number } {
  const playing = [...featuresById.values()].filter(feature => PLAYING_KINDS.has(feature.kind))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).flatMap(feature => ringsFor(feature.id));
  const zones = (scene.contextZones ?? []).filter(zone => zone.render === 'ground' && zone.type !== 'LineString' && zone.class in GROUND_ZONE_CLASSES);
  const skippedUncertain = zones.filter(zone => zone.basis === 'uncertain').length;
  const painted = zones.filter(zone => zone.basis !== 'uncertain')
    .sort((a, b) => (GROUND_ZONE_PRIORITY.indexOf(a.class) - GROUND_ZONE_PRIORITY.indexOf(b.class)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(zone => {
      const entry = GROUND_ZONE_CLASSES[zone.class]!;
      const polygons = zone.parts.map(rings => ({ outer: rings[0] ?? [], holes: rings.slice(1), box: ringBbox(rings[0] ?? []) })).filter(p => p.outer.length >= 4);
      const rings = zone.parts.flat().map(ring => ({ ring, box: ringBbox(ring) }));
      return { zone, entry, polygons, rings, albedo: hexToRgb(style.palette[entry.palette]), classId: SURFACE_CLASS_IDS.indexOf(entry.surface) };
    });
  const { firstCutM, firstCutBlendM, secondaryM, secondaryBlendM, outerM, outerBlendM, slopeDarken, slopeFullAt, groundZoneBlendM } = style.roughHierarchy;
  const roughness = style.surface.roughness;
  const secondaryAlbedo = hexToRgb(style.palette.roughSecondary), outerAlbedo = hexToRgb(style.palette.roughOuter), firstCutAlbedo = hexToRgb(style.palette.roughFirstCut);
  const secondaryId = SURFACE_CLASS_IDS.indexOf('rough_secondary'), outerId = SURFACE_CLASS_IDS.indexOf('rough_outer');
  const v = mesh.vertices, cache = new Map<string, number>();
  const surroundFor = (point: PointM): number => {
    const key = `${point[0]}|${point[1]}`;
    const cached = cache.get(key);
    if (cached != null) return cached;
    let best = SURROUND_SEARCH_M;
    for (const { ring, box } of playing) {
      if (bboxDistance(point, box) >= best) continue;
      best = Math.min(best, boundaryDistance(point, ring));
    }
    cache.set(key, best);
    return best;
  };
  const counts = { secondary: 0, outer: 0, painted: 0, classes: {} as Record<string, number>, skippedUncertain };
  for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    const kind = mesh.featureKinds[mesh.triangleFeatures[t]!];
    if (kind !== 'ground' && kind !== 'rough') continue;
    const i = t * 9;
    // Triangle slope from the canonical vertices: 1 − |n·z|.
    const ux = v[i + 3]! - v[i]!, uy = v[i + 4]! - v[i + 1]!, uz = v[i + 5]! - v[i + 2]!;
    const wx = v[i + 6]! - v[i]!, wy = v[i + 7]! - v[i + 1]!, wz = v[i + 8]! - v[i + 2]!;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const slope = length > 0 ? 1 - Math.abs(nz) / length : 0;
    const slopeShade = 1 - slopeDarken * Math.min(1, slope / slopeFullAt);
    for (let corner = 0; corner < 3; corner++) {
      const vertex = t * 3 + corner, point: PointM = [v[vertex * 3]!, v[vertex * 3 + 1]!];
      // Surround and collar ribbons (materials 3/4) belong to the green
      // complex, not to the rough hierarchy.
      const current = attributes.surfaceClass[vertex];
      if (current !== SURFACE_CLASS_ROUGH && current !== SURFACE_CLASS_GROUND) continue;
      attributes.surroundDistanceCm[vertex] = Math.min(65535, Math.round(Math.min(surroundFor(point), 655) * 100));
      // Bands read the quantised value so the class and the stored distance
      // can never disagree by a rounding step.
      const distance = attributes.surroundDistanceCm[vertex]! / 100;
      const base: [number, number, number] = [attributes.albedo[vertex * 3]! / 255, attributes.albedo[vertex * 3 + 1]! / 255, attributes.albedo[vertex * 3 + 2]! / 255];
      let albedo = base, classId = -1, shade = 1;
      const zone = painted.find(z => z.polygons.some(p => bboxDistance(point, p.box) === 0 && inRing(point, p.outer) && !p.holes.some(hole => inRing(point, hole))));
      if (zone) {
        // Zone tone, blended in over a short band from the zone edge.
        let edge = Infinity;
        for (const { ring, box } of zone.rings) { if (bboxDistance(point, box) >= edge) continue; edge = Math.min(edge, boundaryDistance(point, ring)); }
        albedo = mix(base, zone.albedo, Math.min(1, edge / groundZoneBlendM));
        classId = zone.classId;
        attributes.turfWeight[vertex] = zone.entry.turf ? 255 : 0;
        attributes.roughness[vertex] = Math.round((roughness[zone.entry.surface] ?? roughness.ground) * 255);
        attributes.mowingWeight[vertex] = 0;
        shade = slopeShade;
        counts.painted++; counts.classes[zone.entry.surface] = (counts.classes[zone.entry.surface] ?? 0) + 1;
      } else {
        // Fidelity §33/§37: the first cut is the maintained strip of primary
        // rough beside the short grass; it keeps the rough class and only
        // lifts the tone toward the surround so the mowing ladder reads.
        const toPrimary = smoothstep(firstCutM - firstCutBlendM, firstCutM + firstCutBlendM, distance);
        const toSecondary = smoothstep(secondaryM - secondaryBlendM, secondaryM + secondaryBlendM, distance);
        const toOuter = smoothstep(outerM - outerBlendM, outerM + outerBlendM, distance);
        albedo = mix(mix(mix(firstCutAlbedo, base, toPrimary), secondaryAlbedo, toSecondary), outerAlbedo, toOuter);
        if (distance >= outerM) { classId = outerId; counts.outer++; shade = slopeShade; attributes.roughness[vertex] = Math.round(roughness.rough_outer * 255); }
        else if (distance >= secondaryM) { classId = secondaryId; counts.secondary++; shade = slopeShade; attributes.roughness[vertex] = Math.round(roughness.rough_secondary * 255); }
      }
      if (classId >= 0) attributes.surfaceClass[vertex] = classId;
      for (let c = 0; c < 3; c++) attributes.albedo[vertex * 3 + c] = Math.round(Math.min(1, Math.max(0, albedo[c]! * shade)) * 255);
    }
  }
  return counts;
}

/** Render-only bunker bowls (§27–32). Depth is a display convention chosen by
 * size class, never a measured hazard depth; the canonical mesh keeps the DEM
 * elevation and the reviewed outline. Every boundary vertex stays at depth
 * zero so the bowl meets the surrounding turf without a crack. */
function compileBunkerBowls(mesh: TerrainMesh, style: MeridianStyle, attributes: MeridianVisualAttributes,
  featuresById: Map<string, LocalFeature>, contextIds: Set<string>, ringsFor: (id: string) => { ring: readonly PointM[]; box: Bbox }[],
  greenRings: readonly { ring: readonly PointM[]; box: Bbox }[] = []): VisualBunkerProfile[] {
  const profiles: VisualBunkerProfile[] = [];
  const verticesByFeature = new Map<number, number[]>();
  for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    const featureIndex = mesh.triangleFeatures[t]!;
    if (mesh.featureKinds[featureIndex] !== 'bunker') continue;
    const list = verticesByFeature.get(featureIndex) ?? [];
    list.push(t * 3, t * 3 + 1, t * 3 + 2);
    verticesByFeature.set(featureIndex, list);
  }
  const v = mesh.vertices, contactBoxes: { rings: { ring: readonly PointM[]; box: Bbox }[]; box: Bbox; edgeBandM: number; edgeShade: number; lipM: number }[] = [];
  for (const [featureIndex, vertices] of [...verticesByFeature.entries()].sort((a, b) => a[0] - b[0])) {
    const id = mesh.featureIds[featureIndex]!, feature = featuresById.get(id), rings = ringsFor(id);
    if (!feature || !rings.length) continue;
    const contextOnly = contextIds.has(id), areaM2 = polygonArea(feature);
    const sizeClass: VisualBunkerProfile['sizeClass'] = areaM2 < style.bunker.smallAreaM2 ? 'small' : areaM2 > style.bunker.largeAreaM2 ? 'large' : 'medium';
    // Renderer redesign §9: family from size and distance to the nearest green ring.
    const outer = rings[0]?.ring ?? [];
    const centroid: PointM = outer.length ? [outer.reduce((sum, q) => sum + q[0], 0) / outer.length, outer.reduce((sum, q) => sum + q[1], 0) / outer.length] : [0, 0];
    const family: VisualBunkerProfile['family'] = areaM2 < style.bunker.potAreaM2 ? 'pot'
      : nearestRingDistance(centroid, greenRings, Infinity) < style.bunker.greensideReachM ? 'greenside' : 'fairway';
    const [low = 0, high = 0] = style.bunker.depthM[sizeClass];
    const depthM = (low + (high - low) * featureSeed(id)) * (contextOnly ? style.bunker.contextDepthScale : 1) * style.bunker.familyDepthScale[family];
    // Fidelity §26–28: no two bunker edges match. Lip height, contact band
    // and contact shade each vary per bunker by seed, inside the style range.
    const edgeSeed = featureSeed(`${id}:edge`), lipSeed = featureSeed(`${id}:lip`);
    const [lipLow = 0, lipHigh = 0] = style.bunker.lipM;
    const lipM = (lipLow + (lipHigh - lipLow) * lipSeed) * (contextOnly ? style.bunker.contextDepthScale : 1) * style.bunker.familyLipScale[family];
    const edgeBandM = style.bunker.contactBandM * (1 + (edgeSeed - .5) * 2 * style.bunker.edgeVariation);
    const edgeShade = style.bunker.contactShade * (1 + (featureSeed(`${id}:shade`) - .5) * 2 * style.bunker.edgeVariation);
    // Inradius from the deepest interior vertex; the bowl bottoms out there.
    const nearest = vertices.map(vertex => nearestOnRings([v[vertex * 3]!, v[vertex * 3 + 1]!], rings));
    const rimNormals = smoothedInwardNormals(rings);
    const inradius = nearest.reduce((max, n) => Math.max(max, n.distance), 0);
    const [radiusMin = .6, radiusMax = 3.5] = style.bunker.bowlRadiusM;
    const bowlRadiusM = Math.min(radiusMax, Math.max(radiusMin, inradius * style.bunker.bowlRadiusFraction));
    // A bowl is only as smooth as the vertices that carry it: a small bunker
    // triangulated as a fan from its rim has no interior support, and a full
    // depth there renders as radial shading spokes. Scale the bowl by the
    // interior vertex count so such pots stay flat under their lip.
    const interior = nearest.filter(n => n.distance > .5).length;
    const bowlSupport = Math.min(1, interior / Math.max(1, style.bunker.bowlSupportVertices));
    const bowlDepthM = depthM * bowlSupport;
    let effectiveDepthM = 0;
    vertices.forEach((vertex, index) => {
      const { distance, point, ringIndex, segment } = nearest[index]!;
      const u = Math.min(1, distance / bowlRadiusM), depth = bowlDepthM * smootherstep(u);
      attributes.bunkerDepthMm[vertex] = Math.round(depth * 1000);
      effectiveDepthM = Math.max(effectiveDepthM, attributes.bunkerDepthMm[vertex]! / 1000);
      // Gradient of depth: profile slope × unit vector away from the rim.
      const slope = u < 1 && distance > 0 ? bowlDepthM * smootherstepSlope(u) / bowlRadiusM : 0;
      const px = v[vertex * 3]! - point[0], py = v[vertex * 3 + 1]! - point[1];
      const gx = distance > 0 ? slope * px / distance : 0, gy = distance > 0 ? slope * py / distance : 0;
      attributes.bunkerSlope[vertex * 2] = Math.round(Math.max(-8, Math.min(8, gx)) * BUNKER_SLOPE_SCALE);
      attributes.bunkerSlope[vertex * 2 + 1] = Math.round(Math.max(-8, Math.min(8, gy)) * BUNKER_SLOPE_SCALE);
      // The floor darkens a little with depth (§31); the compiler's rim ribbons
      // keep their sand-edge / highlight albedo.
      // Overhang shadow (renderer redesign §9): sand just inside a rim that
      // faces the sun sits under the lip. The rim's smoothed inward normal at
      // the nearest point gives the facing; a positive dot of the outward
      // direction with the sun's ground direction means the rim stands
      // between the sand and the light. (The vertex-to-rim direction flips
      // vertex to vertex on a wiggly rim and painted shading spokes.)
      const rimNormal = rimNormals[ringIndex]?.[segment] ?? [0, 0];
      const sunFacing = Math.max(0, -rimNormal[0] * SUN_GROUND[0] - rimNormal[1] * SUN_GROUND[1]);
      const overhang = distance < style.bunker.overhangBandM ? style.bunker.overhangShade * sunFacing * (1 - distance / style.bunker.overhangBandM) : 0;
      const shade = (1 - style.bunker.floorShade * (bowlDepthM > 0 ? depth / bowlDepthM : 0)) * (1 - overhang);
      for (let c = 0; c < 3; c++) attributes.albedo[vertex * 3 + c] = Math.round(attributes.albedo[vertex * 3 + c]! * shade);
    });
    const box = rings.reduce((acc, { box: b }) => ({ minX: Math.min(acc.minX, b.minX), minY: Math.min(acc.minY, b.minY), maxX: Math.max(acc.maxX, b.maxX), maxY: Math.max(acc.maxY, b.maxY) }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const reachM = Math.max(edgeBandM, style.bunker.lipBandM);
    contactBoxes.push({ rings, edgeBandM, edgeShade, lipM, box: { minX: box.minX - reachM, minY: box.minY - reachM, maxX: box.maxX + reachM, maxY: box.maxY + reachM } });
    profiles.push({ featureId: id, areaM2: Math.round(areaM2 * 10) / 10, sizeClass, family, depthM: Math.round(depthM * 1000) / 1000, effectiveDepthM,
      bowlRadiusM: Math.round(bowlRadiusM * 1000) / 1000, depthBasis: 'visual_class', contextOnly, vertexCount: vertices.length, bowlSupport: Math.round(bowlSupport * 1000) / 1000,
      lipM: Math.round(lipM * 1000) / 1000, edgeBandM: Math.round(edgeBandM * 1000) / 1000, edgeShade: Math.round(edgeShade * 1000) / 1000 });
  }
  // Contact darkening (§32) and the grass lip (fidelity §26): turf within a
  // rim's band darkens toward the sand and rises as a rounded ridge that is
  // zero on the shared rim vertex and again at the band's outer edge, so the
  // conforming mesh never opens a crack while the rim reads as a lip.
  const lipBandM = style.bunker.lipBandM;
  if (contactBoxes.length) for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    if (mesh.featureKinds[mesh.triangleFeatures[t]!] === 'bunker') continue;
    for (let corner = 0; corner < 3; corner++) {
      const vertex = t * 3 + corner, point: PointM = [v[vertex * 3]!, v[vertex * 3 + 1]!];
      let nearest = Infinity, band = style.bunker.contactBandM, shadeAmount = style.bunker.contactShade, lipM = 0;
      for (const contact of contactBoxes) {
        if (bboxDistance(point, contact.box) > 0) continue;
        const distance = nearestOnRings(point, contact.rings).distance;
        if (distance < nearest) { nearest = distance; band = contact.edgeBandM; shadeAmount = contact.edgeShade; lipM = contact.lipM; }
      }
      if (nearest < lipBandM) attributes.lipLiftMm[vertex] = Math.round(lipM * Math.sin(Math.PI * nearest / lipBandM) * 1000);
      if (nearest >= band) continue;
      const shade = 1 - shadeAmount * (1 - nearest / band);
      for (let c = 0; c < 3; c++) attributes.albedo[vertex * 3 + c] = Math.round(attributes.albedo[vertex * 3 + c]! * shade);
    }
  }
  return profiles;
}

const SUN_GROUND: PointM = (() => { const [x, y] = TERRAIN_LIGHT_DIRECTION, n = Math.hypot(x, y) || 1; return [x / n, y / n]; })();
function expandBbox(box: Bbox, m: number): Bbox { return { minX: box.minX - m, minY: box.minY - m, maxX: box.maxX + m, maxY: box.maxY + m }; }
/** Distance to a polyline plus the nearest point on it (into `out`). */
function nearestOnPolyline(point: PointM, line: readonly PointM[], out: { d: number; x: number; y: number }): void {
  let best = Infinity, bx = line[0]![0], by = line[0]![1];
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!, [cx, cy] = line[i]!, dx = cx - ax, dy = cy - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / l2)) : 0;
    const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(point[0] - px, point[1] - py);
    if (d < best) { best = d; bx = px; by = py; }
  }
  out.d = best; out.x = bx; out.y = by;
}

/** Ground contact under context objects (renderer redesign §16): turf beside a
 * building footprint and along a path's shoulder darkens a little so the
 * extrusion and the ribbon read as resting on the ground. Uncertain zones
 * paint nothing; bunker sand and water are never touched. */
function compileContextContact(scene: HoleScene, mesh: TerrainMesh, style: MeridianStyle, attributes: MeridianVisualAttributes) {
  const { structureBandM, structureShade, pathShoulderM, pathShade, cutFillBankM, cutFillMaxM } = style.contextContact;
  const zones = (scene.contextZones ?? []).filter(zone => zone.basis !== 'uncertain');
  const structures = zones.filter(zone => zone.render === 'extrude' && zone.type !== 'LineString')
    .flatMap(zone => zone.parts.map(part => part[0]).filter((ring): ring is PointM[] => !!ring && ring.length >= 3))
    .map(ring => ({ ring, box: expandBbox(ringBbox(ring), structureBandM) }));
  const ribbonWidths = style.contextObjects.ribbons as Record<string, { widthM: number } | undefined>;
  const ribbons = zones.filter(zone => zone.render === 'ribbon' && zone.type === 'LineString').flatMap(zone => {
    const halfM = ((zone.attributes as { widthM?: number }).widthM ?? ribbonWidths[zone.class]?.widthM ?? 2.5) / 2;
    return zone.parts.flat().filter(line => line.length >= 2).map(line => ({ line, halfM, box: expandBbox(ringBbox(line), halfM + Math.max(pathShoulderM, cutFillBankM)) }));
  });
  if (!structures.length && !ribbons.length) return { structures: 0, ribbons: 0, vertices: 0, levelled: 0 };
  let touched = 0, levelled = 0;
  const v = mesh.vertices, nearest = { d: 0, x: 0, y: 0 };
  for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    const kind = mesh.featureKinds[mesh.triangleFeatures[t]!];
    if (kind === 'bunker' || kind === 'water') continue;
    for (let corner = 0; corner < 3; corner++) {
      const vertex = t * 3 + corner, point: PointM = [v[vertex * 3]!, v[vertex * 3 + 1]!];
      let shade = 1;
      for (const structure of structures) {
        if (bboxDistance(point, structure.box) > 0 || inRing(point, structure.ring)) continue;
        const d = boundaryDistance(point, structure.ring);
        if (d < structureBandM) shade *= 1 - structureShade * (1 - d / structureBandM);
      }
      let level: { d: number; halfM: number; x: number; y: number } | null = null;
      for (const ribbon of ribbons) {
        if (bboxDistance(point, ribbon.box) > 0) continue;
        nearestOnPolyline(point, ribbon.line, nearest);
        const d = nearest.d;
        if (d < ribbon.halfM + pathShoulderM) shade *= 1 - pathShade * (d <= ribbon.halfM ? 1 : 1 - (d - ribbon.halfM) / pathShoulderM);
        if (d < ribbon.halfM + cutFillBankM && (!level || d - ribbon.halfM < level.d - level.halfM)) level = { d, halfM: ribbon.halfM, x: nearest.x, y: nearest.y };
      }
      // Redesign 12 cut/fill: the ground under and beside a ribbon displays
      // at the ribbon's height (the canonical ground at the nearest centreline
      // point), feathered over the bank. Uphill that is a cut, downhill a
      // fill; the canonical vertex never moves.
      if (level && cutFillBankM > 0) {
        const target = terrainHeight(mesh, [level.x, level.y]);
        if (target != null) {
          const delta = Math.max(-cutFillMaxM, Math.min(cutFillMaxM, target - v[vertex * 3 + 2]!));
          const t = level.d <= level.halfM ? 0 : Math.min(1, (level.d - level.halfM) / cutFillBankM);
          const feather = 1 - t * t * (3 - 2 * t), offset = delta * feather;
          if (Math.abs(offset) >= .005) {
            attributes.groundLevelMm[vertex] = Math.round(offset * 1000);
            // Gradient of the offset: the feather's slope away from the ribbon.
            const dFeather = t > 0 && t < 1 ? -6 * t * (1 - t) / cutFillBankM : 0;
            const ux = level.d > 0 ? (point[0] - level.x) / level.d : 0, uy = level.d > 0 ? (point[1] - level.y) / level.d : 0;
            attributes.groundLevelSlope[vertex * 2] = Math.round(Math.max(-8, Math.min(8, delta * dFeather * ux)) * BUNKER_SLOPE_SCALE);
            attributes.groundLevelSlope[vertex * 2 + 1] = Math.round(Math.max(-8, Math.min(8, delta * dFeather * uy)) * BUNKER_SLOPE_SCALE);
            levelled++;
          }
        }
      }
      if (shade >= 1) continue;
      touched++;
      for (let c = 0; c < 3; c++) attributes.albedo[vertex * 3 + c] = Math.round(attributes.albedo[vertex * 3 + c]! * shade);
    }
  }
  return { structures: structures.length, ribbons: ribbons.length, vertices: touched, levelled };
}

/** Shoreline contact (§44): turf within the contact band of a drawn shoreline
 * darkens a little toward the water. The canonical shoreline never moves; the
 * water's own interior gradient is a shader term over boundary distance (§45). */
function compileShorelines(mesh: TerrainMesh, style: MeridianStyle, attributes: MeridianVisualAttributes,
  featuresById: Map<string, LocalFeature>, ringsFor: (id: string) => { ring: readonly PointM[]; box: Bbox }[]): number {
  const band = style.water.contactBandM, bankBand = style.water.bankLipBandM, reach = Math.max(band, bankBand);
  const shores = [...featuresById.values()].filter(feature => feature.kind === 'water')
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map(feature => ringsFor(feature.id)).filter(rings => rings.length)
    .map(rings => ({ rings, box: rings.reduce((acc, { box: b }) => ({ minX: Math.min(acc.minX, b.minX - reach), minY: Math.min(acc.minY, b.minY - reach), maxX: Math.max(acc.maxX, b.maxX + reach), maxY: Math.max(acc.maxY, b.maxY + reach) }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }) }));
  if (!shores.length) return 0;
  const v = mesh.vertices;
  let shaded = 0;
  for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    if (mesh.featureKinds[mesh.triangleFeatures[t]!] === 'water') continue;
    for (let corner = 0; corner < 3; corner++) {
      const vertex = t * 3 + corner, point: PointM = [v[vertex * 3]!, v[vertex * 3 + 1]!];
      let nearest = Infinity;
      for (const shore of shores) {
        if (bboxDistance(point, shore.box) > 0) continue;
        nearest = Math.min(nearest, nearestOnRings(point, shore.rings).distance);
      }
      // Render-only bank berm (renderer redesign §13): zero on the shoreline
      // vertex so the water plane never opens a crack, crest at half the band.
      if (nearest < bankBand) attributes.lipLiftMm[vertex] = Math.max(attributes.lipLiftMm[vertex]!, Math.round(style.water.bankLipM * Math.sin(Math.PI * nearest / bankBand) * 1000));
      if (nearest >= band) continue;
      const shade = 1 - style.water.contactShade * (1 - nearest / band);
      for (let c = 0; c < 3; c++) attributes.albedo[vertex * 3 + c] = Math.round(attributes.albedo[vertex * 3 + c]! * shade);
      shaded++;
    }
  }
  return shaded;
}

/** Display-surface height sampler (§33): canonical elevation minus the
 * render-only bowl depth at the point. Used only to place drawn markers on
 * drawn sand; `terrainHeight` stays the elevation of record everywhere else. */
export function createVisualSurfaceSampler(mesh: TerrainMesh, artifact: MeridianVisualArtifact): (point: PointM) => number | null {
  const depth = artifact.attributes.bunkerDepthMm, lift = artifact.attributes.lipLiftMm, triangles: number[] = [];
  for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    const a = t * 3;
    if (depth[a]! || depth[a + 1]! || depth[a + 2]! || lift[a]! || lift[a + 1]! || lift[a + 2]!) triangles.push(t);
  }
  const v = mesh.vertices;
  return ([x, y]) => {
    const z = terrainHeight(mesh, [x, y]);
    if (z == null) return null;
    for (const t of triangles) {
      const i = t * 9, ax = v[i]!, ay = v[i + 1]!, bx = v[i + 3]!, by = v[i + 4]!, cx = v[i + 6]!, cy = v[i + 7]!;
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(det) < 1e-10) continue;
      const a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
      if (a >= -1e-6 && b >= -1e-6 && a + b <= 1 + 1e-6) {
        return z - (a * depth[t * 3]! + b * depth[t * 3 + 1]! + (1 - a - b) * depth[t * 3 + 2]!) / 1000
          + (a * lift[t * 3]! + b * lift[t * 3 + 1]! + (1 - a - b) * lift[t * 3 + 2]!) / 1000;
      }
    }
    return z;
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
    a.bunkerSlope.length !== artifact.vertexCount * 2 || a.groundLevelSlope.length !== artifact.vertexCount * 2 ||
    [a.mowingWeight, a.turfWeight, a.contextWeight, a.roughness, a.surfaceClass, a.boundaryDistanceCm, a.bunkerDepthMm, a.surroundDistanceCm, a.lipLiftMm, a.groundLevelMm].some(view => view.length !== artifact.vertexCount)) problems.push('attributes');
  // Context gate (outside world §35): ground zones painted from another
  // context layer, or from none when the scene now carries one, are stale.
  if ((artifact.contextLayerHash ?? null) !== (scene.contextLayerHash ?? null)) problems.push('context');
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
    bunkerSlope: new Int16Array(aligned('bunkerSlope')), surroundDistanceCm: new Uint16Array(aligned('surroundDistanceCm')), lipLiftMm: new Uint16Array(aligned('lipLiftMm')), groundLevelMm: new Int16Array(aligned('groundLevelMm')), groundLevelSlope: new Int16Array(aligned('groundLevelSlope')),
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
