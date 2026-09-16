import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { parseContextLayer, type LocalContextZone } from '../context-layer';
import {
  assertForestEdgeV2, compileForestEdgeV2, forestCrownDensity, FOREST_EDGE_V2_OPTIONS,
  type ForestEdgeV2Result, type ForestInstance,
} from '../forest-edge-v2';
import { boundaryDistance } from '../display-outline';
import { parseGeometryPackage } from '../schema';
import { inFeature } from '../spatial';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import type { MetricTerrainGrid } from '../terrain-source';
import type { HoleScene, LocalFeature, PointM } from '../types';

const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);
const circle = (cx: number, cy: number, r: number, n = 48): PointM[] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n), cy + r * Math.sin(2 * Math.PI * i / n)] as PointM);
const rect = (x0: number, y0: number, x1: number, y1: number): PointM[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const feature = (id: string, kind: LocalFeature['kind'], ring: PointM[], reviewed = true): LocalFeature => ({ id, kind, type: 'Polygon', parts: [[ring]], reviewed });
const beltZone = (id: string, line: PointM[], widthM?: number): LocalContextZone => ({
  id, class: 'tree_belt', type: 'LineString', parts: [[line]], basis: 'source', reviewed: true,
  fidelity: 'medium', render: 'vegetation', attributes: widthM == null ? {} : { widthM },
});

const WOODS_ID = 'woods-1', BELT_ID = 'belt-1', FAIRWAY_ID = 'fairway-1';
const SIZE_M = 300;

/** A 300 m square metric grid (gentle slope, so z is never a flat constant)
 * plus a reviewed woods disc (r 45, well past the edge band), a fairway cut
 * into its south-east quadrant (so exclusion/clearance is actually
 * exercised, not vacuously true) and a tree-row context zone with no
 * authored width (defaults to `rowWidthM`), far enough from both to avoid
 * incidental overlap. Built like `hero-patches.test.ts`'s `syntheticWorld`,
 * without a triangulated mesh: `terrainHeight` reads the metric grid
 * directly and never touches `mesh.vertices` when one is present. */
function syntheticWorld(): { mesh: TerrainMesh; scene: HoleScene } {
  const spacingM = 3, size = SIZE_M / spacingM + 1, heightsM: number[] = [];
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) heightsM.push(100 + .01 * column * spacingM + .004 * row * spacingM);
  const metricGrid: MetricTerrainGrid = { originM: [0, 0], spacingM, columns: size, rows: size, heightsM };
  const mesh = { metricGrid } as unknown as TerrainMesh;
  const woods = feature(WOODS_ID, 'woods', circle(160, 160, 45));
  const fairway = feature(FAIRWAY_ID, 'fairway', rect(180, 140, 220, 180));
  const belt = beltZone(BELT_ID, [[10, 20], [SIZE_M - 10, 24]]);
  const scene = {
    overlayKind: 'unresolved', packageHash: 'p'.repeat(12), physicalHoleKey: 'h', algorithmVersion: 'evidence-only-v1',
    target: { kind: 'unknown_pin', greenFeatureId: null },
    hole: { key: 'h', ordinal: 1, par: 4, scorecardYards: 400, featureIds: [WOODS_ID, FAIRWAY_ID], routeFeatureId: null, greenFeatureId: null, nominalTargetWgs84: null, completeness: 'reviewed_surfaces', gaps: [] },
    features: [woods, fairway], contextZones: [belt], events: [], orientationRadians: 0, attribution: '',
  } as unknown as HoleScene;
  return { mesh, scene };
}

/** Every point this compiler placed lies inside the woods polygon or the
 * belt's own buffered band: a manual re-check independent of `inFeature`
 * (which `assertForestEdgeV2` itself uses) for the woods disc, by radius. */
function assertInsideWoodsDisc(points: readonly PointM[]) {
  for (const [x, y] of points) expect(Math.hypot(x - 160, y - 160)).toBeLessThanOrEqual(45 + 1e-6);
}

describe('forest edge V2 (§59–68; Task 15)', () => {
  const { mesh, scene } = syntheticWorld();
  const result = compileForestEdgeV2(scene, mesh);

  it('places every instance inside its own woods feature or context band, and gates pass', () => {
    expect(() => assertForestEdgeV2(result, scene)).not.toThrow();
    const woodsInstances = result.instances.filter(i => i.featureId === WOODS_ID);
    const beltInstances = result.instances.filter(i => i.featureId === BELT_ID);
    expect(woodsInstances.length).toBeGreaterThan(0);
    expect(beltInstances.length).toBeGreaterThan(0);
    assertInsideWoodsDisc(woodsInstances.map((i): PointM => [i.x, i.y]));
    // The belt is a 6 m-wide corridor (no authored width): never wide enough
    // to reach the interior-mass gate, so it carries edge crowns/shrubs only.
    for (const instance of beltInstances) {
      expect(instance.kind).not.toBe('mass');
      expect(instance.edgeDistanceM).toBeLessThanOrEqual(FOREST_EDGE_V2_OPTIONS.rowWidthM / 2 + 1e-6);
    }
    expect(result.edges.some(e => e.featureId === WOODS_ID)).toBe(true);
    expect(result.edges.some(e => e.featureId === BELT_ID)).toBe(true);
    for (const z of [...result.instances.map(i => i.z), ...result.understory.map(s => s.z), ...result.edges.flatMap(e => e.samples.map(s => s.z))]) {
      expect(Number.isFinite(z)).toBe(true);
    }
  });

  it('keeps every instance clear of a fairway cut into the woods (constraint 14/16-adjacent)', () => {
    const woods = scene.features.find(f => f.id === WOODS_ID)!, fairway = scene.features.find(f => f.id === FAIRWAY_ID)!;
    const clearanceByKind = { crown: FOREST_EDGE_V2_OPTIONS.crownClearanceM, shrub: FOREST_EDGE_V2_OPTIONS.shrubClearanceM, mass: FOREST_EDGE_V2_OPTIONS.massClearanceM };
    // The fairway rectangle's own centre lies inside the woods disc, so the
    // exclusion below is real (candidates in that quadrant exist to reject),
    // not vacuous.
    expect(inFeature([200, 160], woods)).toBe(true);
    const woodsInstances = result.instances.filter(i => i.featureId === WOODS_ID);
    for (const instance of woodsInstances) {
      const point: PointM = [instance.x, instance.y];
      expect(inFeature(point, fairway)).toBe(false);
      for (const ring of fairway.parts.flat()) expect(boundaryDistance(point, ring)).toBeGreaterThanOrEqual(clearanceByKind[instance.kind] - 1e-6);
    }
  });

  it('never places a mass lobe short of the interior inset, nor a shrub outside its band', () => {
    for (const instance of result.instances) {
      if (instance.kind === 'mass' && instance.featureId === WOODS_ID) expect(instance.edgeDistanceM).toBeGreaterThanOrEqual(FOREST_EDGE_V2_OPTIONS.interiorInsetM);
      if (instance.kind === 'shrub' && instance.featureId === WOODS_ID) {
        expect(instance.edgeDistanceM).toBeGreaterThanOrEqual(FOREST_EDGE_V2_OPTIONS.understoryInnerM);
        expect(instance.edgeDistanceM).toBeLessThanOrEqual(FOREST_EDGE_V2_OPTIONS.understoryOuterM);
      }
    }
    for (const sample of result.understory) expect(sample.edgeDistanceM).toBeLessThanOrEqual(FOREST_EDGE_V2_OPTIONS.interiorInsetM);
  });

  it('caps the hero pool and only ever flags reviewed edge crowns with a §61 branch count', () => {
    const heroes = result.instances.filter(i => i.hero);
    expect(heroes.length).toBeGreaterThan(0);
    expect(heroes.length).toBeLessThanOrEqual(FOREST_EDGE_V2_OPTIONS.budgets.hero);
    expect(result.budget.hero.used).toBe(heroes.length);
    for (const hero of heroes) {
      expect(hero.basis).toBe('reviewed_feature');
      expect(hero.edgeDistanceM).toBeLessThan(FOREST_EDGE_V2_OPTIONS.heroZoneM);
      expect(hero.branchCount).toBeGreaterThanOrEqual(FOREST_EDGE_V2_OPTIONS.branchCountRange[0]);
      expect(hero.branchCount).toBeLessThanOrEqual(FOREST_EDGE_V2_OPTIONS.branchCountRange[1]);
    }
    // A belt crown is never a hero candidate (context zones aren't "the golfer's own reviewed hole").
    expect(result.instances.filter(i => i.featureId === BELT_ID && i.hero)).toHaveLength(0);
  });

  it('is densest at the edge and never increases inward (§65), as a rule and in the compiled result', () => {
    const edgeMs = Array.from({ length: 25 }, (_, i) => i * 2);
    const densities = edgeMs.map(edgeM => forestCrownDensity(edgeM));
    for (let i = 1; i < densities.length; i++) expect(densities[i]!).toBeLessThanOrEqual(densities[i - 1]! + 1e-9);
    expect(densities[0]).toBeCloseTo(1, 5);
    expect(densities.at(-1)).toBeCloseTo(FOREST_EDGE_V2_OPTIONS.interiorCrownFloor, 5);

    const crowns = result.instances.filter(i => i.featureId === WOODS_ID && i.kind === 'crown');
    const near = crowns.filter(i => i.edgeDistanceM < FOREST_EDGE_V2_OPTIONS.edgeBandM / 2).length;
    const far = crowns.filter(i => i.edgeDistanceM >= FOREST_EDGE_V2_OPTIONS.edgeBandM).length;
    expect(near).toBeGreaterThan(far);
  });

  it('is deterministic: two compiles of the same scene and mesh agree exactly', () => {
    const again = compileForestEdgeV2(scene, mesh);
    expect(again).toEqual(result);
  });

  it('rejects a result with an instance moved outside its feature', () => {
    const moved: ForestEdgeV2Result = { ...result, instances: result.instances.map((instance, i) => i === 0 ? { ...instance, x: instance.x + 10_000 } : instance) };
    expect(() => assertForestEdgeV2(moved, scene)).toThrow(/outside its woods feature or context band/);
  });

  it('rejects a hero count above its own recorded cap', () => {
    const overCapped: ForestEdgeV2Result = { ...result, budget: { ...result.budget, hero: { ...result.budget.hero, cap: result.budget.hero.used - 1 } } };
    expect(() => assertForestEdgeV2(overCapped, scene)).toThrow(/exceed the/);
  });
});

describe("Peek'n Peak hole 7 (real fixture, own + neighbouring reviewed canopy)", () => {
  it('compiles from the canonical package and context layer, gates pass', () => {
    const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
    const context = parseContextLayer(JSON.parse(readFileSync(new URL('peek-n-peak-upper-context.json', fixtures), 'utf8')), pkg);
    const hole7 = parseTerrainMesh(JSON.parse(gunzipSync(readFileSync(new URL('compiled-peek-n-peak-upper/peek-n-peak-upper-07-terrain.json.gz', fixtures))).toString('utf8')), pkg);
    const scene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], hole7, context);

    const result = compileForestEdgeV2(scene, hole7);
    expect(() => assertForestEdgeV2(result, scene)).not.toThrow();
    expect(result.instances.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);
    expect(result.instances.length).toBeLessThanOrEqual(result.budget.instances.target);
    expect(result.budget.hero.used).toBeLessThanOrEqual(result.budget.hero.cap);

    const again = compileForestEdgeV2(scene, hole7);
    expect(again).toEqual(result);

    const bytes = Buffer.byteLength(JSON.stringify(result));
    const byKind: Record<ForestInstance['kind'], number> = { crown: 0, shrub: 0, mass: 0 };
    for (const instance of result.instances) byKind[instance.kind]++;
    console.log(`hole7 forest-edge-v2: instances=${result.instances.length} (crown=${byKind.crown}, shrub=${byKind.shrub}, mass=${byKind.mass}), ` +
      `hero=${result.budget.hero.used}/${result.budget.hero.cap}, edges=${result.edges.length}, understory=${result.understory.length}, bytes=${bytes}`);
  });
});
