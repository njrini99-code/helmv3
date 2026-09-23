import { describe, expect, it, vi } from 'vitest';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { MemoryCourseAssetCache } from '../course-assets';
import { greenCentreENU, holeKeyForRoundHole, loadApprovedCoursePackage, resolveOneTapLiveRound } from '../live-round-placement';
import type { LocationSource } from '../location-source';
import type { CourseGeometryPolicy } from '../../course-geometry/course-policy';
import { PEEK_N_PEAK_UPPER_POLICY, productCourseIdForRound } from '../../course-geometry/course-registry';

const location: LocationSource = { kind: 'synthetic', subscribe: () => () => {} };
// Synthetic future physical admission: runtime tests must not rely on the
// real source-candidate fixture or its pilot metadata.
const physicalPackage = { ...pilotPackage, status: 'reviewed_draft' as const };
const approved: CourseGeometryPolicy = { ...PEEK_N_PEAK_UPPER_POLICY, acceptedCapabilityTier: 'C3', holeBindings: { [physicalPackage.contentHash]: Object.fromEntries(physicalPackage.holes.map(h => [h.ordinal, h.key])) }, siteIds: new Set([physicalPackage.siteId]), approvedGeometryHashes: new Set([physicalPackage.contentHash]), dbCourseIds: new Set(['course-row-1']) };

describe('live round placement (§77)', () => {
  it('does not copy the Upper measurement pilot to another C2 layout', () => {
    const policy = { ...approved, layoutId: 'another-layout', acceptedCapabilityTier: 'C2' as const };
    expect(resolveOneTapLiveRound({ roundId: 'r1', roundCourseId: policy.layoutId, featureFlagEnabled: true,
      pkg: physicalPackage, location, policy })).toMatchObject({ live: null, eligibility: { reason: 'capability_not_available' } });
  });

  it('preserves White scoring and binds reordered nines explicitly', () => {
    const [first, second] = physicalPackage.holes;
    const policy = { ...approved, holeBindings: { [physicalPackage.contentHash]: { 1: second!.key, 2: first!.key } } };
    const setup = { dbCourseId: 'course-row-1', selectedTeeId: 'white', holes: [{ number: 1, par: 4, yardage: 410 }, { number: 2, par: 3, yardage: 155 }] };
    const before = structuredClone(setup);
    const { live } = resolveOneTapLiveRound({ roundId: 'r1', roundCourseId: policy.layoutId, featureFlagEnabled: true, pkg: physicalPackage, location, policy, roundSetup: setup });
    expect(live?.roundSetup).toEqual(before);
    expect(live?.holeKeys).toEqual([second!.key, first!.key]);
    expect(holeKeyForRoundHole(live!, 1)).toBe(second!.key);
    expect(holeKeyForRoundHole(live!, 3)).toBeNull();
    expect(holeKeyForRoundHole({ pkg: pilotPackage }, 1)).toBeNull();
    expect(setup).toEqual(before);
  });
  it('refuses Live when even one saved round hole lacks an exact package mapping', () => {
    const [first] = physicalPackage.holes;
    const policy = { ...approved, holeBindings: { [physicalPackage.contentHash]: { 1: first!.key } } };
    const setup = { dbCourseId: 'course-row-1', selectedTeeId: 'white', holes: [
      { number: 1, par: 4, yardage: 410 }, { number: 2, par: 3, yardage: 155 },
    ] };
    expect(resolveOneTapLiveRound({ roundId: 'r1', roundCourseId: policy.layoutId,
      featureFlagEnabled: true, pkg: physicalPackage, location, policy, roundSetup: setup,
    })).toMatchObject({ live: null, eligibility: { eligible: false, reason: 'capability_not_available' } });
  });

  it("names the product course only for Peek'n Peak Upper, by bound row or by name, never the Lower course", () => {
    expect(productCourseIdForRound({ courseName: "Peek'n Peak Resort - Upper Course" })).toBe('peek-n-peak-upper');
    expect(productCourseIdForRound({ courseName: 'Peek n Peak (Upper)' })).toBe('peek-n-peak-upper');
    expect(productCourseIdForRound({ courseName: "Peek'n Peak Resort - Lower Course" })).toBeNull();
    expect(productCourseIdForRound({ courseName: 'Upper Cascades GC' })).toBeNull();
    expect(productCourseIdForRound({ dbCourseId: 'course-row-1', courseName: 'renamed' }, [approved])).toBe('peek-n-peak-upper');
    expect(productCourseIdForRound({ dbCourseId: 'course-row-2' }, [approved])).toBeNull();
  });

  it('resolves a live round only when every gate passes, and leaves every other round untouched', () => {
    const base = { roundId: 'r1', roundCourseId: 'peek-n-peak-upper', featureFlagEnabled: true, pkg: physicalPackage, location, policy: approved };
    const ok = resolveOneTapLiveRound(base);
    expect(ok.eligibility).toEqual({ eligible: true, courseId: 'peek-n-peak-upper', geometryVersion: physicalPackage.contentHash });
    expect(ok.live).toMatchObject({ roundId: 'r1', courseId: 'peek-n-peak-upper', geometryVersion: physicalPackage.contentHash, holeKeys: physicalPackage.holes.map(h => h.key) });
    expect(resolveOneTapLiveRound({ ...base, roundCourseId: null })).toMatchObject({ live: null, eligibility: { eligible: false, reason: 'wrong_course' } });
    expect(resolveOneTapLiveRound({ ...base, pkg: null })).toMatchObject({ live: null, eligibility: { eligible: false, reason: 'geometry_hash_not_approved' } });
    expect(resolveOneTapLiveRound({ ...base, featureFlagEnabled: false })).toMatchObject({ live: null, eligibility: { eligible: false, reason: 'feature_flag_off' } });
    expect(resolveOneTapLiveRound({ ...base, location: null })).toMatchObject({ live: null, eligibility: { eligible: false, reason: 'location_unavailable' } });
    // No explicit policy: the registry resolves the Upper for this course id, and
    // the test package is not the Upper's site. A course the registry lacks is
    // the wrong course before anything else is looked at.
    expect(resolveOneTapLiveRound({ ...base, policy: undefined })).toMatchObject({ live: null, eligibility: { eligible: false, reason: 'wrong_site' } });
    expect(resolveOneTapLiveRound({ ...base, policy: undefined, roundCourseId: 'cacapon' })).toMatchObject({ live: null, eligibility: { eligible: false, reason: 'wrong_course' } });
    expect(holeKeyForRoundHole({ pkg: physicalPackage, roundHoleKeys: approved.holeBindings![physicalPackage.contentHash] }, physicalPackage.holes[0]!.ordinal)).toBe(physicalPackage.holes[0]!.key);
    expect(holeKeyForRoundHole({ pkg: physicalPackage, roundHoleKeys: approved.holeBindings![physicalPackage.contentHash] }, 99)).toBeNull();
    expect(greenCentreENU(physicalPackage, physicalPackage.holes[0]!.key)).not.toBeNull();
    expect(greenCentreENU(physicalPackage, 'no-such-hole')).toBeNull();
  });

  it('fetches nothing while no package is approved, and refuses a package whose hash or site disagrees', async () => {
    const body = (value: unknown) => ({ ok: true, text: async () => JSON.stringify(value) });
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/manifest.json')) return body({ geometryVersion: physicalPackage.contentHash, packageUrl: '/course-geometry/peek-n-peak-upper/package.json' });
      return body(physicalPackage);
    });
    // A policy that approves nothing (the gate outside the pilot) fetches nothing.
    expect(await loadApprovedCoursePackage('peek-n-peak-upper', { ...PEEK_N_PEAK_UPPER_POLICY, approvedGeometryHashes: new Set() }, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    const loaded = await loadApprovedCoursePackage('peek-n-peak-upper', approved, fetchImpl);
    expect(loaded?.pkg.contentHash).toBe(physicalPackage.contentHash);
    expect(loaded?.geometryVersion).toBe(physicalPackage.contentHash);
    expect(fetchImpl.mock.calls.map(c => c[0])).toEqual(['/course-geometry/peek-n-peak-upper/manifest.json', '/course-geometry/peek-n-peak-upper/package.json']);
    const sourceCandidate = { ...physicalPackage, status: 'source_candidate' as const };
    const sourceCandidateFetch = vi.fn(async (url: string) => {
      if (url.endsWith('/manifest.json')) return body({ geometryVersion: sourceCandidate.contentHash, packageUrl: '/course-geometry/peek-n-peak-upper/source-candidate.json' });
      return body(sourceCandidate);
    });
    // A source candidate loads only under the policy's explicit pilot exception.
    expect(await loadApprovedCoursePackage('peek-n-peak-upper', { ...approved, pilotAcceptsSourceCandidate: false, approvedGeometryHashes: new Set([sourceCandidate.contentHash]) }, sourceCandidateFetch)).toBeNull();
    expect((await loadApprovedCoursePackage('peek-n-peak-upper', { ...approved, pilotAcceptsSourceCandidate: true, approvedGeometryHashes: new Set([sourceCandidate.contentHash]) }, sourceCandidateFetch))?.pkg.status).toBe('source_candidate');
    expect(await loadApprovedCoursePackage('other-course', approved, fetchImpl)).toBeNull();
    const stale: CourseGeometryPolicy = { ...approved, approvedGeometryHashes: new Set(['some-other-hash']) };
    expect(await loadApprovedCoursePackage('peek-n-peak-upper', stale, fetchImpl)).toBeNull();
    const wrongSite: CourseGeometryPolicy = { ...approved, siteIds: new Set(['osm-way-000']) };
    expect(await loadApprovedCoursePackage('peek-n-peak-upper', wrongSite, fetchImpl)).toBeNull();
    expect(await loadApprovedCoursePackage('peek-n-peak-upper', approved, async () => ({ ok: false, text: async () => '' }))).toBeNull();
    // Task 15: a preflighted cache serves the whole course with no signal.
    const cache = new MemoryCourseAssetCache();
    await loadApprovedCoursePackage('peek-n-peak-upper', approved, fetchImpl, '/course-geometry', cache);
    const offline = await loadApprovedCoursePackage('peek-n-peak-upper', approved, async () => { throw new TypeError('Failed to fetch'); }, '/course-geometry', cache);
    expect(offline?.pkg.contentHash).toBe(physicalPackage.contentHash);
  });
});
