import { describe, expect, it } from 'vitest';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import packageJson from '@/test/fixtures/course-geometry/peek-n-peak-upper.json';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { PEEK_N_PEAK_ONE_TAP_V1, courseIdForSite, isInsideModelledArea, isPeekNPeakOneTapEligible, type PeekNPeakOneTapPolicy } from '../peek-n-peak-policy';

const upper = parseGeometryPackage(packageJson);
/** The fixture is still a source candidate; the tests approve its hash and
 * promote its status the way the owner's review would, without touching it. */
const approved = { ...upper, status: 'reviewed_draft' as const };
const policy: PeekNPeakOneTapPolicy = { ...PEEK_N_PEAK_ONE_TAP_V1, approvedGeometryHashes: new Set([upper.contentHash]) };
const ok = { roundCourseId: 'peek-n-peak-upper', pkg: approved, featureFlagEnabled: true, preciseLocationAvailable: true };

describe('Peek\'n Peak Upper One-Tap eligibility (§21–22)', () => {
  it('allows the approved Upper package with the flag on and device location available', () => {
    expect(isPeekNPeakOneTapEligible(ok, policy)).toEqual({ eligible: true, courseId: 'peek-n-peak-upper', geometryVersion: upper.contentHash });
    expect(PEEK_N_PEAK_ONE_TAP_V1.siteId).toBe('osm-way-136097904');
    expect(upper.siteId).toBe(PEEK_N_PEAK_ONE_TAP_V1.siteId);
  });
  it('rejects another course by identity, never by name or proximity', () => {
    expect(isPeekNPeakOneTapEligible({ ...ok, roundCourseId: 'peek-n-peak-lower' }, policy)).toEqual({ eligible: false, reason: 'wrong_course' });
    // A round on the Upper course record with the Lower/other package loaded is still refused.
    expect(isPeekNPeakOneTapEligible({ ...ok, pkg: { ...pilotPackage, status: 'reviewed_draft' } }, policy)).toEqual({ eligible: false, reason: 'wrong_site' });
    const renamed = { ...approved, siteId: 'osm-way-000000001', name: 'Peek\'n Peak Resort — Lower Course' };
    expect(isPeekNPeakOneTapEligible({ ...ok, pkg: renamed }, policy).eligible).toBe(false);
  });
  it('rejects a geometry hash that is not approved and a source-candidate package', () => {
    expect(isPeekNPeakOneTapEligible({ ...ok, pkg: { ...approved, contentHash: 'a'.repeat(64) } }, policy)).toEqual({ eligible: false, reason: 'geometry_hash_not_approved' });
    expect(isPeekNPeakOneTapEligible({ ...ok, pkg: upper }, policy)).toEqual({ eligible: false, reason: 'source_candidate_package' });
    // The shipped policy approves nothing yet, so the fixture cannot activate Live.
    expect(isPeekNPeakOneTapEligible({ ...ok, pkg: approved }).eligible).toBe(false);
  });
  it('rejects unavailable location and an off flag, in that order after geometry', () => {
    expect(isPeekNPeakOneTapEligible({ ...ok, preciseLocationAvailable: false }, policy)).toEqual({ eligible: false, reason: 'location_unavailable' });
    expect(isPeekNPeakOneTapEligible({ ...ok, featureFlagEnabled: false, preciseLocationAvailable: false }, policy)).toEqual({ eligible: false, reason: 'feature_flag_off' });
  });
  it('maps the Upper site to its product course id and leaves other sites self-describing', () => {
    expect(courseIdForSite('osm-way-136097904')).toBe('peek-n-peak-upper');
    expect(courseIdForSite(pilotPackage.siteId)).toBe(pilotPackage.siteId);
  });
  it('validates the device against the modelled area with a margin, not a resort geofence', () => {
    const extent = { minE: -900, minN: -700, maxE: 900, maxN: 1300 };
    expect(isInsideModelledArea([0, 0], extent)).toBe(true);
    expect(isInsideModelledArea([-1000, 0], extent)).toBe(true);
    expect(isInsideModelledArea([-1100, 0], extent)).toBe(false);
    expect(isInsideModelledArea([Number.NaN, 0], extent)).toBe(false);
  });
});
