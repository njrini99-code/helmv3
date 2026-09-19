import type { CourseGeometryPackage } from './types';

/** Course Geometry Factory v2 §4: what a package's evidence lets the product
 * do. C0 catalogued (nothing served) · C1 visual candidate (lab only) · C2
 * visual production (render, terrain views, uncertainty labelled) · C3
 * tracking-safe (surface-aware placement, lie classification where the source
 * supports it) · C4 field-verified. The tier is a property of the approved
 * package; a policy names the tier it accepts and a caller names the tier a
 * capability needs. */
export type CapabilityTier = 'C0' | 'C1' | 'C2' | 'C3' | 'C4';
const TIER_RANK: Record<CapabilityTier, number> = { C0: 0, C1: 1, C2: 2, C3: 3, C4: 4 };
export function tierAtLeast(have: CapabilityTier, need: CapabilityTier): boolean { return TIER_RANK[have] >= TIER_RANK[need]; }

/** One playable layout the app may draw (Factory v2 §16.1). The layout id is
 * the product course id: asset paths (`/course-geometry/<layoutId>/`), the
 * essential manifest's `courseId` and every live-round record use it. Course
 * identity is the primary gate — a bound golf_courses id first, an explicit
 * name pattern as the interim fallback (never proximity, nearest green or a
 * resort geofence, so a sister course can never activate by being close). */
export interface CourseGeometryPolicy {
  readonly layoutId: string;
  readonly facilityId: string;
  /** OSM site ids a served package may carry (`pkg.siteId`); usually one. */
  readonly siteIds: ReadonlySet<string>;
  readonly projection: 'wgs84-local-enu-v1';
  /** Server-evaluated release flag that enables the course drawing / Live round. */
  readonly geometryFeatureFlag: string;
  /** Flag for the server outbox (needs its migration applied); null when the layout has no sync path. */
  readonly syncFeatureFlag: string | null;
  /** Exact owner-approved package hashes; an empty set approves nothing. */
  readonly approvedGeometryHashes: ReadonlySet<string>;
  /** The tier the approved package has earned; capabilities above it are refused. */
  readonly acceptedCapabilityTier: 'C2' | 'C3' | 'C4';
  /** Owner-approved exception that lets a `source_candidate` package serve
   * (no OSM feature reviewed by a person); downstream keeps saying so. */
  readonly pilotAcceptsSourceCandidate: boolean;
  /** golf_courses ids that ARE this layout. */
  readonly dbCourseIds: ReadonlySet<string>;
  /** Interim identity when no row is bound; every pattern must exclude sister layouts. */
  readonly courseNamePatterns: readonly RegExp[];
  /** Meridian world the layout renders. */
  readonly renderWorld: 'v1' | 'v2';
}

export type RoundCourseIdentity = { dbCourseId?: string | null; courseName?: string | null };

/** The policy a round's course resolves to, or null for any other course:
 * an exact golf_courses id wins over every name pattern, first match wins
 * within a rank, and nothing else matches (Factory v2 §16.2). */
export function resolveCoursePolicy(round: RoundCourseIdentity, registry: readonly CourseGeometryPolicy[]): CourseGeometryPolicy | null {
  if (round.dbCourseId) {
    const bound = registry.find(p => p.dbCourseIds.has(round.dbCourseId!));
    if (bound) return bound;
  }
  if (round.courseName) {
    const name = round.courseName;
    const named = registry.find(p => p.courseNamePatterns.some(pattern => pattern.test(name)));
    if (named) return named;
  }
  return null;
}
export function policyForLayout(layoutId: string, registry: readonly CourseGeometryPolicy[]): CourseGeometryPolicy | null {
  return registry.find(p => p.layoutId === layoutId) ?? null;
}
export function policyForSite(siteId: string, registry: readonly CourseGeometryPolicy[]): CourseGeometryPolicy | null {
  return registry.find(p => p.siteIds.has(siteId)) ?? null;
}
/** The product course id for a package site, or the site id itself for a
 * course no policy names (manifests stay self-describing). */
export function layoutIdForSite(siteId: string, registry: readonly CourseGeometryPolicy[]): string {
  return policyForSite(siteId, registry)?.layoutId ?? siteId;
}

/** Every reason a layout's live geometry stays off, in the order the gate checks them. */
export type CourseGeometryIneligibility =
  | 'wrong_course'
  | 'wrong_site'
  | 'source_candidate_package'
  | 'geometry_hash_not_approved'
  | 'capability_not_available'
  | 'feature_flag_off'
  | 'location_unavailable';
export type CourseGeometryEligibility = { eligible: true; courseId: string; geometryVersion: string } | { eligible: false; reason: CourseGeometryIneligibility };

export interface CourseGeometryEligibilityInput {
  /** The course the round was started on (the round's own course record, as a product course id). */
  roundCourseId: string;
  /** The package the client would render and classify against. */
  pkg: Pick<CourseGeometryPackage, 'siteId' | 'contentHash' | 'status'>;
  /** Server-evaluated release flag (`evaluateFlag` is server-only; the page passes the boolean down). */
  featureFlagEnabled: boolean;
  /** A device location source exists and is not denied. */
  preciseLocationAvailable: boolean;
  /** The tier the calling capability needs; omitted means "whatever the policy accepts" (render). */
  requiredTier?: CapabilityTier;
}

/** Package approval as the asset loaders apply it: the exact approved hash,
 * one of the policy's sites, and a source candidate only under the explicit
 * pilot exception. */
export function packageApproved(pkg: Pick<CourseGeometryPackage, 'siteId' | 'contentHash' | 'status'>, policy: CourseGeometryPolicy): boolean {
  return policy.approvedGeometryHashes.has(pkg.contentHash) && policy.siteIds.has(pkg.siteId) && (pkg.status !== 'source_candidate' || policy.pilotAcceptsSourceCandidate);
}

export function isCourseGeometryEligible(input: CourseGeometryEligibilityInput, policy: CourseGeometryPolicy): CourseGeometryEligibility {
  if (input.roundCourseId !== policy.layoutId) return { eligible: false, reason: 'wrong_course' };
  if (!policy.siteIds.has(input.pkg.siteId)) return { eligible: false, reason: 'wrong_site' };
  if (input.pkg.status === 'source_candidate' && !policy.pilotAcceptsSourceCandidate) return { eligible: false, reason: 'source_candidate_package' };
  if (!policy.approvedGeometryHashes.has(input.pkg.contentHash)) return { eligible: false, reason: 'geometry_hash_not_approved' };
  if (input.requiredTier && !tierAtLeast(policy.acceptedCapabilityTier, input.requiredTier)) return { eligible: false, reason: 'capability_not_available' };
  if (!input.featureFlagEnabled) return { eligible: false, reason: 'feature_flag_off' };
  if (!input.preciseLocationAvailable) return { eligible: false, reason: 'location_unavailable' };
  return { eligible: true, courseId: policy.layoutId, geometryVersion: input.pkg.contentHash };
}

/** The device must be inside the modelled area before Live starts; outside it
 * the player is told Live is unavailable here, never switched to another
 * course. The area is the package's own feature extent plus a margin, so a
 * facility-wide geofence is never used. */
export function isInsideModelledArea(positionENU: readonly [number, number], extentENU: { minE: number; minN: number; maxE: number; maxN: number }, marginM = 150): boolean {
  const [e, n] = positionENU;
  return Number.isFinite(e) && Number.isFinite(n) && e >= extentENU.minE - marginM && e <= extentENU.maxE + marginM && n >= extentENU.minN - marginM && n <= extentENU.maxN + marginM;
}
