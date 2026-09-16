import { describe, expect, it } from 'vitest';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import packageJson from '@/test/fixtures/course-geometry/peek-n-peak-upper.json';
import { COMPETITION_POLICY_VERSION, competitionPolicy, stoppingDistanceM, ROLLING_RESISTANCE_MU } from '../competition-policy';
import { buildCoursePackageManifest } from '../course-package-manifest';
import { UNSPECIFIED } from '../geodesy';

describe('one-tap course package manifest and competition policy', () => {
  it('versions the package by the hashes the pipeline already gates on', () => {
    const pkg = parseGeometryPackage(packageJson);
    const manifest = buildCoursePackageManifest(pkg, { [pkg.holes[0]!.key]: { contentHash: 'b'.repeat(64) }, [pkg.holes[14]!.key]: { contentHash: 'c'.repeat(64) } }, '2026-09-17T00:00:00Z');
    expect(manifest.geometryVersion).toBe(pkg.contentHash);
    expect(Object.keys(manifest.terrainByHole)).toEqual([pkg.holes[0]!.key, pkg.holes[14]!.key].sort());
    expect(manifest.terrainVersion).toMatch(/^[a-f0-9]+$/);
    expect(manifest.renderVersion).toMatch(/^meridian-visual-compiler-\d+:meridian-v/);
    expect(manifest.localOrigin).toEqual({ lon: -79.744, lat: 42.06, ellipsoidHeightM: UNSPECIFIED, frame: 'wgs84-local-enu-v1' });
    expect(manifest.holes).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(manifest.competitionPolicyVersion).toBe(COMPETITION_POLICY_VERSION);
    expect(buildCoursePackageManifest(pkg, {}, 'x').terrainVersion).toBeNull();
  });
  it('suppresses every elevation-derived and interpreted advice item in competition mode', () => {
    const competition = competitionPolicy('competition');
    expect(competition).toMatchObject({ distances: true, direction: true, elevationDelta: false, playsLike: false, slopeAdjustment: false, clubRecommendation: false, rollRecommendation: false, targetLineAdvice: false });
    const practice = competitionPolicy('practice');
    expect(practice).toMatchObject({ elevationDelta: true, playsLike: false, rollRecommendation: false });
    expect(stoppingDistanceM(2, 0, ROLLING_RESISTANCE_MU)).toBeNull();
    expect(stoppingDistanceM(2, 0, .1)).toBeCloseTo(4 / (2 * 9.80665 * .1), 9);
    expect(stoppingDistanceM(2, .2, .1)).toBeNull();
  });
});
