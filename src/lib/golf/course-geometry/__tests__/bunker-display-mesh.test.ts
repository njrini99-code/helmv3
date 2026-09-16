import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { assertBunkerPatch, BUNKER_RING_SPACING, bunkerDisplacement, bunkerHeroProfiles, bunkerShape, bunkerSignedDistance, bunkerSpacingCap, compileBunkerAwarePatch, compileHeroPatches, outlineInradius } from '../bunker-display-mesh';
import { bunkerProfileNumbers, featureRings, smootherstep } from '../bunker-profile';
import { weldAndCleanTerrainMesh } from '../display-mesh-v2';
import { assertHeroPatch } from '../green-display-mesh';
import { compileHeroRegions } from '../hero-patches';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import type { MetricTerrainGrid } from '../terrain-source';
import type { HoleScene, LocalFeature, PointM } from '../types';
import { MERIDIAN_STYLE } from '../visual-style';

const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);
const circle = (cx: number, cy: number, r: number, n = 48, ry = r): PointM[] => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n), cy + ry * Math.sin(2 * Math.PI * i / n)] as PointM);
const feature = (id: string, kind: LocalFeature['kind'], ring: PointM[]): LocalFeature => ({ id, kind, type: 'Polygon', parts: [[ring]], reviewed: true });
const inRing = ([x, y]: PointM, ring: PointM[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** A 100 m square at 2 m cells on a plane: a green at (30, 30) r 8 with a
 * greenside bunker touching its influence, a large elongated fairway bunker
 * far away and a pot bunker 1.6 m below it, so their margin bands overlap. */
const GREEN = circle(30, 30, 8), GREENSIDE = circle(44, 30, 3.5), FAIRWAY = circle(75, 72, 9, 64, 5), POT = circle(75, 62.8, 2.6), SIZE_M = 100;
const terrain = (x: number, y: number) => 0.03 * x + 0.015 * y;
function syntheticWorld(): { mesh: TerrainMesh; scene: HoleScene } {
  const cells = SIZE_M / 2, vertices: number[] = [], triangleFeatures: number[] = [], triangleMaterials: number[] = [];
  const featureIds = ['green-1', 'bunker-greenside', 'bunker-fairway', 'bunker-pot', 'ground'], featureKinds = ['green', 'bunker', 'bunker', 'bunker', 'ground'], rings = [GREEN, GREENSIDE, FAIRWAY, POT];
  const push = (a: PointM, b: PointM, c: PointM) => {
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
    const index = rings.findIndex(ring => inRing([cx, cy], ring));
    for (const [x, y] of [a, b, c]) vertices.push(x, y, terrain(x, y));
    triangleFeatures.push(index < 0 ? 4 : index); triangleMaterials.push(0);
  };
  for (let row = 0; row < cells; row++) for (let column = 0; column < cells; column++) {
    const x0 = column * 2, y0 = row * 2, x1 = x0 + 2, y1 = y0 + 2;
    push([x0, y0], [x1, y0], [x1, y1]); push([x0, y0], [x1, y1], [x0, y1]);
  }
  const size = SIZE_M + 1, heightsM: number[] = [];
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) heightsM.push(terrain(column, row));
  const metricGrid: MetricTerrainGrid = { originM: [0, 0], spacingM: 1, columns: size, rows: size, heightsM };
  const mesh = {
    vertices, triangleFeatures, triangleMaterials, featureIds, featureKinds, metricGrid, contextFeatureIds: [],
    renderProfile: { tacticalBoundsM: [2, 2, SIZE_M - 2, SIZE_M - 2], contextBoundsM: [0, 0, SIZE_M, SIZE_M] },
  } as unknown as TerrainMesh;
  const scene = {
    overlayKind: 'unresolved', packageHash: 'p', physicalHoleKey: 'h', algorithmVersion: 'evidence-only-v1',
    target: { kind: 'unknown_pin', greenFeatureId: 'green-1' },
    hole: { key: 'h', ordinal: 1, par: 4, scorecardYards: 380, featureIds: ['green-1', 'bunker-greenside', 'bunker-fairway', 'bunker-pot'], routeFeatureId: null, greenFeatureId: 'green-1', nominalTargetWgs84: null, completeness: 'reviewed_surfaces', gaps: [] },
    features: [feature('green-1', 'green', GREEN), feature('bunker-greenside', 'bunker', GREENSIDE), feature('bunker-fairway', 'bunker', FAIRWAY), feature('bunker-pot', 'bunker', POT)],
    contextFeatures: [], contextZones: [], events: [], orientationRadians: 0, attribution: '',
  } as unknown as HoleScene;
  return { mesh, scene };
}

describe('bunker hero displacement (§35–39, §107, §113, §115; Task 8)', () => {
  const { mesh, scene } = syntheticWorld();
  const base = weldAndCleanTerrainMesh(mesh);
  const plan = compileHeroRegions(scene, mesh, base);
  const complex = plan.regions.find(r => r.kind === 'green_complex')!;
  const fairwayRegion = plan.regions.find(r => r.kind === 'bunker')!;
  const style = MERIDIAN_STYLE;

  it('gives the greenside bunker to the complex and merges the overlapping fairway pair into one region', () => {
    expect(complex.featureIds).toEqual(['green-1', 'bunker-greenside']);
    expect(plan.regions.filter(r => r.kind === 'bunker').map(r => r.featureIds)).toEqual([['bunker-fairway', 'bunker-pot']]);
    // No rim vertex of a bunker region lies inside a lip band.
    const p = base.positions;
    for (const loop of fairwayRegion.rimLoops) for (const v of loop) {
      const profiles = bunkerHeroProfiles(scene, mesh, fairwayRegion, style);
      for (const profile of profiles) expect(-bunkerSignedDistance([p[v * 3]!, p[v * 3 + 1]!], profile)).toBeGreaterThanOrEqual(style.bunker.lipBandM);
    }
  });

  it('lifts the V1 profile numbers unchanged: family by size and green reach, seeded depth and lip inside the style ranges', () => {
    const profiles = bunkerHeroProfiles(scene, mesh, fairwayRegion, style);
    const fairway = profiles.find(p => p.featureId === 'bunker-fairway')!, pot = profiles.find(p => p.featureId === 'bunker-pot')!;
    expect(fairway.family).toBe('fairway'); expect(fairway.sizeClass).toBe('medium');
    expect(pot.family).toBe('pot'); expect(pot.sizeClass).toBe('small');
    expect(pot.basis).toBe('visual_only');
    const greenRings = featureRings(scene.features[0]);
    const v1 = bunkerProfileNumbers(scene.features[2]!, style, { contextOnly: false, greenRings, inradiusM: fairway.inradiusM });
    expect(fairway.depthM).toBe(v1.depthM); expect(fairway.lipM).toBe(v1.lipM); expect(fairway.bowlRadiusM).toBe(v1.bowlRadiusM);
    const [low, high] = style.bunker.depthM.medium;
    expect(fairway.depthM).toBeGreaterThanOrEqual(low * style.bunker.familyDepthScale.fairway);
    expect(fairway.depthM).toBeLessThanOrEqual(high * style.bunker.familyDepthScale.fairway);
    expect(outlineInradius(fairway.rings)).toBeCloseTo(5, 0);
    expect(Math.abs(fairway.axisAngle)).toBeLessThan(0.05);
    expect(fairway.downhill![0]).toBeLessThan(0); // the plane rises with x
  });

  it('displaces a quintic bowl inside, a sin² lip outside, and nothing on the outline or beyond the band', () => {
    const [profile] = bunkerHeroProfiles(scene, mesh, fairwayRegion, style).filter(p => p.featureId === 'bunker-fairway');
    const centre: PointM = [75, 72];
    const d = bunkerSignedDistance(centre, profile!);
    expect(d).toBeCloseTo(5, 1);
    expect(bunkerDisplacement(centre, [profile!], style)).toBeCloseTo(-profile!.depthM * bunkerShape(centre, profile!), 6);
    const halfway: PointM = [75, 72 + profile!.bowlRadiusM / 2];
    const dh = bunkerSignedDistance(halfway, profile!);
    expect(bunkerDisplacement(halfway, [profile!], style)).toBeCloseTo(-profile!.depthM * bunkerShape(halfway, profile!) * smootherstep(dh / profile!.bowlRadiusM), 6);
    expect(Math.abs(bunkerDisplacement([75, 77], [profile!], style))).toBeLessThan(1e-9);
    const w = style.bunker.lipBandM;
    expect(bunkerDisplacement([75, 77 + w / 2], [profile!], style)).toBeCloseTo(profile!.lipM, 6);
    expect(bunkerDisplacement([75, 77 + w], [profile!], style)).toBe(0);
    expect(bunkerDisplacement([75, 90], [profile!], style)).toBe(0);
    // Shape stays inside its clamp everywhere.
    for (let k = 0; k < 200; k++) {
      const q: PointM = [66 + 18 * ((k * 7919) % 200) / 200, 67 + 10 * ((k * 104729) % 200) / 200];
      expect(bunkerShape(q, profile!)).toBeGreaterThanOrEqual(BUNKER_RING_SPACING.shapeMin);
      expect(bunkerShape(q, profile!)).toBeLessThanOrEqual(BUNKER_RING_SPACING.shapeMax);
    }
    // §35 caps: finest at the rim, lip band next, wall, floor; none far outside.
    expect(bunkerSpacingCap([75, 77], [profile!])).toBe(BUNKER_RING_SPACING.rimSpacingM);
    expect(bunkerSpacingCap([75, 77.6], [profile!])).toBe(BUNKER_RING_SPACING.outerSpacingM);
    expect(bunkerSpacingCap([75, 76], [profile!])).toBe(BUNKER_RING_SPACING.wallSpacingM);
    expect(bunkerSpacingCap([75, 72], [profile!])).toBe(BUNKER_RING_SPACING.floorSpacingM);
    expect(bunkerSpacingCap([75, 90], [profile!])).toBe(Infinity);
  });

  it('compiles both regions through the shared engine: gates, zero rim seam, bowls and lips in range, canonical reference kept', () => {
    const patches = compileHeroPatches(scene, mesh, base, plan, style);
    expect(patches.map(c => c.patch.id)).toEqual([complex.id, fairwayRegion.id]);
    for (const compiled of patches) {
      const region = plan.regions.find(r => r.id === compiled.patch.id)!;
      expect(() => assertHeroPatch(compiled, base, region)).not.toThrow();
      expect(() => assertBunkerPatch(compiled, style)).not.toThrow();
      expect(compiled.report.seamHeightMaxM).toBe(0);
      expect(compiled.report.triangles).toBeLessThanOrEqual(region.budgetTriangles);
      const { patch } = compiled;
      for (let v = 0; v < patch.positions.length / 3; v++) {
        // Drawn height = canonical plane + relief (0 on a plane) + the render-only offset.
        expect(patch.positions[v * 3 + 2]! - patch.canonicalHeightReference[v]!).toBeCloseTo(patch.visualOffsetMm[v]! / 1000, 3);
        expect(patch.canonicalHeightReference[v]!).toBeCloseTo(terrain(patch.positions[v * 3]!, patch.positions[v * 3 + 1]!), 3);
      }
    }
    const [greenPatch, bunkerPatch] = patches;
    expect(greenPatch!.profiles.map(p => p.featureId)).toEqual(['bunker-greenside']);
    expect(greenPatch!.report.offsetMinM).toBeLessThan(-0.2);
    expect(bunkerPatch!.profiles.map(p => p.featureId)).toEqual(['bunker-fairway', 'bunker-pot']);
    expect(bunkerPatch!.report.offsetMinM).toBeLessThan(-0.3);
    expect(bunkerPatch!.report.offsetMaxM).toBeGreaterThan(0.03);
    // Sand triangles are sampled at wall density or finer.
    const q = bunkerPatch!.patch.positions;
    let sandEdges = 0, sandTotal = 0;
    for (let t = 0; t < bunkerPatch!.patch.indices.length / 3; t++) {
      if (bunkerPatch!.triangleClass[t] !== 7) continue; // 'bunker' in SURFACE_CLASS_IDS
      const [a, b] = [bunkerPatch!.patch.indices[t * 3]!, bunkerPatch!.patch.indices[t * 3 + 1]!];
      sandEdges += Math.hypot(q[a * 3]! - q[b * 3]!, q[a * 3 + 1]! - q[b * 3 + 1]!); sandTotal++;
    }
    expect(sandTotal).toBeGreaterThan(300);
    expect(sandEdges / sandTotal).toBeLessThan(BUNKER_RING_SPACING.floorSpacingM);
  });

  it('is deterministic and rejects a lip that leaks past its band or a bowl on the wrong side', () => {
    const a = compileBunkerAwarePatch(scene, mesh, base, fairwayRegion, style), b = compileBunkerAwarePatch(scene, mesh, base, fairwayRegion, style);
    expect(Array.from(a.patch.positions)).toEqual(Array.from(b.patch.positions));
    expect(Array.from(a.patch.visualOffsetMm)).toEqual(Array.from(b.patch.visualOffsetMm));
    const leaked = { ...a, patch: { ...a.patch, visualOffsetMm: a.patch.visualOffsetMm.slice() } };
    let far = 0;
    for (let v = 0; v < leaked.patch.positions.length / 3; v++) if (leaked.patch.positions[v * 3]! > leaked.patch.positions[far * 3]!) far = v;
    leaked.patch.visualOffsetMm[far] = 20; // the easternmost rim vertex, ≥ 1.5 m outside any outline
    expect(() => assertBunkerPatch(leaked, style)).toThrow(/beyond the lip band/);
    const flipped = { ...a, patch: { ...a.patch, visualOffsetMm: a.patch.visualOffsetMm.map(v => -v) } };
    expect(() => assertBunkerPatch(flipped, style)).toThrow(/against the outline side|bowl reaches/);
  });

  it('compiles hole 7: the complex owns its three greenside bunkers, three fairway bunkers stand alone, every gate passes', () => {
    const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
    const manifest = JSON.parse(readFileSync(new URL('compiled-peek-n-peak-upper/asset-manifest.json', fixtures), 'utf8')) as { holes: Record<string, { fileName: string }> };
    const fileName = manifest.holes['peek-n-peak-upper-07']!.fileName;
    const raw = readFileSync(new URL(`compiled-peek-n-peak-upper/${fileName}`, fixtures));
    const hole = parseTerrainMesh(JSON.parse((fileName.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
    const holeScene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], hole);
    const holeBase = weldAndCleanTerrainMesh(hole);
    const holePlan = compileHeroRegions(holeScene, hole, holeBase);
    const patches = compileHeroPatches(holeScene, hole, holeBase, holePlan);
    expect(patches.length).toBe(4);
    const green = patches.find(c => c.patch.kind === 'green_complex')!;
    expect(green.profiles.length).toBe(3);
    for (const compiled of patches) {
      const region = holePlan.regions.find(r => r.id === compiled.patch.id)!;
      expect(() => assertHeroPatch(compiled, holeBase, region)).not.toThrow();
      expect(() => assertBunkerPatch(compiled)).not.toThrow();
      expect(compiled.report.seamHeightMaxM).toBe(0);
      expect(compiled.report.offsetMinM).toBeLessThan(-0.3);
      expect(compiled.report.offsetMaxM).toBeGreaterThan(0.03);
    }
    const bunkerTriangles = patches.filter(c => c.patch.kind === 'bunker').reduce((sum, c) => sum + c.report.triangles, 0);
    expect(bunkerTriangles).toBeLessThanOrEqual(8000);
  });
});
