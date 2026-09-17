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
  /** Exact owner-approved package hashes. The 2026-09-16 Upper package
   * (`src/test/fixtures/course-geometry/peek-n-peak-upper.json`, the one every
   * compiled terrain under `compiled-peek-n-peak-upper/` is hash-locked to)
   * was approved by the owner on 2026-09-16 for the on-course pilot;
   * `public/course-geometry/peek-n-peak-upper/manifest.json` names the same hash. */
  approvedGeometryHashes: new Set<string>(['fdec6ea8467dd214372bde680e7b7f9236c06ad5d27bb5ddeadf8ed5e9d3f87a']),
  /** Pilot exception, owner-approved 2026-09-16: the approved Upper package is
   * still `source_candidate` — no OSM feature has been reviewed by a person —
   * and the gate would otherwise refuse it. The pilot accepts it knowingly:
   * lie words on an unreviewed boundary read "Surface uncertain"
   * (`presentation-lie.ts`) and round-review shot resolution stays off for a
   * source-candidate package (`reconstruct.ts`), so nothing downstream claims
   * a reviewed surface. Set false again once a reviewed package is approved. */
  pilotAcceptsSourceCandidate: true,
  /** GolfHelm course rows (golf_courses ids) that ARE the Upper course. Empty
   * until the owner binds them; the name pattern below is the interim match
   * and requires "Upper" so the Lower course can never activate (§22). */
  dbCourseIds: new Set<string>([]),
  courseNamePattern: /peek\W*n?\W*peak[\s\S]*\bupper\b/i,
  /** Meridian world the live round renders (master plan R7): the V2 ground,
   * patches and objects in place of V1, with the marks and readout unchanged. */
  renderWorld: 'v2',
} as const;
export type PeekNPeakOneTapPolicy = {
  readonly courseId: string; readonly siteId: string; readonly projection: string; readonly featureFlag: string;
  readonly approvedGeometryHashes: ReadonlySet<string>;
  readonly pilotAcceptsSourceCandidate: boolean;
  readonly dbCourseIds: ReadonlySet<string>;
  readonly courseNamePattern: RegExp;
  readonly renderWorld: 'v1' | 'v2';
};
/** The product course id of a GolfHelm round's course, or null for any other
 * course. A bound golf_courses id wins; otherwise the course name must read
 * as Peek'n Peak *Upper*. Everything else stays on standard tracking. */
export function productCourseIdForRound(round: { dbCourseId?: string | null; courseName?: string | null }, policy: PeekNPeakOneTapPolicy = PEEK_N_PEAK_ONE_TAP_V1): string | null {
  if (round.dbCourseId && policy.dbCourseIds.has(round.dbCourseId)) return policy.courseId;
  if (round.courseName && policy.courseNamePattern.test(round.courseName)) return policy.courseId;
  return null;
}

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
  if (input.pkg.status === 'source_candidate' && !policy.pilotAcceptsSourceCandidate) return { eligible: false, reason: 'source_candidate_package' };
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
