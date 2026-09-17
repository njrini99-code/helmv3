import { describe, expect, it, vi } from 'vitest';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { MemoryCourseAssetCache } from '../course-assets';
import { greenCentreENU, holeKeyForRoundHole, loadApprovedCoursePackage, resolveOneTapLiveRound } from '../live-round-placement';
import type { LocationSource } from '../location-source';
import { PEEK_N_PEAK_ONE_TAP_V1, productCourseIdForRound, type PeekNPeakOneTapPolicy } from '../peek-n-peak-policy';

const location: LocationSource = { kind: 'synthetic', subscribe: () => () => {} };
// SYNTHETIC POLICY: the pilot fixture stands in for an approved Upper package.
const approved: PeekNPeakOneTapPolicy = { ...PEEK_N_PEAK_ONE_TAP_V1, siteId: pilotPackage.siteId, approvedGeometryHashes: new Set([pilotPackage.contentHash]), dbCourseIds: new Set(['course-row-1']) };

describe('live round placement (§77)', () => {
  it("names the product course only for Peek'n Peak Upper, by bound row or by name, never the Lower course", () => {
    expect(productCourseIdForRound({ courseName: "Peek'n Peak Resort - Upper Course" })).toBe('peek-n-peak-upper');
    expect(productCourseIdForRound({ courseName: 'Peek n Peak (Upper)' })).toBe('peek-n-peak-upper');
    expect(productCourseIdForRound({ courseName: "Peek'n Peak Resort - Lower Course" })).toBeNull();
    expect(productCourseIdForRound({ courseName: 'Upper Cascades GC' })).toBeNull();
    expect(productCourseIdForRound({ dbCourseId: 'course-row-1', courseName: 'renamed' }, approved)).toBe('peek-n-peak-upper');
    expect(productCourseIdForRound({ dbCourseId: 'course-row-2' }, approved)).toBeNull();
  });

  it('resolves a live round only when every gate passes, and leaves every other round untouched', () => {
    const base = { roundId: 'r1', roundCourseId: 'peek-n-peak-upper', featureFlagEnabled: true, pkg: pilotPackage, location, policy: approved };
    const ok = resolveOneTapLiveRound(base);
    expect(ok.eligibility).toEqual({ eligible: true, courseId: 'peek-n-peak-upper', geometryVersion: pilotPackage.contentHash });
    expect(ok.live).toMatchObject({ roundId: 'r1', courseId: 'peek-n-peak-upper', geometryVersion: pilotPackage.contentHash, holeKeys: pilotPackage.holes.map(h => h.key) });
    expect(resolveOneTapLiveRound({ ...base, roundCourseId: null })).toMatchObject({ live: null, eligibility: { eligible: false, reason: 'wrong_course' } });
    expect(resolveOneTapLiveRound({ ...base, pkg: null })).toMatchObject({ live: null, eligibility: { eligible: false, reason: 'geometry_hash_not_approved' } });
    expect(resolveOneTapLiveRound({ ...base, featureFlagEnabled: false })).toMatchObject({ live: null, eligibility: { eligible: false, reason: 'feature_flag_off' } });
    expect(resolveOneTapLiveRound({ ...base, location: null })).toMatchObject({ live: null, eligibility: { eligible: false, reason: 'location_unavailable' } });
    // The shipped policy approves nothing yet: production stays on standard tracking.
    expect(resolveOneTapLiveRound({ ...base, policy: undefined })).toMatchObject({ live: null, eligibility: { eligible: false } });
    expect(holeKeyForRoundHole({ pkg: pilotPackage }, pilotPackage.holes[0]!.ordinal)).toBe(pilotPackage.holes[0]!.key);
    expect(holeKeyForRoundHole({ pkg: pilotPackage }, 99)).toBeNull();
    expect(greenCentreENU(pilotPackage, pilotPackage.holes[0]!.key)).not.toBeNull();
    expect(greenCentreENU(pilotPackage, 'no-such-hole')).toBeNull();
  });

  it('fetches nothing while no package is approved, and refuses a package whose hash or site disagrees', async () => {
    const body = (value: unknown) => ({ ok: true, text: async () => JSON.stringify(value) });
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/manifest.json')) return body({ geometryVersion: pilotPackage.contentHash, packageUrl: '/course-geometry/peek-n-peak-upper/package.json' });
      return body(pilotPackage);
    });
    // A policy that approves nothing (the gate outside the pilot) fetches nothing.
    expect(await loadApprovedCoursePackage('peek-n-peak-upper', { ...PEEK_N_PEAK_ONE_TAP_V1, approvedGeometryHashes: new Set() }, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    const loaded = await loadApprovedCoursePackage('peek-n-peak-upper', approved, fetchImpl);
    expect(loaded?.pkg.contentHash).toBe(pilotPackage.contentHash);
    expect(loaded?.geometryVersion).toBe(pilotPackage.contentHash);
    expect(fetchImpl.mock.calls.map(c => c[0])).toEqual(['/course-geometry/peek-n-peak-upper/manifest.json', '/course-geometry/peek-n-peak-upper/package.json']);
    expect(await loadApprovedCoursePackage('other-course', approved, fetchImpl)).toBeNull();
    const stale: PeekNPeakOneTapPolicy = { ...approved, approvedGeometryHashes: new Set(['some-other-hash']) };
    expect(await loadApprovedCoursePackage('peek-n-peak-upper', stale, fetchImpl)).toBeNull();
    const wrongSite: PeekNPeakOneTapPolicy = { ...approved, siteId: 'osm-way-000' };
    expect(await loadApprovedCoursePackage('peek-n-peak-upper', wrongSite, fetchImpl)).toBeNull();
    expect(await loadApprovedCoursePackage('peek-n-peak-upper', approved, async () => ({ ok: false, text: async () => '' }))).toBeNull();
    // Task 15: a preflighted cache serves the whole course with no signal.
    const cache = new MemoryCourseAssetCache();
    await loadApprovedCoursePackage('peek-n-peak-upper', approved, fetchImpl, '/course-geometry', cache);
    const offline = await loadApprovedCoursePackage('peek-n-peak-upper', approved, async () => { throw new TypeError('Failed to fetch'); }, '/course-geometry', cache);
    expect(offline?.pkg.contentHash).toBe(pilotPackage.contentHash);
  });
});
