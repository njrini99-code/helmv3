import { isCourseGeometryEligible, isInsideModelledArea, layoutIdForSite, resolveCoursePolicy, type CourseGeometryEligibility, type CourseGeometryEligibilityInput, type CourseGeometryIneligibility, type CourseGeometryPolicy, type RoundCourseIdentity } from '../course-geometry/course-policy';
import { PEEK_N_PEAK_UPPER_POLICY } from '../course-geometry/course-registry';

/** Compatibility surface for the One-Tap pilot (master design §21–22). The
 * policy itself lives in the course registry
 * (`course-geometry/course-registry.ts`, Factory v2 §16): this module keeps
 * the pilot's names for callers and tests that address the Upper directly.
 * Generic code resolves the registry instead of importing this. */
export const PEEK_N_PEAK_ONE_TAP_V1: CourseGeometryPolicy = PEEK_N_PEAK_UPPER_POLICY;
export type PeekNPeakOneTapPolicy = CourseGeometryPolicy;
export type OneTapIneligibility = CourseGeometryIneligibility;
export type OneTapEligibility = CourseGeometryEligibility;
export type OneTapEligibilityInput = CourseGeometryEligibilityInput;

/** The product course id of a round's course under one policy, or null. */
export function productCourseIdForRound(round: RoundCourseIdentity, policy: CourseGeometryPolicy = PEEK_N_PEAK_ONE_TAP_V1): string | null {
  return resolveCoursePolicy(round, [policy])?.layoutId ?? null;
}
/** The product course id for a package site under one policy, or the site id itself. */
export function courseIdForSite(siteId: string, policy: CourseGeometryPolicy = PEEK_N_PEAK_ONE_TAP_V1): string {
  return layoutIdForSite(siteId, [policy]);
}
export function isPeekNPeakOneTapEligible(input: CourseGeometryEligibilityInput, policy: CourseGeometryPolicy = PEEK_N_PEAK_ONE_TAP_V1): CourseGeometryEligibility {
  return isCourseGeometryEligible(input, policy);
}
export { isInsideModelledArea };
