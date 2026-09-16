/** Outside-world context layer (production player-view spec, 2026-09-16,
 * §8, §31–34). A sidecar to the canonical package: classified non-playing
 * zones (paths, buildings, woods, water, open land) retained from explicit
 * sources and locked to one package hash. It explains the land around the
 * hole for rendering and orientation only; nothing here feeds picking, shot
 * reconstruction, framing metrics or persisted player state. */
import { z } from 'zod';
import { CONTEXT_CLASSES, CONTEXT_FIDELITY, CONTEXT_RENDER, type ContextClass, type ContextFidelity, type ContextRender } from './context-taxonomy';
import { projectToLocal } from './project';
import type { CourseGeometryPackage, Geometry, PointM, PositionWgs84 } from './types';
import type { TerrainMesh } from './terrain';

export const CONTEXT_LAYER_KIND = 'golfhelm-context-layer-v1';
const position = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
const id = z.string().min(1).max(160);
const ring = z.array(position).min(4).max(2048).refine(r => r[0]![0] === r.at(-1)![0] && r[0]![1] === r.at(-1)![1], 'Unclosed ring');
const geometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LineString'), coordinates: z.array(position).min(2).max(2048) }).strict(),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1).max(16) }).strict(),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring).min(1).max(16)).min(1).max(64) }).strict(),
]);
const zoneSchema = z.object({
  id, class: z.enum(CONTEXT_CLASSES as unknown as [ContextClass, ...ContextClass[]]),
  geometryWgs84: geometry, sourceIds: z.array(id).min(1).max(8), holeKeys: z.array(id).max(36),
  /** `source`: geometry and class straight from a retained source. `derived`:
   * computed from source geometry by a stated rule. `uncertain`: needs review. */
  basis: z.enum(['source', 'derived', 'uncertain']), reviewed: z.boolean(),
  fidelity: z.enum(['high', 'medium', 'low']),
  attributes: z.object({
    widthM: z.number().finite().positive().max(40).optional(), heightM: z.number().finite().positive().max(60).optional(),
    levels: z.number().int().min(1).max(30).optional(), surface: z.string().max(40).optional(), name: z.string().max(120).optional(),
    /** Which numbers were defaults rather than source values. */
    defaults: z.array(z.enum(['widthM', 'heightM'])).max(2).optional(),
    osmTags: z.record(z.string().max(60), z.string().max(200)).optional(),
  }).strict(),
}).strict();
const layerSchema = z.object({
  kind: z.literal(CONTEXT_LAYER_KIND), siteId: id, packageHash: z.string().regex(/^[a-f0-9]{64}$/),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), originWgs84: position,
  sources: z.array(z.object({ id, provider: z.string().max(100), licenseId: z.string().max(100), url: z.url().refine(u => u.startsWith('https://')),
    retrievedAt: z.string().max(40), attribution: z.string().min(1).max(300) }).strict()).min(1).max(16),
  zones: z.array(zoneSchema).max(4000),
  review: z.object({ status: z.enum(['unreviewed', 'partial', 'reviewed']), reviewedAt: z.string().max(40).nullable(), notes: z.array(z.string().max(400)).max(200) }).strict(),
}).strict();
export type ContextZone = z.infer<typeof zoneSchema>;
export type ContextLayer = z.infer<typeof layerSchema>;

/** A zone in the hole's local metre frame, ready for the renderer. */
export interface LocalContextZone {
  id: string; class: ContextClass; type: Geometry['type']; parts: PointM[][][];
  basis: ContextZone['basis']; reviewed: boolean; fidelity: ContextFidelity; render: ContextRender;
  attributes: ContextZone['attributes'];
}

export const CONTEXT_LAYER_MISMATCH = 'MERIDIAN_CONTEXT_LAYER_MISMATCH';

/** Bounded parser. Refuses a layer built for another package (§6-style hash
 * gate): stale context must never explain a newer course. */
export function parseContextLayer(input: unknown, pkg: Pick<CourseGeometryPackage, 'contentHash' | 'siteId' | 'originWgs84'>): ContextLayer {
  if (JSON.stringify(input).length > 6_000_000) throw new Error('Context layer exceeds 6 MB');
  const layer = layerSchema.parse(input);
  const problems: string[] = [];
  if (layer.packageHash !== pkg.contentHash) problems.push(`package ${layer.packageHash.slice(0, 12)} ≠ ${pkg.contentHash.slice(0, 12)}`);
  if (layer.siteId !== pkg.siteId) problems.push(`site ${layer.siteId} ≠ ${pkg.siteId}`);
  if (layer.originWgs84.some((v, i) => v !== pkg.originWgs84[i])) problems.push('origin differs');
  if (new Set(layer.zones.map(z => z.id)).size !== layer.zones.length) problems.push('duplicate zone id');
  for (const zone of layer.zones) {
    if (zone.sourceIds.some(s => !layer.sources.some(source => source.id === s))) problems.push(`unresolved source: ${zone.id}`);
    if (zone.fidelity !== CONTEXT_FIDELITY[zone.class]) problems.push(`fidelity ${zone.fidelity} ≠ ${CONTEXT_FIDELITY[zone.class]} for ${zone.class}: ${zone.id}`);
    if (CONTEXT_RENDER[zone.class] === 'ribbon' && zone.geometryWgs84.type !== 'LineString' && zone.class !== 'bridge') problems.push(`ribbon class needs a line: ${zone.id}`);
    if (CONTEXT_RENDER[zone.class] === 'extrude' && zone.geometryWgs84.type === 'LineString') problems.push(`extrude class needs an area: ${zone.id}`);
  }
  if (problems.length) throw new Error(`${CONTEXT_LAYER_MISMATCH}: ${problems.join('; ')}`);
  return layer;
}

export function localContextZone(zone: ContextZone, origin: PositionWgs84): LocalContextZone {
  const g = zone.geometryWgs84;
  const parts = g.type === 'LineString' ? [[g.coordinates]] : g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return { id: zone.id, class: zone.class, type: g.type, basis: zone.basis, reviewed: zone.reviewed, fidelity: zone.fidelity,
    render: CONTEXT_RENDER[zone.class], attributes: zone.attributes,
    parts: parts.map(rings => rings.map(r => r.map(p => projectToLocal(p, origin)))) };
}

/** Zones for one hole: those the authoring pass attached to the hole, clipped
 * to the terrain footprint the hole actually draws (with a small margin so a
 * ribbon can leave the frame cleanly). Zones are display-only. */
export function contextZonesForHole(layer: ContextLayer, pkg: Pick<CourseGeometryPackage, 'originWgs84'>, holeKey: string, terrain?: Pick<TerrainMesh, 'vertices'>, marginM = 24): LocalContextZone[] {
  let minX = -Infinity, minY = -Infinity, maxX = Infinity, maxY = Infinity;
  if (terrain) {
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
    for (let i = 0; i < terrain.vertices.length; i += 3) {
      const x = terrain.vertices[i]!, y = terrain.vertices[i + 1]!;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    minX -= marginM; minY -= marginM; maxX += marginM; maxY += marginM;
  }
  const zones: LocalContextZone[] = [];
  for (const zone of layer.zones) {
    if (!zone.holeKeys.includes(holeKey)) continue;
    const local = localContextZone(zone, pkg.originWgs84);
    const points = local.parts.flat(2);
    if (terrain && !points.some(([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY)) continue;
    zones.push(local);
  }
  return zones.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Short summary for telemetry and reports: zone counts per class. */
export function summarizeContextZones(zones: readonly LocalContextZone[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const zone of zones) counts[zone.class] = (counts[zone.class] ?? 0) + 1;
  return counts;
}
