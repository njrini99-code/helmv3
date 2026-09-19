import { describe, expect, it } from 'vitest';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { projectToLocal } from '@/lib/golf/course-geometry/project';
import packageJson from '@/test/fixtures/course-geometry/peek-n-peak-upper.json';
import { enuToWgs84, localOriginFor } from '../geodesy';
import { EDGE_SIGMA_DEFAULTS, QA_SAMPLES, buildSurfacePartition, classifyLie, deterministicGaussianSamples, distanceToBoundary, exactPointInPartition, greenComplexProbability, lieDisplayPolicy } from '../lie-classifier';

// SYNTHETIC TEST VECTOR: a square green (0..20 m), a fairway strip west of it
// and a tee, projected back to WGS84 so the package parser accepts them.
const originWgs84 = [-79.744, 42.06] as const, origin = localOriginFor({ originWgs84, projection: 'wgs84-local-enu-v1' });
const ring = (points: [number, number][]) => [...points, points[0]!].map(([e, n]) => { const p = enuToWgs84([e, n, 0], origin); return [p[0], p[1]]; });
const hash = 'a'.repeat(64);
const synthetic = parseGeometryPackage({
  schemaVersion: 1, siteId: 'synthetic', name: 'SYNTHETIC TEST VECTOR', contentHash: hash, status: 'source_candidate', originWgs84, projection: 'wgs84-local-enu-v1',
  sources: [{ id: 's', provider: 'synthetic', licenseId: 'none', url: 'https://example.invalid', capturedAt: null, retrievedAt: '2026-09-17', attribution: 'synthetic' }],
  features: [
    { id: 'green', kind: 'green', sourceIds: ['s'], holeKeys: ['h'], geometryWgs84: { type: 'Polygon', coordinates: [ring([[0, 0], [20, 0], [20, 20], [0, 20]])] }, reviewed: true, accuracyMeters: .5 },
    { id: 'fairway', kind: 'fairway', sourceIds: ['s'], holeKeys: ['h'], geometryWgs84: { type: 'Polygon', coordinates: [ring([[-120, -10], [-6, -10], [-6, 30], [-120, 30]])] }, reviewed: false, accuracyMeters: null },
    { id: 'tee', kind: 'tee', sourceIds: ['s'], holeKeys: ['h'], geometryWgs84: { type: 'Polygon', coordinates: [ring([[-200, 0], [-180, 0], [-180, 12], [-200, 12]])] }, reviewed: false, accuracyMeters: null },
    { id: 'route', kind: 'route', sourceIds: ['s'], holeKeys: ['h'], geometryWgs84: { type: 'LineString', coordinates: ring([[-190, 6], [10, 10]]).slice(0, 2) }, reviewed: false, accuracyMeters: null },
  ],
  holes: [{ key: 'h', ordinal: 1, par: 3, scorecardYards: 200, featureIds: ['green', 'fairway', 'tee', 'route'], routeFeatureId: 'route', greenFeatureId: 'green', nominalTargetWgs84: null, completeness: 'partial', gaps: [] }],
});
const partition = buildSurfacePartition(synthetic, 'h');
const tight = [[1, 0], [0, 1]] as const, phone = [[9, 0], [0, 9]] as const;

describe('one-tap lie classifier', () => {
  it('builds the partition from canonical features with recorded or default edge sigma, never zero', () => {
    expect(partition.geometryVersion).toBe(hash);
    expect(partition.surfaces.map(s => [s.lieClass, s.edgeSigmaM, s.edgeSigmaBasis])).toEqual([['green', .5, 'package_accuracy'], ['tee', EDGE_SIGMA_DEFAULTS.unreviewed, 'default_unreviewed'], ['fairway', EDGE_SIGMA_DEFAULTS.unreviewed, 'default_unreviewed']]);
    expect(partition.surfaces.every(s => s.edgeSigmaM > 0)).toBe(true);
    expect(partition.surfaces.some(s => s.lieClass === 'fringe' || s.lieClass === 'apron')).toBe(false);
  });
  it('classifies exactly far from every boundary and by derived distance bands elsewhere', () => {
    expect(exactPointInPartition(partition, [10, 10])).toEqual({ lieClass: 'green', featureId: 'green', basis: 'explicit_feature' });
    expect(exactPointInPartition(partition, [-60, 10])).toEqual({ lieClass: 'fairway', featureId: 'fairway', basis: 'explicit_feature' });
    expect(exactPointInPartition(partition, [10, 25])).toEqual({ lieClass: 'primary_rough', featureId: null, basis: 'derived_distance_band' });
    expect(exactPointInPartition(partition, [10, 45])).toEqual({ lieClass: 'secondary_rough', featureId: null, basis: 'derived_distance_band' });
    expect(exactPointInPartition(partition, [10, 80])).toEqual({ lieClass: 'UNKNOWN', featureId: null, basis: 'outside_modeled_area' });
    expect(distanceToBoundary([10, 25], partition.surfaces[0]!.feature)).toBeCloseTo(5, 6);
  });
  it('returns p = 1 without sampling well inside a surface', () => {
    const r = classifyLie(partition, [10, 10], tight);
    expect(r).toMatchObject({ method: 'exact', primaryLie: 'green', primaryFeatureId: 'green', pMax: 1, sampleCount: 0 });
    expect(r.queryRadiusM).toBeCloseTo(3 + partition.maxEdgeSigmaM, 9);
  });
  it('represents the boundary honestly instead of forcing a class', () => {
    const r = classifyLie(partition, [19.5, 10], phone);
    expect(r.method).toBe('monte_carlo');
    expect(r.sampleCount).toBe(128);
    expect(r.edgeSigmaM).toBe(.5);
    const green = r.classes.find(c => c.lieClass === 'green')!.p, rough = r.classes.find(c => c.lieClass === 'primary_rough')?.p ?? 0;
    expect(green).toBeGreaterThan(.3);
    expect(green).toBeLessThan(.8);
    expect(rough).toBeGreaterThan(.15);
    expect(r.classes.reduce((s, c) => s + c.p, 0)).toBeCloseTo(1, 9);
    expect(lieDisplayPolicy(r.pMax)).not.toBe('clean');
    expect(greenComplexProbability(r)).toBeCloseTo(green, 9);
  });
  it('samples deterministically and the QA sample count converges toward Φ at a straight edge', () => {
    const a = deterministicGaussianSamples([1, 2], [[4, 1], [1, 9]], 64), b = deterministicGaussianSamples([1, 2], [[4, 1], [1, 9]], 64);
    expect(a).toEqual(b);
    expect(a).toHaveLength(64);
    const meanE = a.reduce((s, p) => s + p[0], 0) / 64, meanN = a.reduce((s, p) => s + p[1], 0) / 64;
    expect(Math.abs(meanE - 1)).toBeLessThan(.6);
    expect(Math.abs(meanN - 2)).toBeLessThan(.9);
    // 1.5 m inside the west fairway edge (x = −6) with σ_pos 3 and σ_edge 2.5: Φ(1.5 / √(9 + 6.25)) ≈ 0.65.
    const r = classifyLie(partition, [-7.5, 10], phone, QA_SAMPLES);
    const fairway = r.classes.find(c => c.lieClass === 'fairway')!.p;
    expect(Math.abs(fairway - .65)).toBeLessThan(.06);
    expect(classifyLie(partition, [-7.5, 10], phone, QA_SAMPLES)).toEqual(r);
  });
  it('keeps UNKNOWN as a real class outside the modeled area and never moves the point', () => {
    const r = classifyLie(partition, [10, 200], phone);
    expect(r).toMatchObject({ primaryLie: 'UNKNOWN', pMax: 1, method: 'exact' });
    expect(lieDisplayPolicy(.95)).toBe('clean');
    expect(lieDisplayPolicy(.75)).toBe('cue');
    expect(lieDisplayPolicy(.5)).toBe('boundary');
  });
  it('agrees with the retained Peek’n Peak hole 15 package at the green reference', () => {
    const pkg = parseGeometryPackage(packageJson);
    const hole = pkg.holes.find(h => h.ordinal === 15)!;
    const part = buildSurfacePartition(pkg, hole.key);
    const reference = projectToLocal(hole.nominalTargetWgs84!, pkg.originWgs84);
    const r = classifyLie(part, reference, tight);
    expect(r.primaryLie).toBe('green');
    expect(r.primaryFeatureId).toBe(hole.greenFeatureId);
    expect(part.surfaces.find(s => s.featureId === hole.greenFeatureId)?.edgeSigmaBasis).toBe('default_unreviewed');
  });
});
