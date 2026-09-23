import { isCourseGeometryEligible, layoutIdForSite, policyForLayout, policyForSite, resolveCoursePolicy, type CourseGeometryEligibility, type CourseGeometryEligibilityInput, type CourseGeometryPolicy, type RoundCourseIdentity } from './course-policy';

/** Peek'n Peak Upper — the golden visual-reference layout. Its current source
 * candidate remains useful in the separate review renderer, but this runtime
 * registry intentionally approves no geometry until the physical admission
 * package and per-hole capability manifest are reviewed. The name pattern
 * still excludes the Lower course so a future approval cannot cross-bind. */
export const PEEK_N_PEAK_UPPER_POLICY: CourseGeometryPolicy = {
  layoutId: 'peek-n-peak-upper',
  facilityId: 'peek-n-peak',
  siteIds: new Set(['osm-way-136097904']),
  projection: 'wgs84-local-enu-v1',
  geometryFeatureFlag: 'peek_n_peak_one_tap_v1',
  /** The server outbox (task 13) posts to `golf_shot_anchors` & co., which
   * exist only where that migration has been applied through `db:apply`; off,
   * the round plays device-only and the ledger still scores it (§77). */
  syncFeatureFlag: 'peek_n_peak_one_tap_sync_v1',
  approvedGeometryHashes: new Set<string>(),
  /** C2 visual review does not make a candidate a runtime package. */
  acceptedCapabilityTier: 'C2',
  pilotAcceptsSourceCandidate: false,
  dbCourseIds: new Set<string>(['48596a01-88a4-4081-aaa1-3b049584aa2d']),
  courseNamePatterns: [/peek\W*n?\W*peak[\s\S]*\bupper\b/i],
  renderWorld: 'v2',
  holeBindings: {},
};

/** Every layout the app may draw. Adding a course is an entry here plus its
 * published assets; an unlisted course resolves to null and makes no
 * geometry request. Ids and sites are unique (pinned by the registry test). */
export const COURSE_GEOMETRY_REGISTRY: readonly CourseGeometryPolicy[] = [PEEK_N_PEAK_UPPER_POLICY];

export function resolveCourseGeometryPolicy(round: RoundCourseIdentity, registry: readonly CourseGeometryPolicy[] = COURSE_GEOMETRY_REGISTRY): CourseGeometryPolicy | null {
  return resolveCoursePolicy(round, registry);
}
/** The product course id of a round's course, or null for any other course. */
export function productCourseIdForRound(round: RoundCourseIdentity, registry: readonly CourseGeometryPolicy[] = COURSE_GEOMETRY_REGISTRY): string | null {
  return resolveCoursePolicy(round, registry)?.layoutId ?? null;
}
export function courseGeometryPolicyForLayout(layoutId: string, registry: readonly CourseGeometryPolicy[] = COURSE_GEOMETRY_REGISTRY): CourseGeometryPolicy | null {
  return policyForLayout(layoutId, registry);
}
export function courseGeometryPolicyForSite(siteId: string, registry: readonly CourseGeometryPolicy[] = COURSE_GEOMETRY_REGISTRY): CourseGeometryPolicy | null {
  return policyForSite(siteId, registry);
}
export function courseIdForSite(siteId: string, registry: readonly CourseGeometryPolicy[] = COURSE_GEOMETRY_REGISTRY): string {
  return layoutIdForSite(siteId, registry);
}
export function courseGeometryEligibility(input: CourseGeometryEligibilityInput, policy: CourseGeometryPolicy | null = courseGeometryPolicyForLayout(input.roundCourseId)): CourseGeometryEligibility {
  if (!policy) return { eligible: false, reason: 'wrong_course' };
  return isCourseGeometryEligible(input, policy);
}
