import { z } from 'zod';
import type { CourseGeometryPolicy } from './course-policy';

/** The library catalog (Factory v2 §3, §28): checked-in JSON under
 * `course-geometry/catalog/`. A facility owns the physical property and its
 * source pins; a layout is the played product (segments → hole order); a
 * scorecard profile owns tee/par/yardage for one layout. The registry
 * (`course-registry.ts`) lists the layouts the app may draw; the catalog
 * lists every layout the factory knows, drawn or not (tier C0 up). */

const position = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case id');
const osmRef = z.string().regex(/^(?:node|way|relation)\/\d+$/, 'osm element ref');
const siteId = z.string().regex(/^osm-(?:node|way|relation)-\d+$/, 'osm site id');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const tier = z.enum(['C0', 'C1', 'C2', 'C3', 'C4']);

export const facilityManifestSchema = z.object({
  schema: z.literal('golfhelm-facility-v1'),
  facilityId: slug,
  name: z.string().min(1).max(160),
  country: z.string().length(2),
  region: z.string().min(1).max(40),
  originWgs84: position,
  aoi: z.object({ kind: z.literal('osm'), id: osmRef, marginM: z.number().int().min(0).max(2000) }).strict(),
  sourcePins: z.object({ osm: z.array(osmRef).min(1).max(50) }).strict(),
  providerPolicy: z.object({
    terrain: z.array(z.string().min(1)).min(1),
    imagery: z.array(z.string().min(1)).min(1),
    context: z.array(z.string().min(1)).min(1),
  }).strict(),
  knownRenovationAfter: isoDate.nullable().optional(),
  notes: z.array(z.string()).max(20).optional(),
  /** Retained artifacts the factory may adopt instead of rebuilding (repo-relative paths, keyed by artifact kind). */
  retained: z.record(z.string().regex(/^[a-zA-Z]+$/), z.string().min(1)).optional(),
}).strict();
export type FacilityManifest = z.infer<typeof facilityManifestSchema>;

const holeKey = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-\d{2}$/, 'hole key <segment-or-course>-NN');
export const layoutManifestSchema = z.object({
  schema: z.literal('golfhelm-layout-v1'),
  layoutId: slug,
  facilityId: slug,
  name: z.string().min(1).max(160),
  /** Package `siteId`s a served package for this layout may carry. */
  siteIds: z.array(siteId).min(1).max(8),
  segments: z.record(slug, z.object({ holes: z.array(holeKey).min(1).max(27) }).strict()),
  segmentOrder: z.array(slug).min(1).max(4),
  holeOrder: z.array(holeKey).min(1).max(36),
  /** OSM `golf=hole` way ids in played order; null until the route set is resolved (tier C0). */
  routeWayIds: z.array(z.number().int().positive()).min(1).max(36).nullable(),
  bboxWgs84: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  capabilityTier: tier,
  externalBindings: z.object({ golfCourseIds: z.array(z.string().uuid()).max(8) }).strict(),
  scorecardProfiles: z.array(slug).max(8),
  geometry: z.object({ package: z.string().min(1), published: z.string().min(1).nullable() }).strict().nullable(),
  knownRenovationAfter: isoDate.nullable().optional(),
  notes: z.array(z.string()).max(20).optional(),
  retained: z.record(z.string().regex(/^[a-zA-Z]+$/), z.string().min(1)).optional(),
}).strict().superRefine((layout, ctx) => {
  const inSegments = new Set(layout.segmentOrder.flatMap(s => layout.segments[s]?.holes ?? []));
  for (const s of layout.segmentOrder) if (!layout.segments[s]) ctx.addIssue({ code: 'custom', message: `segmentOrder names unknown segment ${s}`, path: ['segmentOrder'] });
  if (new Set(layout.holeOrder).size !== layout.holeOrder.length) ctx.addIssue({ code: 'custom', message: 'holeOrder repeats a hole', path: ['holeOrder'] });
  for (const h of layout.holeOrder) if (!inSegments.has(h)) ctx.addIssue({ code: 'custom', message: `hole ${h} is in no ordered segment`, path: ['holeOrder'] });
  if (layout.routeWayIds && layout.routeWayIds.length !== layout.holeOrder.length) ctx.addIssue({ code: 'custom', message: 'one route way per hole', path: ['routeWayIds'] });
  if (layout.capabilityTier !== 'C0' && !layout.geometry) ctx.addIssue({ code: 'custom', message: 'a layout above C0 names its geometry package', path: ['geometry'] });
});
export type LayoutManifest = z.infer<typeof layoutManifestSchema>;

export const scorecardProfileSchema = z.object({
  schema: z.literal('golfhelm-scorecard-profile-v1'),
  profileId: slug,
  layoutId: slug,
  teeName: z.string().min(1).max(60).nullable(),
  source: z.object({
    provider: z.enum(['official_course_site', 'helm_course_library', 'owner_supplied']),
    url: z.string().url().nullable(),
    retrievedAt: isoDate,
    // Preserve source qualifications; keep this limit in sync with catalog.py.
    note: z.string().max(4096).optional(),
  }).strict(),
  holes: z.array(z.object({
    hole: z.number().int().min(1).max(36),
    par: z.number().int().min(3).max(6),
    yards: z.number().int().min(50).max(800),
    handicap: z.number().int().min(1).max(36).optional(),
  }).strict()).min(9).max(36),
}).strict().superRefine((card, ctx) => {
  card.holes.forEach((h, i) => { if (h.hole !== i + 1) ctx.addIssue({ code: 'custom', message: `holes run 1..n in order (index ${i} is hole ${h.hole})`, path: ['holes', i, 'hole'] }); });
});
export type ScorecardProfile = z.infer<typeof scorecardProfileSchema>;

export function parseFacilityManifest(input: unknown): FacilityManifest { return facilityManifestSchema.parse(input); }
export function parseLayoutManifest(input: unknown): LayoutManifest { return layoutManifestSchema.parse(input); }
export function parseScorecardProfile(input: unknown): ScorecardProfile { return scorecardProfileSchema.parse(input); }

export interface CourseCatalog {
  facilities: readonly FacilityManifest[];
  layouts: readonly LayoutManifest[];
  scorecards: readonly ScorecardProfile[];
}

/** Cross-file invariants the per-file schemas cannot see. Returns every
 * problem so a catalog review reads them all at once; an empty list is a
 * consistent catalog. With a registry, every drawn layout must be
 * catalogued and agree with its manifest on facility, sites, tier and
 * library bindings; a catalogued layout need not be drawn. */
export function catalogProblems(catalog: CourseCatalog, registry: readonly CourseGeometryPolicy[] = []): string[] {
  const problems: string[] = [];
  const facilities = new Map(catalog.facilities.map(f => [f.facilityId, f]));
  const layouts = new Map(catalog.layouts.map(l => [l.layoutId, l]));
  const cards = new Map(catalog.scorecards.map(c => [c.profileId, c]));
  if (facilities.size !== catalog.facilities.length) problems.push('duplicate facilityId');
  if (layouts.size !== catalog.layouts.length) problems.push('duplicate layoutId');
  if (cards.size !== catalog.scorecards.length) problems.push('duplicate scorecard profileId');
  const sites = new Map<string, string>();
  for (const l of catalog.layouts) {
    if (!facilities.has(l.facilityId)) problems.push(`layout ${l.layoutId}: unknown facility ${l.facilityId}`);
    for (const s of l.siteIds) {
      const facility = facilities.get(l.facilityId);
      if (facility && !facility.sourcePins.osm.includes(s.replace(/^osm-(\w+)-(\d+)$/, '$1/$2'))) problems.push(`layout ${l.layoutId}: site ${s} is not pinned by facility ${l.facilityId}`);
      const other = sites.get(s);
      if (other && layouts.get(other)?.facilityId !== l.facilityId) problems.push(`site ${s} is claimed by ${other} and ${l.layoutId} in different facilities`);
      sites.set(s, l.layoutId);
    }
    for (const p of l.scorecardProfiles) {
      const card = cards.get(p);
      if (!card) problems.push(`layout ${l.layoutId}: unknown scorecard profile ${p}`);
      else if (card.layoutId !== l.layoutId) problems.push(`scorecard ${p} belongs to ${card.layoutId}, listed by ${l.layoutId}`);
      else if (card.holes.length !== l.holeOrder.length) problems.push(`scorecard ${p} has ${card.holes.length} holes, layout ${l.layoutId} plays ${l.holeOrder.length}`);
    }
  }
  for (const c of catalog.scorecards) if (!layouts.has(c.layoutId)) problems.push(`scorecard ${c.profileId}: unknown layout ${c.layoutId}`);
  for (const policy of registry) {
    const l = layouts.get(policy.layoutId);
    if (!l) { problems.push(`registry layout ${policy.layoutId} is not catalogued`); continue; }
    if (l.facilityId !== policy.facilityId) problems.push(`registry ${policy.layoutId}: facility ${policy.facilityId} ≠ catalog ${l.facilityId}`);
    for (const s of policy.siteIds) if (!l.siteIds.includes(s)) problems.push(`registry ${policy.layoutId}: site ${s} not in catalog`);
    if (l.capabilityTier !== policy.acceptedCapabilityTier) problems.push(`registry ${policy.layoutId}: tier ${policy.acceptedCapabilityTier} ≠ catalog ${l.capabilityTier}`);
    for (const id of policy.dbCourseIds) if (!l.externalBindings.golfCourseIds.includes(id)) problems.push(`registry ${policy.layoutId}: golf_courses ${id} not bound in catalog`);
    if (!l.geometry) problems.push(`registry ${policy.layoutId}: catalog names no geometry package`);
  }
  return problems;
}
