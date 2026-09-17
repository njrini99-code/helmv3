/** Per-vertex context for the V2 ground (fidelity §65 #5 / outside-world
 * §10–16, §21; master §53): the two things the V2 mesh does not carry and
 * the field atlas cannot answer — which vertices sit on a neighbouring
 * hole's playing surface (V1 `contextWeight`), and which rough/ground
 * vertices lie inside a classified, source-backed context zone (V1
 * `compileRoughHierarchy`'s zone branch). Both are V1's own rules, per
 * vertex, from the scene's polygons alone, so the V2 world can bake them
 * at build time without a V2 artifact format change.
 *
 * - `context`: 1 on a vertex of a context feature's triangle (a
 *   neighbouring hole's fairway, tee, green, bunker, water, woods — V1's
 *   `contextOnly` by feature id, given the mesh's triangle features), else
 *   0; a geometry without triangle features (a hero patch) falls back to
 *   point-in-polygon against the context features' polygons, minus woods
 *   (own and neighbouring woods polygons overlap, and V1 never marks an own
 *   feature's triangle). The shader mixes a context fairway/green's atlas
 *   colour toward rough by `context.roughMix` and desaturates by
 *   `context.desaturate` (V1 §53), so a neighbour reads as real but quieter.
 * - `zone`: for `ground`/`rough` vertices inside a painted zone, V1's blend
 *   `min(1, edge / groundZoneBlendM)` from the zone's own boundary inward,
 *   signed: positive for a turf zone, NEGATIVE for a non-turf one
 *   (parking), so one interpolating float carries both the weight and the
 *   turf switch. 0 elsewhere. `uncertain` zones paint nothing (an
 *   unexplained region stays honestly unexplained); zones overlap by
 *   `GROUND_ZONE_PRIORITY`. The vertex colour and roughness take the zone's
 *   own by that weight (`zoneSurface`), and the shader turns the rough
 *   hierarchy off by the same weight — a zone has its tone, not a band.
 *
 * Three-free; `three-world-v2.ts` uploads the two arrays as the
 * `golfV2Context` / `golfV2Zone` attributes. */
import { bboxDistance, ringBbox, type Bbox } from './bunker-profile';
import { boundaryDistance } from './display-outline';
import { inRing } from './spatial';
import type { HoleScene, LocalFeature, PointM } from './types';
import { GROUND_ZONE_CLASSES, GROUND_ZONE_PRIORITY, SURFACE_CLASS_IDS, type SurfaceClass } from './visual-artifact';
import { MERIDIAN_STYLE, type MeridianStyle } from './visual-style';

export interface GroundContextAttributes {
  /** Per vertex, 0 or 1: on a context (neighbouring-hole) feature. */
  context: Float32Array;
  /** Per vertex, signed zone weight in [-1, 1] (see the header); 0 = no zone. */
  zone: Float32Array;
  /** Per vertex, the zone's surface class when `zone` is non-zero (else the vertex's own). */
  zoneSurface: SurfaceClass[];
  stats: { contextVertices: number; zoneVertices: number; zoneClasses: Record<string, number>; skippedUncertain: number };
}

interface Polygon { outer: readonly PointM[]; holes: readonly (readonly PointM[])[]; box: Bbox }
function polygonsOf(parts: readonly (readonly (readonly PointM[])[])[]): Polygon[] {
  return parts.map(rings => ({ outer: rings[0] ?? [], holes: rings.slice(1), box: ringBbox(rings[0] ?? []) })).filter(p => p.outer.length >= 4);
}
const contains = (point: PointM, polygons: readonly Polygon[]): Polygon | undefined =>
  polygons.find(p => bboxDistance(point, p.box) === 0 && inRing(point, p.outer) && !p.holes.some(hole => inRing(point, hole)));

/** The zones V1 paints, in V1's priority order. */
export function paintedGroundZones(scene: HoleScene): { zone: NonNullable<HoleScene['contextZones']>[number]; polygons: Polygon[]; surface: SurfaceClass; turf: boolean }[] {
  return (scene.contextZones ?? [])
    .filter(zone => zone.render === 'ground' && zone.type !== 'LineString' && zone.class in GROUND_ZONE_CLASSES && zone.basis !== 'uncertain')
    .sort((a, b) => (GROUND_ZONE_PRIORITY.indexOf(a.class) - GROUND_ZONE_PRIORITY.indexOf(b.class)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(zone => { const entry = GROUND_ZONE_CLASSES[zone.class]!; return { zone, polygons: polygonsOf(zone.parts), surface: entry.surface, turf: entry.turf }; });
}

/** The indexed mesh's triangle → feature mapping, for the by-identity
 * context rule (`PackedDisplayMesh.triangleFeatures` / `indices` with the
 * terrain mesh's `featureIds`). */
export interface GroundContextTriangles { indices: Uint32Array; triangleFeatures: Uint16Array; featureIds: readonly string[] }
export function compileGroundContextAttributes(scene: HoleScene, positions: Float32Array, classIds: Uint8Array, style: MeridianStyle = MERIDIAN_STYLE, triangles: GroundContextTriangles | null = null): GroundContextAttributes {
  const vertexCount = classIds.length;
  const context = new Float32Array(vertexCount), zone = new Float32Array(vertexCount), zoneSurface: SurfaceClass[] = new Array<SurfaceClass>(vertexCount);
  const contextFeatures = scene.contextFeatures ?? [];
  const contextPolygons = triangles ? [] : contextFeatures.filter((feature: LocalFeature) => feature.type !== 'LineString' && feature.kind !== 'woods').flatMap(feature => polygonsOf(feature.parts));
  if (triangles) {
    const contextIds = new Set(contextFeatures.map(feature => feature.id));
    for (let t = 0; t < triangles.triangleFeatures.length; t++) {
      if (!contextIds.has(triangles.featureIds[triangles.triangleFeatures[t]!] ?? '')) continue;
      for (let k = 0; k < 3; k++) context[triangles.indices[t * 3 + k]!] = 1;
    }
  }
  const zones = paintedGroundZones(scene);
  const skippedUncertain = (scene.contextZones ?? []).filter(z => z.render === 'ground' && z.type !== 'LineString' && z.class in GROUND_ZONE_CLASSES && z.basis === 'uncertain').length;
  const blendM = style.roughHierarchy.groundZoneBlendM;
  const ground = SURFACE_CLASS_IDS.indexOf('ground'), rough = SURFACE_CLASS_IDS.indexOf('rough');
  const stats = { contextVertices: 0, zoneVertices: 0, zoneClasses: {} as Record<string, number>, skippedUncertain };
  for (let v = 0; v < vertexCount; v++) {
    const point: PointM = [positions[v * 3]!, positions[v * 3 + 1]!];
    zoneSurface[v] = SURFACE_CLASS_IDS[classIds[v]!] ?? 'ground';
    if (contextPolygons.length && contains(point, contextPolygons)) context[v] = 1;
    if (context[v]! > 0) stats.contextVertices++;
    const cls = classIds[v];
    if (cls !== ground && cls !== rough) continue;
    for (const candidate of zones) {
      const polygon = contains(point, candidate.polygons);
      if (!polygon) continue;
      // Zone tone, blended in over a short band from the zone's own edge (V1).
      let edge = boundaryDistance(point, polygon.outer);
      for (const hole of polygon.holes) edge = Math.min(edge, boundaryDistance(point, hole));
      const weight = Math.min(1, edge / blendM);
      zone[v] = candidate.turf ? weight : -weight;
      zoneSurface[v] = candidate.surface;
      stats.zoneVertices++; stats.zoneClasses[candidate.surface] = (stats.zoneClasses[candidate.surface] ?? 0) + 1;
      break;
    }
  }
  return { context, zone, zoneSurface, stats };
}
