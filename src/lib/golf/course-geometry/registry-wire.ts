import { z } from 'zod';
import type { CourseGeometryPolicy } from './course-policy';

/** JSON shape of `course-geometry/registry.generated.json` — everything
 * `CourseGeometryPolicy` needs, with `Set`/`RegExp` flattened to arrays and
 * `{source, flags}` so the file is plain, diffable JSON. The generator
 * (`scripts/golf/course-geometry/generate-course-registry.mts`) writes it;
 * `course-registry.ts` hydrates it back with this same schema so a
 * hand-edited file cannot bypass validation. */
const hash = z.string().regex(/^[0-9a-f]{64}$/, 'SHA256');
const flagId = z.string().regex(/^[a-z0-9_]+$/, 'feature_id');
/** `RegExp.prototype.test` is stateful on a global/sticky pattern
 * (`lastIndex` carries across calls); the registry only ever calls `.test`,
 * so `g`/`y` would silently alternate matches. Refused at the wire boundary. */
const wirePattern = z.object({
  source: z.string().min(1),
  flags: z.string().regex(/^[a-z]*$/).optional(),
}).strict().superRefine((p, ctx) => {
  if (/[gy]/.test(p.flags ?? '')) ctx.addIssue({ code: 'custom', message: 'courseNamePattern flags may not include g or y (stateful .test across calls)' });
});
export const wirePolicySchema = z.object({
  layoutId: z.string().min(1),
  facilityId: z.string().min(1),
  siteIds: z.array(z.string().min(1)).min(1),
  geometryFeatureFlag: flagId,
  syncFeatureFlag: flagId.nullable(),
  approvedGeometryHashes: z.array(hash).min(1),
  approvedPackageByteHashes: z.record(hash, hash).optional(),
  acceptedCapabilityTier: z.enum(['C2', 'C3', 'C4']),
  pilotAcceptsSourceCandidate: z.boolean(),
  dbCourseIds: z.array(z.string().min(1)),
  courseNamePatterns: z.array(wirePattern).min(1),
  renderWorld: z.enum(['v1', 'v2']),
  holeBindings: z.record(hash, z.record(z.string(), z.string())).optional(),
  livePilot: z.object({ layoutId: z.string().min(1), geometryHashes: z.array(hash).min(1) }).optional(),
  assetBaseUrl: z.string().min(1).optional(),
}).strict();
export type WireCourseGeometryPolicy = z.infer<typeof wirePolicySchema>;
export const wireRegistrySchema = z.array(wirePolicySchema);

export function hydratePolicy(wire: WireCourseGeometryPolicy): CourseGeometryPolicy {
  return {
    layoutId: wire.layoutId,
    facilityId: wire.facilityId,
    siteIds: new Set(wire.siteIds),
    projection: 'wgs84-local-enu-v1',
    geometryFeatureFlag: wire.geometryFeatureFlag,
    syncFeatureFlag: wire.syncFeatureFlag,
    approvedGeometryHashes: new Set(wire.approvedGeometryHashes),
    approvedPackageByteHashes: wire.approvedPackageByteHashes,
    acceptedCapabilityTier: wire.acceptedCapabilityTier,
    pilotAcceptsSourceCandidate: wire.pilotAcceptsSourceCandidate,
    dbCourseIds: new Set(wire.dbCourseIds),
    courseNamePatterns: wire.courseNamePatterns.map(p => new RegExp(p.source, p.flags)),
    renderWorld: wire.renderWorld,
    // JSON object keys are already strings at runtime; `Record<number, string>`
    // is a type-level convenience the hand-written policy relied on too.
    holeBindings: wire.holeBindings as Readonly<Record<string, Readonly<Record<number, string>>>> | undefined,
    livePilot: wire.livePilot ? { layoutId: wire.livePilot.layoutId, geometryHashes: new Set(wire.livePilot.geometryHashes) } : undefined,
    assetBaseUrl: wire.assetBaseUrl,
  };
}
