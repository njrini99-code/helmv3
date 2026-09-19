import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { parseContextLayer, type LocalContextZone } from '../context-layer';
import { assertBaseDisplayLods, compileBaseDisplayLods, weldAndCleanTerrainMesh } from '../display-mesh-v2';
import { ABSORBED_BUNKER_BUDGET, assertHeroRegionPlan, compileHeroRegions, featureDistance, HERO_BUDGETS, HERO_REGION_OPTIONS, type HeroRegionPlan } from '../hero-patches';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import type { MetricTerrainGrid } from '../terrain-source';
import type { HoleScene, LocalFeature, PointM } from '../types';

const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);
const circle = (cx: number, cy: number, r: number, n = 48): PointM[] => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n), cy + r * Math.sin(2 * Math.PI * i / n)] as PointM);
const feature = (id: string, kind: LocalFeature['kind'], ring: PointM[]): LocalFeature => ({ id, kind, type: 'Polygon', parts: [[ring]], reviewed: true });
const zone = (id: string, line: PointM[], widthM = 2.4): LocalContextZone => ({
  id, class: 'cart_path', type: 'LineString', parts: [[line]], basis: 'source_geometry' as LocalContextZone['basis'], reviewed: true,
  fidelity: 'high', render: 'ribbon' as LocalContextZone['render'], attributes: { widthM },
});
const inRing = ([x, y]: PointM, ring: PointM[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** A 120 m square at 2 m cells: a green at (60, 60) r 8 with a greenside
 * bunker at (72, 60) r 3, a far bunker at (14, 106) r 3 beyond the 35 m
 * influence, a pond along the west edge and a cart path down the east side,
 * both outside the influence. Triangles take the feature their centroid
 * falls in. */
const GREEN = circle(60, 60, 8), NEAR_BUNKER = circle(72, 60, 3), FAR_BUNKER = circle(14, 106, 3), POND: PointM[] = [[0, 0], [4, 0], [4, 120], [0, 120], [0, 0]];
const PATH_X = 112, POND_EDGE_X = 4, SIZE_M = 120;
function syntheticWorld(): { mesh: TerrainMesh; scene: HoleScene } {
  const cells = 60, cellM = 2, vertices: number[] = [], triangleFeatures: number[] = [], triangleMaterials: number[] = [];
  const featureIds = ['green-1', 'bunker-near', 'bunker-far', 'pond', 'ground'], featureKinds = ['green', 'bunker', 'bunker', 'water', 'ground'];
  const rings = [GREEN, NEAR_BUNKER, FAR_BUNKER, POND];
  const height = (x: number, y: number) => 0.02 * x + 0.01 * y;
  const push = (a: PointM, b: PointM, c: PointM) => {
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
    const index = rings.findIndex(ring => inRing([cx, cy], ring));
    for (const [x, y] of [a, b, c]) vertices.push(x, y, height(x, y));
    triangleFeatures.push(index < 0 ? 4 : index); triangleMaterials.push(0);
  };
  for (let row = 0; row < cells; row++) for (let column = 0; column < cells; column++) {
    const x0 = column * cellM, y0 = row * cellM, x1 = x0 + cellM, y1 = y0 + cellM;
    push([x0, y0], [x1, y0], [x1, y1]); push([x0, y0], [x1, y1], [x0, y1]);
  }
  const size = cells * cellM + 1, heightsM: number[] = [];
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) heightsM.push(height(column, row));
  const metricGrid: MetricTerrainGrid = { originM: [0, 0], spacingM: 1, columns: size, rows: size, heightsM };
  const mesh = {
    vertices, triangleFeatures, triangleMaterials, featureIds, featureKinds, metricGrid, contextFeatureIds: ['pond'],
    renderProfile: { tacticalBoundsM: [4, 4, SIZE_M - 4, SIZE_M - 4], contextBoundsM: [0, 0, SIZE_M, SIZE_M] },
  } as unknown as TerrainMesh;
  const scene = {
    overlayKind: 'unresolved', packageHash: 'p', physicalHoleKey: 'h', algorithmVersion: 'evidence-only-v1',
    target: { kind: 'unknown_pin', greenFeatureId: 'green-1' },
    hole: { key: 'h', ordinal: 1, par: 3, scorecardYards: 150, featureIds: ['green-1', 'bunker-near', 'bunker-far'], routeFeatureId: null, greenFeatureId: 'green-1', nominalTargetWgs84: null, completeness: 'reviewed_surfaces', gaps: [] },
    features: [feature('green-1', 'green', GREEN), feature('bunker-near', 'bunker', NEAR_BUNKER), feature('bunker-far', 'bunker', FAR_BUNKER)],
    contextFeatures: [feature('pond', 'water', POND)],
    contextZones: [zone('path-east', [[PATH_X, 2], [PATH_X, SIZE_M - 2]])],
    events: [], orientationRadians: 0, attribution: '',
  } as unknown as HoleScene;
  return { mesh, scene };
}
const centroid = (base: { positions: Float64Array; indices: Uint32Array }, t: number): PointM => {
  const p = base.positions, a = base.indices[t * 3]! * 3, b = base.indices[t * 3 + 1]! * 3, c = base.indices[t * 3 + 2]! * 3;
  return [(p[a]! + p[b]! + p[c]!) / 3, (p[a + 1]! + p[b + 1]! + p[c + 1]!) / 3];
};
const triangleArea = (p: ArrayLike<number>, a: number, b: number, c: number) =>
  Math.abs((p[b * 3]! - p[a * 3]!) * (p[c * 3 + 1]! - p[a * 3 + 1]!) - (p[c * 3]! - p[a * 3]!) * (p[b * 3 + 1]! - p[a * 3 + 1]!)) / 2;

describe('hero patch regions (§5, §11, §27, §35; Task 6)', () => {
  const { mesh, scene } = syntheticWorld();
  const base = weldAndCleanTerrainMesh(mesh);
  const plan = compileHeroRegions(scene, mesh, base);
  const byKind = (kind: string) => plan.regions.filter(r => r.kind === kind);

  it('measures 0 inside a feature and the outline distance outside it', () => {
    const green = scene.features[0]!;
    expect(featureDistance([60, 60], green)).toBe(0);
    expect(featureDistance([60, 70], green)).toBeCloseTo(2, 2);
    expect(featureDistance([80, 60], green)).toBeCloseTo(12, 2);
  });

  it('claims the green influence region with its greenside bunker, leaving the far bunker its own region', () => {
    expect(() => assertHeroRegionPlan(plan, base)).not.toThrow();
    expect(plan.basis).toBe('canonical_regions');
    const [complex] = byKind('green_complex');
    expect(complex).toBeDefined();
    expect(complex!.featureIds).toEqual(['green-1', 'bunker-near']);
    const bunkers = byKind('bunker');
    expect(bunkers.map(r => r.featureIds)).toEqual([['bunker-far']]);
    // Every green and near-bunker triangle is in the complex; every far-bunker triangle in its own region.
    for (let t = 0; t < base.triangleCount; t++) {
      const featureId = mesh.featureIds[base.triangleFeatures[t]!]!, region = plan.triangleRegion[t]!;
      if (featureId === 'green-1' || featureId === 'bunker-near') expect(plan.regions[region - 1]?.kind).toBe('green_complex');
      if (featureId === 'bunker-far') expect(plan.regions[region - 1]?.id).toBe('bunker:bunker-far');
    }
    // The influence reaches ~35 m but is clipped to the tactical bounds + margin, never past the pond edge.
    for (const t of complex!.triangles) {
      const c = centroid(base, t);
      expect(featureDistance(c, scene.features[0]!)).toBeLessThanOrEqual(HERO_REGION_OPTIONS.greenInfluenceM + 2);
      expect(c[0]).toBeGreaterThan(4 - HERO_REGION_OPTIONS.clipMarginM);
    }
    expect(complex!.rimLoops.length).toBe(1);
    expect(complex!.pinchVertices).toBe(0);
    expect(complex!.areaM2).toBeGreaterThan(Math.PI * 35 * 35 * 0.5);
  });

  it('bands the shoreline one ring either side and the cart path to its half width plus margin', () => {
    const [shore] = byKind('water_edge');
    expect(shore).toBeDefined();
    expect(shore!.featureIds).toEqual(['pond']);
    for (const t of shore!.triangles) {
      const p = base.positions, corners = [0, 1, 2].map(k => base.indices[t * 3 + k]!);
      const nearest = Math.min(...corners.map(v => Math.abs(p[v * 3]! - POND_EDGE_X)));
      expect(nearest).toBeLessThanOrEqual(HERO_REGION_OPTIONS.waterEdgeM);
    }
    const paths = byKind('path');
    expect(paths.length).toBe(1);
    for (const t of paths[0]!.triangles) {
      const corners = [0, 1, 2].map(k => base.indices[t * 3 + k]!);
      expect(Math.min(...corners.map(v => Math.abs(base.positions[v * 3]! - PATH_X)))).toBeLessThanOrEqual(1.2 + HERO_REGION_OPTIONS.pathMarginM);
    }
  });

  it('keeps regions disjoint, filled and simply bounded, and drops fragments', () => {
    const owner = new Uint16Array(base.triangleCount);
    for (const region of plan.regions) {
      expect(region.triangles.length).toBeGreaterThanOrEqual(HERO_REGION_OPTIONS.minTriangles);
      expect(region.areaM2).toBeGreaterThanOrEqual(HERO_REGION_OPTIONS.minAreaM2);
      for (const t of region.triangles) { expect(owner[t]).toBe(0); owner[t] = 1; }
      expect(region.rimLoops.reduce((sum, loop) => sum + loop.length - 1, 0)).toBe(region.rimEdges);
      for (const loop of region.rimLoops) expect(loop[0]).toBe(loop[loop.length - 1]);
    }
    // A tiny pond fragment falls under the area floor.
    const tiny = compileHeroRegions({ ...scene, contextFeatures: [feature('puddle', 'water', circle(30, 100, 0.3, 8))] } as HoleScene, mesh, base, { waterEdgeM: 0.1 });
    expect(tiny.regions.some(r => r.kind === 'water_edge')).toBe(false);
  });

  it('shares §11 budgets by area with a floor, and is deterministic', () => {
    const [complex] = byKind('green_complex');
    expect(complex!.budgetTriangles).toBe(HERO_BUDGETS.green_complex + ABSORBED_BUNKER_BUDGET * (complex!.featureIds.length - 1));
    const [far] = byKind('bunker');
    expect(far!.budgetTriangles).toBe(HERO_BUDGETS.bunker);
    const again = compileHeroRegions(scene, mesh, base);
    expect(again.regionIds).toEqual(plan.regionIds);
    expect(again.triangleRegion).toEqual(plan.triangleRegion);
    expect(again.regions.map(r => r.areaM2)).toEqual(plan.regions.map(r => r.areaM2));
  });

  it('rejects a plan whose regions overlap, whose mask disagrees, or whose rim does not close', () => {
    const overlap: HeroRegionPlan = { ...plan, regions: [plan.regions[0]!, { ...plan.regions[1]!, triangles: plan.regions[0]!.triangles }] };
    expect(() => assertHeroRegionPlan(overlap, base)).toThrow(/overlaps/);
    const mask = Uint16Array.from(plan.triangleRegion);
    mask[plan.regions[0]!.triangles[0]!] = 0;
    expect(() => assertHeroRegionPlan({ ...plan, triangleRegion: mask }, base)).toThrow(/mask mismatch/);
    const open: HeroRegionPlan = { ...plan, regions: plan.regions.map((r, i) => (i ? r : { ...r, rimLoops: [r.rimLoops[0]!.slice(0, -1)] })) };
    expect(() => assertHeroRegionPlan(open, base)).toThrow(/open rim/);
  });

  it('orders every base LOD base-first with one run per region whose footprint never changes', () => {
    const lods = compileBaseDisplayLods(mesh, { lod0Target: 12_000, lod2Target: 5_000, heroPlan: { triangleRegion: plan.triangleRegion, regionIds: plan.regionIds } });
    assertBaseDisplayLods(lods);
    for (const name of ['lod0', 'lod1', 'lod2'] as const) {
      const lod = lods[name];
      expect(lod.heroRanges?.map(r => r.id)).toEqual(plan.regionIds);
      let previous = 0;
      lod.heroRanges!.forEach((range, i) => {
        expect(range.start).toBeGreaterThanOrEqual(previous);
        previous = range.start + range.count;
        let sum = 0;
        for (let t = range.start; t < range.start + range.count; t++) sum += triangleArea(lod.positions, lod.indices[t * 3]!, lod.indices[t * 3 + 1]!, lod.indices[t * 3 + 2]!);
        expect(Math.abs(sum - plan.regions[i]!.areaM2)).toBeLessThan(1e-3);
        // Rim vertices are exact base vertices in every LOD.
        for (const loop of plan.regions[i]!.rimLoops) for (const v of loop) {
          const x = Math.fround(base.positions[v * 3]!), y = Math.fround(base.positions[v * 3 + 1]!);
          let found = false;
          for (let t = range.start; t < range.start + range.count && !found; t++) for (let k = 0; k < 3; k++) {
            const w = lod.indices[t * 3 + k]!;
            if (lod.positions[w * 3] === x && lod.positions[w * 3 + 1] === y) { found = true; break; }
          }
          expect(found).toBe(true);
        }
      });
      expect(previous).toBe(lod.triangleCount);
      // Region triangles are never refined: LOD0 runs equal LOD1 runs.
      if (name === 'lod0') lod.heroRanges!.forEach((range, i) => expect(range.count).toBe(lods.lod1.heroRanges![i]!.count));
    }
    expect(lods.lod0.triangleCount).toBeGreaterThan(lods.lod1.triangleCount);
    expect(lods.lod2.triangleCount).toBeLessThan(lods.lod1.triangleCount);
    expect(() => compileBaseDisplayLods(mesh, { heroPlan: { triangleRegion: new Uint16Array(3), regionIds: [] } })).toThrow(/does not match/);
  });

  it("plans Peek'n Peak hole 7: one green complex absorbing its bunkers, water and path bands, gates pass", () => {
    const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
    const context = parseContextLayer(JSON.parse(readFileSync(new URL('peek-n-peak-upper-context.json', fixtures), 'utf8')), pkg);
    const hole7 = parseTerrainMesh(JSON.parse(gunzipSync(readFileSync(new URL('compiled-peek-n-peak-upper/peek-n-peak-upper-07-terrain.json.gz', fixtures))).toString('utf8')), pkg);
    const holeScene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], hole7, context);
    const hole7Base = weldAndCleanTerrainMesh(hole7);
    const hole7Plan = compileHeroRegions(holeScene, hole7, hole7Base);
    assertHeroRegionPlan(hole7Plan, hole7Base);
    const kinds = hole7Plan.regions.map(r => r.kind);
    expect(kinds.filter(k => k === 'green_complex')).toHaveLength(1);
    expect(kinds.filter(k => k === 'bunker').length).toBeGreaterThanOrEqual(3);
    expect(kinds).toContain('water_edge');
    expect(kinds).toContain('path');
    const complex = hole7Plan.regions.find(r => r.kind === 'green_complex')!;
    expect(complex.featureIds.length).toBeGreaterThan(1);
    expect(complex.triangles.length).toBeGreaterThan(3000);
    expect(complex.budgetTriangles).toBe(HERO_BUDGETS.green_complex + ABSORBED_BUNKER_BUDGET * (complex.featureIds.length - 1));
    const lods = compileBaseDisplayLods(hole7, { heroPlan: { triangleRegion: hole7Plan.triangleRegion, regionIds: hole7Plan.regionIds } });
    assertBaseDisplayLods(lods);
    expect(lods.lod2.heroRanges).toHaveLength(hole7Plan.regions.length);
    lods.lod2.heroRanges!.forEach((range, i) => {
      let sum = 0;
      for (let t = range.start; t < range.start + range.count; t++) sum += triangleArea(lods.lod2.positions, lods.lod2.indices[t * 3]!, lods.lod2.indices[t * 3 + 1]!, lods.lod2.indices[t * 3 + 2]!);
      expect(Math.abs(sum - hole7Plan.regions[i]!.areaM2)).toBeLessThan(1e-2);
    });
  });
});
