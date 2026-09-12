import { z } from 'zod';
import type { CourseGeometryPackage, GeometryFeature, LocalFeature } from './types';
import { projectToLocal } from './project';
import { inFeature, inRing, simpleRing, segmentsIntersect } from './spatial';

const position = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
const id = z.string().min(1).max(160);
const ring = z.array(position).min(4).max(512).refine(r =>
  r[0]![0] === r.at(-1)![0] && r[0]![1] === r.at(-1)![1], 'Unclosed ring');
const geometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LineString'), coordinates: z.array(position).min(2).max(512) }).strict(),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1).max(16) }).strict(),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring).min(1).max(16)).min(1).max(32) }).strict(),
]);
const packageSchema = z.object({
  schemaVersion: z.literal(1), siteId: id, name: z.string().min(1).max(200),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), status: z.literal('reviewed_draft'),
  originWgs84: position, projection: z.literal('wgs84-local-enu-v1'),
  sources: z.array(z.object({ id, provider: z.string().max(100), licenseId: z.string().max(100),
    url: z.url().refine(u => u.startsWith('https://')), capturedAt: z.string().max(40).nullable(),
    retrievedAt: z.string().max(40), attribution: z.string().min(1).max(300) }).strict()).min(1).max(32),
  features: z.array(z.object({ id, kind: z.enum(['route', 'tee', 'fairway', 'green', 'bunker', 'water', 'rough', 'woods']),
    sourceIds: z.array(id).min(1).max(32), holeKeys: z.array(id).min(1).max(36),
    geometryWgs84: geometry, reviewed: z.boolean(), accuracyMeters: z.number().finite().positive().nullable(),
  }).strict()).min(1).max(1000),
  holes: z.array(z.object({ key: id, ordinal: z.number().int().min(1).max(36), par: z.number().int().min(3).max(6),
    scorecardYards: z.number().finite().positive().nullable(), featureIds: z.array(id).min(1).max(200),
    routeFeatureId: id, greenFeatureId: id.nullable(), nominalTargetWgs84: position.nullable(),
    completeness: z.enum(['partial', 'reviewed_surfaces', 'route_only']), gaps: z.array(z.string().max(300)).max(30),
  }).strict()).min(1).max(36),
}).strict();
export function localFeature(f: GeometryFeature, pkg: Pick<CourseGeometryPackage, 'originWgs84'>): LocalFeature {
  const geometry = f.geometryWgs84;
  const parts = geometry.type === 'LineString' ? [[geometry.coordinates]] :
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return { id: f.id, kind: f.kind, type: geometry.type, reviewed: f.reviewed,
    parts: parts.map(rings => rings.map(r => r.map(p => projectToLocal(p, pkg.originWgs84)))) };
}
/** Bounded preparation validator. Content hash is verified by the report/import
 * tool; this pure parser does not authorize publication. No uploaded SVG. */
export function parseGeometryPackage(input: unknown): CourseGeometryPackage {
  if (JSON.stringify(input).length > 4_000_000) throw new Error('Geometry exceeds 4 MB');
  const pkg = packageSchema.parse(input);
  const unique = (ids: (string | number)[]) => new Set(ids).size === ids.length;
  if (!unique(pkg.features.map(f => f.id)) || !unique(pkg.sources.map(s => s.id)) ||
    !unique(pkg.holes.map(h => h.key)) || !unique(pkg.holes.map(h => h.ordinal))) throw new Error('Duplicate identity');
  let vertices = 0;
  for (const f of pkg.features) {
    if ((f.kind === 'route') !== (f.geometryWgs84.type === 'LineString')) throw new Error(`Geometry kind mismatch: ${f.id}`);
    if (f.sourceIds.some(s => !pkg.sources.some(source => source.id === s)) ||
      f.holeKeys.some(k => !pkg.holes.some(h => h.key === k && h.featureIds.includes(f.id)))) throw new Error(`Unresolved feature reference: ${f.id}`);
    const local = localFeature(f, pkg);
    for (const rings of local.parts) {
      vertices += rings.reduce((n, r) => n + r.length, 0);
      if (vertices > 40_000) throw new Error('Geometry exceeds 40000 vertices');
      if (local.type === 'LineString') continue;
      for (const r of rings) if (!simpleRing(r)) throw new Error(`Invalid ring: ${f.id}`);
      for (let i = 1; i < rings.length; i++) {
        if (!inRing(rings[i]![0]!, rings[0]!)) throw new Error(`Hole outside shell: ${f.id}`);
        for (let j = 0; j < i; j++) {
          const a = rings[i]!, b = rings[j]!;
          for (let x = 0; x < a.length - 1; x++) for (let y = 0; y < b.length - 1; y++) {
            if (segmentsIntersect(a[x]!, a[x + 1]!, b[y]!, b[y + 1]!)) throw new Error(`Intersecting rings: ${f.id}`);
          }
          if (j > 0 && (inRing(a[0]!, b) || inRing(b[0]!, a))) throw new Error(`Nested holes: ${f.id}`);
        }
      }
    }
  }
  for (const h of pkg.holes) {
    if (!unique(h.featureIds) || h.featureIds.some(id => !pkg.features.some(f => f.id === id && f.holeKeys.includes(h.key)))) throw new Error(`Invalid hole references: ${h.key}`);
    const route = pkg.features.find(f => f.id === h.routeFeatureId && f.kind === 'route');
    if (!route || !h.featureIds.includes(route.id)) throw new Error(`Missing route: ${h.key}`);
    const green = pkg.features.find(f => f.id === h.greenFeatureId && f.kind === 'green');
    if (h.greenFeatureId && (!green || !h.featureIds.includes(green.id))) throw new Error(`Missing green: ${h.key}`);
    if (h.nominalTargetWgs84 && (!green || !inFeature(projectToLocal(h.nominalTargetWgs84, pkg.originWgs84), localFeature(green, pkg)))) throw new Error(`Reference outside green: ${h.key}`);
    if (h.completeness === 'reviewed_surfaces' && (h.gaps.length || !green || h.featureIds.some(id => !pkg.features.find(f => f.id === id)?.reviewed))) throw new Error(`Unsupported reviewed capability: ${h.key}`);
  }
  return pkg;
}
