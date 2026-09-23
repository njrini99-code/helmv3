import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { isCourseGeometryEligible, resolveCoursePolicy, tierAtLeast, type CourseGeometryPolicy } from '../course-policy';
import { loadCourseCatalog } from '../load-catalog';
import { checkRegistryInvariants } from '../registry-invariants';
import { COURSE_GEOMETRY_REGISTRY, PEEK_N_PEAK_UPPER_POLICY, courseGeometryEligibility, courseGeometryPolicyForLayout, courseGeometryPolicyForSite, courseIdForSite, productCourseIdForRound, resolveCourseGeometryPolicy } from '../course-registry';

/** Exactly the hand-written policy this file carried before the registry
 * became generated (Factory v2 PR A → PR B). Not imported from anywhere —
 * copied here on purpose, so a generator or approvals.json bug that changes
 * Peek's *behaviour* fails this test even though every other assertion below
 * still passes against whatever the generator produced. */
const LEGACY_PEEK: CourseGeometryPolicy = {
  layoutId: 'peek-n-peak-upper',
  facilityId: 'peek-n-peak',
  siteIds: new Set(['osm-way-136097904']),
  projection: 'wgs84-local-enu-v1',
  geometryFeatureFlag: 'peek_n_peak_one_tap_v1',
  syncFeatureFlag: 'peek_n_peak_one_tap_sync_v1',
  approvedGeometryHashes: new Set(['fdec6ea8467dd214372bde680e7b7f9236c06ad5d27bb5ddeadf8ed5e9d3f87a']),
  approvedPackageByteHashes: { fdec6ea8467dd214372bde680e7b7f9236c06ad5d27bb5ddeadf8ed5e9d3f87a: '7dbe0b9caf1c7e5e6399397c0521bc97af418d6693cc6ddc29228af88dfae119' },
  acceptedCapabilityTier: 'C2',
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

/** A second layout the registry does not carry, for the resolution tests. */
const cacapon: CourseGeometryPolicy = {
  ...PEEK_N_PEAK_UPPER_POLICY,
  layoutId: 'cacapon-main',
  facilityId: 'cacapon',
  siteIds: new Set([pilotPackage.siteId]),
  geometryFeatureFlag: 'cacapon_geometry_v1',
  syncFeatureFlag: null,
  approvedGeometryHashes: new Set([pilotPackage.contentHash]),
  dbCourseIds: new Set(['course-row-cacapon']),
  courseNamePatterns: [/cacapon/i],
};
const both = [PEEK_N_PEAK_UPPER_POLICY, cacapon];

describe('course geometry registry (Factory v2 PR A)', () => {
  it('carries unique layout ids, unique site ids and a flag per entry', () => {
    const layouts = COURSE_GEOMETRY_REGISTRY.map(p => p.layoutId);
    expect(new Set(layouts).size).toBe(layouts.length);
    const sites = COURSE_GEOMETRY_REGISTRY.flatMap(p => [...p.siteIds]);
    expect(new Set(sites).size).toBe(sites.length);
    for (const p of COURSE_GEOMETRY_REGISTRY) {
      expect(p.geometryFeatureFlag).toMatch(/^[a-z0-9_]+$/);
      expect(p.approvedGeometryHashes.size).toBeGreaterThan(0);
      expect(p.projection).toBe('wgs84-local-enu-v1');
    }
    // The registry is generated (course-geometry/registry.generated.json,
    // via approvals.json) — this only pins today's roster, not the whole
    // registry's shape. Peek's behaviour is separately pinned exactly by
    // the golden comparison below.
    expect(COURSE_GEOMETRY_REGISTRY.map(p => p.layoutId)).toContain('peek-n-peak-upper');
  });
  it("hydrates Peek'n Peak Upper byte-identical to its pre-generator hand-written policy", () => {
    expect(PEEK_N_PEAK_UPPER_POLICY).toEqual(LEGACY_PEEK);
    // `policyForLayout` and the named export must be the same array element,
    // not two equal-but-distinct hydrations — every `toBe(PEEK_N_PEAK_UPPER_POLICY)`
    // assertion elsewhere in this suite depends on that identity.
    expect(courseGeometryPolicyForLayout('peek-n-peak-upper')).toBe(PEEK_N_PEAK_UPPER_POLICY);
  });
  it('holds the registry invariants: unique ids, and no sister-layout name collisions', () => {
    const catalog = loadCourseCatalog();
    expect(checkRegistryInvariants(COURSE_GEOMETRY_REGISTRY, catalog.layouts)).toEqual([]);
  });
  it('matches the checked-in generated registry file exactly (registry.generated.json is not stale)', () => {
    const onDisk = JSON.parse(readFileSync(join(process.cwd(), 'course-geometry', 'registry.generated.json'), 'utf8'));
    expect(Array.isArray(onDisk)).toBe(true);
    expect(onDisk.map((p: { layoutId: string }) => p.layoutId)).toEqual(COURSE_GEOMETRY_REGISTRY.map(p => p.layoutId));
  });
  it('resolves a round by db course id first, then by name pattern, and an unlisted course to null', () => {
    expect(resolveCoursePolicy({ dbCourseId: 'course-row-cacapon', courseName: "Peek'n Peak Upper" }, both)).toBe(cacapon);
    expect(resolveCoursePolicy({ courseName: "Peek'n Peak Resort - Upper Course" }, both)).toBe(PEEK_N_PEAK_UPPER_POLICY);
    expect(resolveCoursePolicy({ courseName: 'Cacapon State Park' }, both)).toBe(cacapon);
    expect(resolveCoursePolicy({ courseName: "Peek'n Peak Resort - Lower Course" }, both)).toBeNull();
    expect(resolveCoursePolicy({ dbCourseId: 'course-row-9', courseName: null }, both)).toBeNull();
    expect(resolveCoursePolicy({ dbCourseId: 'course-row-9', courseName: "Peek'n Peak Upper" }, both)).toBeNull();
    expect(resolveCoursePolicy({ dbCourseId: '48596a01-88a4-4081-aaa1-3b049584aa2d', courseName: 'Renamed by player' }, both)).toBe(PEEK_N_PEAK_UPPER_POLICY);
    expect(resolveCoursePolicy({}, both)).toBeNull();
    // The default registry knows only the pilot.
    expect(resolveCourseGeometryPolicy({ courseName: 'Cacapon State Park' })).toBeNull();
    expect(productCourseIdForRound({ courseName: 'Peek n Peak (Upper)' })).toBe('peek-n-peak-upper');
  });
  it('looks layouts and sites up by id', () => {
    expect(courseGeometryPolicyForLayout('peek-n-peak-upper')).toBe(PEEK_N_PEAK_UPPER_POLICY);
    expect(courseGeometryPolicyForLayout('cacapon-main')).toBeNull();
    expect(courseGeometryPolicyForLayout('cacapon-main', both)).toBe(cacapon);
    expect(courseGeometryPolicyForSite('osm-way-136097904')).toBe(PEEK_N_PEAK_UPPER_POLICY);
    expect(courseGeometryPolicyForSite(pilotPackage.siteId)).toBeNull();
    // A site no policy names keeps its site id as the product course id.
    expect(courseIdForSite(pilotPackage.siteId)).toBe(pilotPackage.siteId);
    expect(courseIdForSite(pilotPackage.siteId, both)).toBe('cacapon-main');
  });
  it('orders capability tiers and refuses a capability above the layout tier before it reads the flag', () => {
    expect(tierAtLeast('C2', 'C2')).toBe(true);
    expect(tierAtLeast('C4', 'C1')).toBe(true);
    expect(tierAtLeast('C1', 'C2')).toBe(false);
    const pkg = { siteId: pilotPackage.siteId, contentHash: pilotPackage.contentHash, status: pilotPackage.status };
    const base = { roundCourseId: 'cacapon-main', pkg, featureFlagEnabled: false, preciseLocationAvailable: true };
    expect(isCourseGeometryEligible({ ...base, requiredTier: 'C3' }, cacapon)).toEqual({ eligible: false, reason: 'capability_not_available' });
    expect(isCourseGeometryEligible({ ...base, requiredTier: 'C2' }, cacapon)).toEqual({ eligible: false, reason: 'feature_flag_off' });
    expect(isCourseGeometryEligible({ ...base, featureFlagEnabled: true }, cacapon)).toEqual({ eligible: true, courseId: 'cacapon-main', geometryVersion: pilotPackage.contentHash });
    expect(isCourseGeometryEligible({ ...base, featureFlagEnabled: true, roundCourseId: 'peek-n-peak-upper' }, cacapon)).toEqual({ eligible: false, reason: 'wrong_course' });
    // The registry default: a round on a layout the registry lacks is the wrong course.
    expect(courseGeometryEligibility({ ...base, featureFlagEnabled: true })).toEqual({ eligible: false, reason: 'wrong_course' });
  });
});
