import { isCourseGeometryEligible, layoutIdForSite, policyForLayout, policyForSite, resolveCoursePolicy, type CourseGeometryEligibility, type CourseGeometryEligibilityInput, type CourseGeometryPolicy, type RoundCourseIdentity } from './course-policy';

/** Peek'n Peak Upper — the golden reference layout (One-Tap master design
 * §21–22; Factory v2 wave 0). The exact Upper package, identified by its OSM
 * site id and a production-approved geometry hash, behind a reversible
 * release flag. The name pattern requires "Upper" so the Lower course can
 * never activate (§22). */
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
  /** The 2026-09-16 Upper package (`src/test/fixtures/course-geometry/peek-n-peak-upper.json`,
   * the one every compiled terrain under `compiled-peek-n-peak-upper/` is
   * hash-locked to) was approved by the owner on 2026-09-16 for the on-course
   * pilot; `public/course-geometry/peek-n-peak-upper/manifest.json` names the same hash. */
  approvedGeometryHashes: new Set(['fdec6ea8467dd214372bde680e7b7f9236c06ad5d27bb5ddeadf8ed5e9d3f87a']),
  /** C2: renders in production with uncertainty labelled; no capability that
   * needs a reviewed surface runs on it (lie words read "Surface uncertain",
   * round-review shot resolution stays off for a source-candidate package). */
  acceptedCapabilityTier: 'C2',
  /** Pilot exception, owner-approved 2026-09-16: the approved package is still
   * `source_candidate` — no OSM feature has been reviewed by a person. Set
   * false again once a reviewed package is approved. */
  pilotAcceptsSourceCandidate: true,
  dbCourseIds: new Set<string>(['48596a01-88a4-4081-aaa1-3b049584aa2d']),
  courseNamePatterns: [/peek\W*n?\W*peak[\s\S]*\bupper\b/i],
  renderWorld: 'v2',
  holeBindings: {
    fdec6ea8467dd214372bde680e7b7f9236c06ad5d27bb5ddeadf8ed5e9d3f87a: Object.fromEntries(
      Array.from({ length: 18 }, (_, i) => [i + 1, `peek-n-peak-upper-${String(i + 1).padStart(2, '0')}`])),
  },
  livePilot: { layoutId: 'peek-n-peak-upper', geometryHashes: new Set(['fdec6ea8467dd214372bde680e7b7f9236c06ad5d27bb5ddeadf8ed5e9d3f87a']) },
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
