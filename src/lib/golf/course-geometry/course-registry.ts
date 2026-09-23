import { isCourseGeometryEligible, layoutIdForSite, policyForLayout, policyForSite, resolveCoursePolicy, type CourseGeometryEligibility, type CourseGeometryEligibilityInput, type CourseGeometryPolicy, type RoundCourseIdentity } from './course-policy';
import { hydratePolicy, wireRegistrySchema } from './registry-wire';
import generatedRegistry from '../../../../course-geometry/registry.generated.json';

/** Every layout the app may draw, hydrated from `course-geometry/registry.generated.json`
 * (Factory v2 PR A/B). That file is generated — never hand-edit it — by
 * `npm run course-geometry:registry:generate`
 * (`scripts/golf/course-geometry/generate-course-registry.mts`), which joins
 * the owner's `course-geometry/approvals.json` with the checked-in catalog
 * (`course-geometry/catalog/`) and each approved package's own hole keys.
 * `npm run course-geometry:registry:check` fails CI on drift, the same
 * pattern as `flags:check`. Adding a course is an approvals.json entry plus
 * its published assets; an unlisted layout resolves to null and makes no
 * geometry request. Ids and sites are unique (pinned by the registry test,
 * `checkRegistryInvariants`). */
export const COURSE_GEOMETRY_REGISTRY: readonly CourseGeometryPolicy[] = wireRegistrySchema.parse(generatedRegistry).map(hydratePolicy);

/** Peek'n Peak Upper — the golden reference layout (One-Tap master design
 * §21–22; Factory v2 wave 0). The exact Upper package, identified by its OSM
 * site id and a production-approved geometry hash, behind a reversible
 * release flag. The name pattern requires "Upper" so the Lower course can
 * never activate (§22). Still exported by name for call sites that predate
 * the generic registry; it is the same array element `policyForLayout`
 * would return, not a second copy. */
export const PEEK_N_PEAK_UPPER_POLICY: CourseGeometryPolicy = (() => {
  const upper = COURSE_GEOMETRY_REGISTRY.find(p => p.layoutId === 'peek-n-peak-upper');
  if (!upper) throw new Error('course-registry: peek-n-peak-upper is missing from the generated registry — check course-geometry/approvals.json');
  return upper;
})();

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
