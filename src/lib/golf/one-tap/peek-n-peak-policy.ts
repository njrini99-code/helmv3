import type { CourseGeometryPackage } from '../course-geometry/types';

/** Peek'n Peak Upper — One-Tap Live Round master design §21–22. The launch
 * is one course: the exact Upper package, identified by its OSM site id and a
 * production-approved geometry hash, behind a reversible release flag, with
 * precise device location available (the web Geolocation API inside the
 * mobile shell; no native plugin is required). Course identity is the primary gate;
 * device location only validates that the player is inside the modelled
 * area. Nothing here matches on names ("Peak"), nearest greens, or a resort
 * geofence, so the Lower Course can never activate by proximity. */
export const PEEK_N_PEAK_ONE_TAP_V1 = {
  courseId: 'peek-n-peak-upper',
  siteId: 'osm-way-136097904',
  projection: 'wgs84-local-enu-v1',
  featureFlag: 'peek_n_peak_one_tap_v1',
  /** Exact production-approved package hashes. Empty until the owner approves
   * a reviewed Upper package: a source-candidate package never activates Live. */
  approvedGeometryHashes: new Set<string>([]),
} as const;
export type PeekNPeakOneTapPolicy = {
  readonly courseId: string; readonly siteId: string; readonly projection: string; readonly featureFlag: string;
  readonly approvedGeometryHashes: ReadonlySet<string>;
};

/** Every reason Live stays off, in the order the gate checks them. */
export type OneTapIneligibility =
  | 'wrong_course'
  | 'wrong_site'
  | 'source_candidate_package'
  | 'geometry_hash_not_approved'
  | 'feature_flag_off'
  | 'location_unavailable';
export type OneTapEligibility = { eligible: true; courseId: string; geometryVersion: string } | { eligible: false; reason: OneTapIneligibility };

export interface OneTapEligibilityInput {
  /** The course the round was started on (the round's own course record). */
  roundCourseId: string;
  /** The package the client would render and classify against. */
  pkg: Pick<CourseGeometryPackage, 'siteId' | 'contentHash' | 'status'>;
  /** Server-evaluated release flag (`evaluateFlag` is server-only; the page passes the boolean down). */
  featureFlagEnabled: boolean;
  /** A device location source exists and is not denied (`deviceLocationSource()`
   * inside the shell's WebView, checked through `queryLocationPermission`). */
  preciseLocationAvailable: boolean;
}

/** The product course id for a package site, or the site id itself for a
 * course the One-Tap policy does not know (manifests stay self-describing). */
export function courseIdForSite(siteId: string, policy: PeekNPeakOneTapPolicy = PEEK_N_PEAK_ONE_TAP_V1): string {
  return siteId === policy.siteId ? policy.courseId : siteId;
}

export function isPeekNPeakOneTapEligible(input: OneTapEligibilityInput, policy: PeekNPeakOneTapPolicy = PEEK_N_PEAK_ONE_TAP_V1): OneTapEligibility {
  if (input.roundCourseId !== policy.courseId) return { eligible: false, reason: 'wrong_course' };
  if (input.pkg.siteId !== policy.siteId) return { eligible: false, reason: 'wrong_site' };
  if (input.pkg.status === 'source_candidate') return { eligible: false, reason: 'source_candidate_package' };
  if (!policy.approvedGeometryHashes.has(input.pkg.contentHash)) return { eligible: false, reason: 'geometry_hash_not_approved' };
  if (!input.featureFlagEnabled) return { eligible: false, reason: 'feature_flag_off' };
  if (!input.preciseLocationAvailable) return { eligible: false, reason: 'location_unavailable' };
  return { eligible: true, courseId: policy.courseId, geometryVersion: input.pkg.contentHash };
}

/** §22: the device must be inside the modelled Upper area before Live starts;
 * outside it the player is told Live is unavailable here, never switched to
 * another course. The area is the package's own feature extent plus a margin,
 * so a resort-wide geofence is never used. */
export function isInsideModelledArea(positionENU: readonly [number, number], extentENU: { minE: number; minN: number; maxE: number; maxN: number }, marginM = 150): boolean {
  const [e, n] = positionENU;
  return Number.isFinite(e) && Number.isFinite(n) && e >= extentENU.minE - marginM && e <= extentENU.maxE + marginM && n >= extentENU.minN - marginM && n <= extentENU.maxN + marginM;
}
