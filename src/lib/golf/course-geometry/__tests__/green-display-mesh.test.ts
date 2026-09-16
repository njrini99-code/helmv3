import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { weldAndCleanTerrainMesh } from '../display-mesh-v2';
import { assertHeroPatch, compileGreenComplexPatches, compileRegionPatch, GREEN_PATCH_SPACING } from '../green-display-mesh';
import { compileHeroRegions, type HeroRegion } from '../hero-patches';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import { sampleMetricTerrain, type MetricTerrainGrid } from '../terrain-source';
import type { HoleScene, LocalFeature, PointM } from '../types';

const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);
const circle = (cx: number, cy: number, r: number, n = 48): PointM[] => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n), cy + r * Math.sin(2 * Math.PI * i / n)] as PointM);
const feature = (id: string, kind: LocalFeature['kind'], ring: PointM[]): LocalFeature => ({ id, kind, type: 'Polygon', parts: [[ring]], reviewed: true });
const inRing = ([x, y]: PointM, ring: PointM[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** An 80 m square at 2 m cells with a green at (40, 40) r 8 and a greenside
 * bunker. The terrain is a plane plus a 0.2 m ripple of 8 m period: the mesh
 * vertices sample it every 2 m, the 1 m metric grid every metre, so the grid
 * carries relief the canonical triangles cut through. */
const GREEN = circle(40, 40, 8), BUNKER = circle(52, 40, 3), SIZE_M = 80;
const RIPPLE_M = .2;
const terrain = (x: number, y: number) => 0.02 * x + 0.01 * y + RIPPLE_M * Math.sin(x * Math.PI / 4) * Math.sin(y * Math.PI / 4);
function syntheticWorld(): { mesh: TerrainMesh; scene: HoleScene } {
  const cells = SIZE_M / 2, vertices: number[] = [], triangleFeatures: number[] = [], triangleMaterials: number[] = [];
  const featureIds = ['green-1', 'bunker-1', 'ground'], featureKinds = ['green', 'bunker', 'ground'], rings = [GREEN, BUNKER];
  const push = (a: PointM, b: PointM, c: PointM) => {
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
    const index = rings.findIndex(ring => inRing([cx, cy], ring));
    for (const [x, y] of [a, b, c]) vertices.push(x, y, terrain(x, y));
    triangleFeatures.push(index < 0 ? 2 : index); triangleMaterials.push(0);
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
    hole: { key: 'h', ordinal: 1, par: 3, scorecardYards: 150, featureIds: ['green-1', 'bunker-1'], routeFeatureId: null, greenFeatureId: 'green-1', nominalTargetWgs84: null, completeness: 'reviewed_surfaces', gaps: [] },
    features: [feature('green-1', 'green', GREEN), feature('bunker-1', 'bunker', BUNKER)],
    contextFeatures: [], contextZones: [], events: [], orientationRadians: 0, attribution: '',
  } as unknown as HoleScene;
  return { mesh, scene };
}
const segmentDistance = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
};

describe('green-complex hero mesh (§27–29, §107, §113, §115; Task 7)', () => {
  const { mesh, scene } = syntheticWorld();
  const base = weldAndCleanTerrainMesh(mesh);
  const plan = compileHeroRegions(scene, mesh, base);
  const region = plan.regions.find(r => r.kind === 'green_complex')!;
  const compiled = compileRegionPatch(mesh, base, region);
  const { patch, report } = compiled;
  const p = base.positions, q = patch.positions;
  const rimDistance = (x: number, y: number) => {
    let best = Infinity;
    for (const loop of region.rimLoops) for (let i = 0; i < loop.length - 1; i++) best = Math.min(best, segmentDistance(x, y, p[loop[i]! * 3]!, p[loop[i]! * 3 + 1]!, p[loop[i + 1]! * 3]!, p[loop[i + 1]! * 3 + 1]!));
    return best;
  };

  it('passes the patch gates: manifold, unflipped, budgeted, rim exact and unsplit', () => {
    expect(() => assertHeroPatch(compiled, base, region)).not.toThrow();
    expect(patch.basis).toBe('interpolated_canonical');
    expect(patch.kind).toBe('green_complex');
    expect(report.topology.pass).toBe(true);
    expect(report.borderEdges).toBe(region.rimEdges);
    expect(report.rimVertices).toBe(region.rimEdges);
    expect(report.seamHeightMaxM).toBe(0);
    expect(patch.edgeErrorMaxM).toBe(0);
    expect(report.triangles).toBeLessThanOrEqual(region.budgetTriangles);
    expect(report.triangles).toBeGreaterThan(region.triangles.length * 2);
    expect(patch.visualOffsetMm.every(v => v === 0)).toBe(true);
  });

  it('keeps every canonical vertex of the region at its exact canonical position', () => {
    const patchKeys = new Set<string>();
    for (let v = 0; v < patch.positions.length / 3; v++) patchKeys.add([q[v * 3], q[v * 3 + 1], q[v * 3 + 2]].join(','));
    const baseVertices = new Set<number>();
    for (const t of region.triangles) for (let k = 0; k < 3; k++) baseVertices.add(base.indices[t * 3 + k]!);
    for (const v of baseVertices) expect(patchKeys.has([Math.fround(p[v * 3]!), Math.fround(p[v * 3 + 1]!), Math.fround(p[v * 3 + 2]!)].join(','))).toBe(true);
    expect(patch.positions.length / 3).toBeGreaterThan(baseVertices.size);
  });

  it('follows the grid relief between canonical vertices and fades it out toward the rim', () => {
    let interiorRelief = 0, rimRelief = 0, checked = 0;
    for (let v = 0; v < patch.positions.length / 3; v++) {
      const x = q[v * 3]!, y = q[v * 3 + 1]!, dz = q[v * 3 + 2]! - patch.canonicalHeightReference[v]!;
      const d = rimDistance(x, y);
      if (d > GREEN_PATCH_SPACING.rimTaperM) {
        interiorRelief = Math.max(interiorRelief, Math.abs(dz));
        // Canonical vertices equal the grid here, so the interpolated height is the grid sample itself (float32).
        if (Math.abs(dz) > 1e-3) { checked++; expect(Math.abs(q[v * 3 + 2]! - sampleMetricTerrain(mesh.metricGrid!, [x, y])!)).toBeLessThan(1e-3); }
      } else if (d < 1) rimRelief = Math.max(rimRelief, Math.abs(dz));
    }
    expect(checked).toBeGreaterThan(100);
    expect(interiorRelief).toBeGreaterThan(RIPPLE_M * 0.3);
    expect(interiorRelief).toBeLessThanOrEqual(2 * RIPPLE_M + 1e-6);
    expect(rimRelief).toBeLessThan(interiorRelief * 0.15);
    expect(report.maxReliefM).toBeCloseTo(interiorRelief, 3);
  });

  it('samples the green outline and interior finer than the outer rough', () => {
    const lengths = { green: [] as number[], rough: [] as number[] };
    for (let t = 0; t < patch.indices.length / 3; t++) {
      const [a, b, c] = [patch.indices[t * 3]!, patch.indices[t * 3 + 1]!, patch.indices[t * 3 + 2]!];
      const cx = (q[a * 3]! + q[b * 3]! + q[c * 3]!) / 3, cy = (q[a * 3 + 1]! + q[b * 3 + 1]! + q[c * 3 + 1]!) / 3;
      const longest = Math.max(Math.hypot(q[a * 3]! - q[b * 3]!, q[a * 3 + 1]! - q[b * 3 + 1]!), Math.hypot(q[b * 3]! - q[c * 3]!, q[b * 3 + 1]! - q[c * 3 + 1]!), Math.hypot(q[c * 3]! - q[a * 3]!, q[c * 3 + 1]! - q[a * 3 + 1]!));
      const r = Math.hypot(cx - 40, cy - 40);
      if (r < 7) lengths.green.push(longest); else if (r > 24 && rimDistance(cx, cy) > 3) lengths.rough.push(longest);
    }
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    expect(lengths.green.length).toBeGreaterThan(200);
    expect(mean(lengths.green)).toBeLessThan(mean(lengths.rough) * 0.75);
    expect(report.greenSpacingM).toBeLessThanOrEqual(1.2);
  });

  it('scales spacing to a smaller budget, coarsening the rough before the green, and stays deterministic', () => {
    const tight: HeroRegion = { ...region, budgetTriangles: Math.floor(report.triangles * 0.6) };
    const smaller = compileRegionPatch(mesh, base, tight);
    expect(() => assertHeroPatch(smaller, base, tight)).not.toThrow();
    expect(smaller.report.triangles).toBeLessThanOrEqual(tight.budgetTriangles);
    expect(smaller.report.spacingScale).toBeGreaterThan(report.spacingScale);
    expect(smaller.report.greenSpacingM / report.greenSpacingM).toBeLessThan(smaller.report.spacingScale / report.spacingScale);
    const again = compileRegionPatch(mesh, base, region);
    expect(Array.from(again.patch.positions)).toEqual(Array.from(patch.positions));
    expect(Array.from(again.patch.indices)).toEqual(Array.from(patch.indices));
  });

  it('rejects a seam step, a T-junction and a basis without a source', () => {
    const seam = { ...compiled, report: { ...report, seamHeightMaxM: 0.01 } };
    expect(() => assertHeroPatch(seam, base, region)).toThrow(/seam/);
    const holed = { ...compiled, patch: { ...patch, indices: patch.indices.slice(3) }, report: { ...report, borderEdges: report.borderEdges + 3 } };
    expect(() => assertHeroPatch(holed, base, region)).toThrow(/border edges/);
    const unsourced = { ...compiled, patch: { ...patch, basis: 'higher_resolution_source' as const } };
    expect(() => assertHeroPatch(unsourced, base, region)).toThrow(/source/);
  });

  it('compiles the hole 7 green complex inside its budget with the rim shared exactly', () => {
    const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
    const manifest = JSON.parse(readFileSync(new URL('compiled-peek-n-peak-upper/asset-manifest.json', fixtures), 'utf8')) as { holes: Record<string, { fileName: string }> };
    const fileName = manifest.holes['peek-n-peak-upper-07']!.fileName;
    const raw = readFileSync(new URL(`compiled-peek-n-peak-upper/${fileName}`, fixtures));
    const hole = parseTerrainMesh(JSON.parse((fileName.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
    const holeScene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], hole);
    const holeBase = weldAndCleanTerrainMesh(hole);
    const holePlan = compileHeroRegions(holeScene, hole, holeBase);
    const patches = compileGreenComplexPatches(hole, holeBase, holePlan.regions);
    expect(patches.length).toBe(1);
    const [green] = patches;
    const greenRegion = holePlan.regions.find(r => r.id === green!.patch.id)!;
    expect(() => assertHeroPatch(green!, holeBase, greenRegion)).not.toThrow();
    expect(green!.report.triangles).toBeLessThanOrEqual(greenRegion.budgetTriangles);
    expect(green!.report.triangles).toBeGreaterThan(greenRegion.budgetTriangles * 0.8);
    expect(green!.report.seamHeightMaxM).toBe(0);
    expect(green!.report.needles).toBeLessThan(green!.report.baseSlivers * 2);
    expect(green!.report.greenSpacingM).toBeLessThan(1.5);
  });
});
