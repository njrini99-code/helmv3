import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  assertBaseDisplayLods, buildEdgeTable, cleanDisplayMesh, compileBaseDisplayLod0, compileBaseDisplayLods, DISPLAY_LOD_BUDGETS, DISPLAY_LOD_OPTIONS, hausdorffDistance, HAUSDORFF_TOLERANCES_M,
  packDisplayMesh, refineDisplayMesh, refinementImportance, selectRedTriangles, simplifyDisplayMesh, weldAndCleanTerrainMesh, weldTerrainMesh, type DisplayMesh,
} from '../display-mesh-v2';
import { compileCurvatureFields } from '../terrain-curvature';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import type { MetricTerrainGrid } from '../terrain-source';
import { SURFACE_CLASS_IDS } from '../visual-artifact';

const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);
const height = (x: number, y: number) => 0.05 * x + 0.3 * Math.sin(y / 3) + 0.02 * Math.sin(x * 1.7);

/** A 20 m square at 2 m cells: fairway on the left half, ground on the right, one metric grid at 1 m. */
function syntheticMesh(cells = 10, cellM = 2): TerrainMesh {
  const vertices: number[] = [], triangleFeatures: number[] = [], triangleMaterials: number[] = [];
  const corner = (x: number, y: number) => vertices.push(x, y, height(x, y));
  for (let row = 0; row < cells; row++) for (let column = 0; column < cells; column++) {
    const x0 = column * cellM, y0 = row * cellM, x1 = x0 + cellM, y1 = y0 + cellM;
    const feature = column < cells / 2 ? 0 : 1;
    corner(x0, y0); corner(x1, y0); corner(x1, y1); triangleFeatures.push(feature); triangleMaterials.push(0);
    corner(x0, y0); corner(x1, y1); corner(x0, y1); triangleFeatures.push(feature); triangleMaterials.push(0);
  }
  const size = cells * cellM + 1, heightsM: number[] = [];
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) heightsM.push(height(column, row));
  const metricGrid: MetricTerrainGrid = { originM: [0, 0], spacingM: 1, columns: size, rows: size, heightsM };
  return {
    vertices, triangleFeatures, triangleMaterials, featureIds: ['fairway-1', 'terrain-context'], featureKinds: ['fairway', 'ground'], metricGrid, contextFeatureIds: [],
  } as unknown as TerrainMesh;
}

const area = (p: ArrayLike<number>, a: number, b: number, c: number) =>
  0.5 * ((p[b * 3]! - p[a * 3]!) * (p[c * 3 + 1]! - p[a * 3 + 1]!) - (p[c * 3]! - p[a * 3]!) * (p[b * 3 + 1]! - p[a * 3 + 1]!));
function totalArea(mesh: { positions: ArrayLike<number>; indices: ArrayLike<number>; triangleCount: number }): number {
  let sum = 0;
  for (let t = 0; t < mesh.triangleCount; t++) sum += Math.abs(area(mesh.positions, mesh.indices[t * 3]!, mesh.indices[t * 3 + 1]!, mesh.indices[t * 3 + 2]!));
  return sum;
}
/** Every edge is shared by one (border) or two triangles and no vertex sits strictly inside another edge. */
function expectWatertight(mesh: { positions: ArrayLike<number>; indices: ArrayLike<number>; triangleCount: number; vertexCount: number }): void {
  const edges = new Map<string, number>();
  for (let t = 0; t < mesh.triangleCount; t++) for (let k = 0; k < 3; k++) {
    const a = mesh.indices[t * 3 + k]!, b = mesh.indices[t * 3 + ((k + 1) % 3)]!, key = a < b ? `${a},${b}` : `${b},${a}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  for (const count of edges.values()) expect(count).toBeLessThanOrEqual(2);
  const p = mesh.positions;
  for (const key of edges.keys()) {
    const [a, b] = key.split(',').map(Number) as [number, number];
    const ax = p[a * 3]!, ay = p[a * 3 + 1]!, bx = p[b * 3]!, by = p[b * 3 + 1]!, length = Math.hypot(bx - ax, by - ay);
    for (let v = 0; v < mesh.vertexCount; v++) {
      if (v === a || v === b) continue;
      const x = p[v * 3]!, y = p[v * 3 + 1]!;
      const t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (length * length);
      if (t <= 1e-9 || t >= 1 - 1e-9) continue;
      const off = Math.abs((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / length;
      expect(off, `vertex ${v} splits edge ${key}`).toBeGreaterThan(1e-9);
    }
  }
}

describe('base display LOD compiler (§10, §13–15, §113)', () => {
  const mesh = syntheticMesh();

  it('welds exact positions into an indexed mesh and locks semantic boundaries and the border', () => {
    const welded = weldTerrainMesh(mesh);
    expect(welded.triangleCount).toBe(200);
    expect(welded.vertexCount).toBe(121);
    const table = buildEdgeTable(mesh, welded);
    let locked = 0;
    for (let v = 0; v < welded.vertexCount; v++) {
      const x = welded.positions[v * 3]!, y = welded.positions[v * 3 + 1]!;
      const onBorder = x === 0 || y === 0 || x === 20 || y === 20, onBoundary = x === 10;
      expect(table.locked[v], `vertex at ${x},${y}`).toBe(onBorder || onBoundary ? 1 : 0);
      locked += table.locked[v]!;
    }
    expect(locked).toBe(40 + 9);
    // The fairway/ground seam is a fairway-class boundary; the outside is border.
    const classes = new Set(table.boundaryClass.values());
    expect(classes).toEqual(new Set(['fairway', 'border']));
  });

  it('refines one red–green level without T-junctions, sampling midpoint heights from the source grid', () => {
    const welded = weldTerrainMesh(mesh);
    const red = new Uint8Array(welded.triangleCount);
    red[0] = 1; red[57] = 1; red[130] = 1;
    const { mesh: refined, refined: touched } = refineDisplayMesh(mesh, welded, red);
    expect(touched).toBeGreaterThanOrEqual(3);
    // Each red triangle adds 3 and each closing neighbour adds 1 or 2.
    expect(refined.triangleCount).toBeGreaterThan(welded.triangleCount + 9);
    expect(refined.triangleCount).toBeLessThanOrEqual(welded.triangleCount + 9 + 9 * 2);
    expectWatertight(refined);
    expect(totalArea(refined)).toBeCloseTo(400, 6);
    // Orientation is inherited, so no child flips.
    for (let t = 0; t < refined.triangleCount; t++) {
      expect(Math.sign(area(refined.positions, refined.indices[t * 3]!, refined.indices[t * 3 + 1]!, refined.indices[t * 3 + 2]!))).toBe(refined.orientation[t]);
    }
    // A midpoint on a curved edge takes the grid's deviation from linearity, not the linear midpoint.
    const grid = mesh.metricGrid!;
    let curved = 0;
    for (let v = welded.vertexCount; v < refined.vertexCount; v++) {
      const x = refined.positions[v * 3]!, y = refined.positions[v * 3 + 1]!, z = refined.positions[v * 3 + 2]!;
      const source = grid.heightsM[Math.round(y) * grid.columns + Math.round(x)]!;
      // Midpoints of 2 m edges sit on integer grid nodes, where the source is exact.
      if (Number.isInteger(x) && Number.isInteger(y)) { expect(Math.abs(z - source)).toBeLessThan(0.02); curved++; }
    }
    expect(curved).toBeGreaterThan(0);
  });

  it('ranks refinement by height error, normal error, curvature, boundary and surface, and bisects to a budget', () => {
    const welded = weldTerrainMesh(mesh);
    const table = buildEdgeTable(mesh, welded);
    const importance = refinementImportance(mesh, welded, table, DISPLAY_LOD_OPTIONS);
    expect(importance.length).toBe(welded.triangleCount);
    for (const value of importance) expect(Number.isFinite(value) && value > 0).toBe(true);
    // Fairway triangles on the seam outrank interior ground triangles.
    const seam = importance[9 * 2]!, interior = importance[(5 * 10 + 7) * 2]!;
    expect(seam).toBeGreaterThan(interior);
    const red = selectRedTriangles(welded, importance, 320);
    const { mesh: refined } = refineDisplayMesh(mesh, welded, red);
    expect(refined.triangleCount).toBeLessThanOrEqual(320);
    expect(refined.triangleCount).toBeGreaterThan(280);
    // Never refined below the minimum edge: a tiny-triangle mesh gets 0 importance.
    const tiny = syntheticMesh(10, 0.5);
    const tinyWelded = weldTerrainMesh(tiny);
    const tinyImportance = refinementImportance(tiny, tinyWelded, buildEdgeTable(tiny, tinyWelded), DISPLAY_LOD_OPTIONS);
    expect(Array.from(tinyImportance).every(v => v === 0)).toBe(true);
  });

  it('picks the same red prefix as a recount of the whole mesh at every budget', () => {
    // The incremental sweep replaced a binary search that recounted the
    // split mesh at each step; the prefix it settles on must be the one
    // that recount would choose — the largest whose count fits the target.
    const welded = weldTerrainMesh(mesh);
    const importance = refinementImportance(mesh, welded, buildEdgeTable(mesh, welded), DISPLAY_LOD_OPTIONS);
    const order = Array.from(importance.keys()).filter(t => importance[t]! > 0).sort((a, b) => importance[b]! - importance[a]! || a - b);
    const key = (a: number, b: number) => (a < b ? a * 1e6 + b : b * 1e6 + a);
    const countAfter = (n: number): number => {
      const split = new Set<number>();
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) split.add(key(welded.indices[order[i]! * 3 + k]!, welded.indices[order[i]! * 3 + ((k + 1) % 3)]!));
      let total = 0;
      for (let t = 0; t < welded.triangleCount; t++) {
        let splits = 0;
        for (let k = 0; k < 3; k++) if (split.has(key(welded.indices[t * 3 + k]!, welded.indices[t * 3 + ((k + 1) % 3)]!))) splits++;
        total += splits === 0 ? 1 : splits === 1 ? 2 : splits === 2 ? 3 : 4;
      }
      return total;
    };
    const prefixes = new Set<number>();
    for (const target of [0, 199, 200, 201, 250, 280, 320, 400, 640, 799, 800, 5000]) {
      let expected = 0;
      for (let n = 0; n <= order.length; n++) if (countAfter(n) <= target) expected = n;
      prefixes.add(expected);
      const red = selectRedTriangles(welded, importance, target);
      expect(Array.from(red).filter(v => v === 1).length).toBe(expected);
      for (let i = 0; i < expected; i++) expect(red[order[i]!]).toBe(1);
    }
    // The budgets span nothing refined to everything refined.
    expect(prefixes.has(0) && prefixes.has(order.length) && prefixes.size >= 5).toBe(true);
  });

  it('compiles LOD0 the same from a caller\'s welded mesh and curvature fields as from its own', () => {
    // The runtime welds once and compiles the curvature fields once for the
    // hero plan, the patches, the base mesh and the atlases; handing them in
    // must change nothing about the packed LOD0.
    const own = compileBaseDisplayLod0(mesh);
    const welded = weldAndCleanTerrainMesh(mesh), curvature = compileCurvatureFields(mesh.metricGrid!);
    const shared = compileBaseDisplayLod0(mesh, { welded, curvature });
    expect(shared).toEqual(own);
    // The caller's mesh is read, never written: the region ids the compile
    // assigns for a hero plan stay in its own copy.
    expect(welded.triangleRegion).toBeUndefined();
    const plan = { triangleRegion: new Uint16Array(welded.triangleCount), regionIds: [] as string[] };
    expect(compileBaseDisplayLod0(mesh, { heroPlan: plan, welded })).toEqual(compileBaseDisplayLod0(mesh, { heroPlan: plan }));
    expect(welded.triangleRegion).toBeUndefined();
  });

  it('simplifies by boundary-locked collapse within the height tolerance', () => {
    const welded = weldTerrainMesh(mesh);
    const table = buildEdgeTable(mesh, welded);
    const { mesh: simplified, collapsed, maxHeightErrorM } = simplifyDisplayMesh(welded, table.locked, 120, 0.15);
    expect(collapsed).toBeGreaterThan(0);
    expect(simplified.triangleCount).toBeLessThanOrEqual(welded.triangleCount);
    expect(simplified.triangleCount).toBeLessThan(160);
    expect(maxHeightErrorM).toBeLessThanOrEqual(0.15);
    expectWatertight(simplified);
    expect(totalArea(simplified)).toBeCloseTo(400, 6);
    // Every locked vertex survives at its exact position.
    const survivors = new Set<string>();
    for (let v = 0; v < simplified.vertexCount; v++) survivors.add(`${simplified.positions[v * 3]},${simplified.positions[v * 3 + 1]}`);
    for (let v = 0; v < welded.vertexCount; v++) if (table.locked[v]) expect(survivors.has(`${welded.positions[v * 3]},${welded.positions[v * 3 + 1]}`)).toBe(true);
    // A zero tolerance collapses nothing on curved ground.
    expect(simplifyDisplayMesh(welded, table.locked, 120, 0).collapsed).toBe(0);
  });

  it('cleans noding slivers and needles without opening the mesh', () => {
    const welded = weldTerrainMesh(mesh);
    // Split the shared edge 1→2 of triangle 0 (and its neighbour) 1 mm from vertex 1: two sliver triangles.
    const a = welded.indices[1]!, b = welded.indices[2]!, c = welded.indices[0]!, p = welded.positions;
    const neighbour = Array.from({ length: welded.triangleCount }, (_, t) => t).find(t => t !== 0 && [0, 1, 2].filter(k => welded.indices[t * 3 + k] === a || welded.indices[t * 3 + k] === b).length === 2);
    expect(neighbour).toBeDefined();
    const positions = Array.from(p), m = welded.vertexCount;
    positions.push(p[a * 3]! + (p[b * 3]! - p[a * 3]!) * 0.0005, p[a * 3 + 1]! + (p[b * 3 + 1]! - p[a * 3 + 1]!) * 0.0005, p[a * 3 + 2]! + (p[b * 3 + 2]! - p[a * 3 + 2]!) * 0.0005);
    const indices = Array.from(welded.indices), features = Array.from(welded.triangleFeatures), materials = Array.from(welded.triangleMaterials), orientation = Array.from(welded.orientation);
    indices.splice(0, 3, c, a, m); indices.push(c, m, b); features.push(features[0]!); materials.push(0); orientation.push(orientation[0]!);
    const n = neighbour!, nc = [indices[n * 3]!, indices[n * 3 + 1]!, indices[n * 3 + 2]!], d = nc.find(v => v !== a && v !== b)!;
    const ai = nc.indexOf(a);
    // Keep the neighbour's winding: replace a by m in one copy and b by m in the other.
    const first = nc.map(v => (v === b ? m : v)), second = nc.map(v => (v === a ? m : v));
    indices.splice(n * 3, 3, ...first); indices.push(...second); features.push(features[n]!); materials.push(0); orientation.push(orientation[n]!);
    expect(ai).toBeGreaterThanOrEqual(0); expect(d).toBeDefined();
    const dirty: DisplayMesh = {
      positions: Float64Array.from(positions), indices: Uint32Array.from(indices), triangleFeatures: Uint16Array.from(features), triangleMaterials: Uint8Array.from(materials),
      orientation: Int8Array.from(orientation), vertexCount: m + 1, triangleCount: indices.length / 3,
    };
    expectWatertight(dirty);
    const cleaned = cleanDisplayMesh(dirty, 0.02);
    expect(cleaned.collapsedEdges).toBe(1);
    expect(cleaned.droppedTriangles).toBe(2);
    expect(cleaned.mesh.triangleCount).toBe(welded.triangleCount);
    expect(cleaned.mesh.vertexCount).toBe(welded.vertexCount);
    expectWatertight(cleaned.mesh);
    expect(totalArea(cleaned.mesh)).toBeCloseTo(400, 6);

    // A needle: apex 0.2 mm off the long edge, neighbour across it gets split.
    const needlePositions = Array.from(p), q = welded.vertexCount;
    const mx = (p[a * 3]! + p[b * 3]!) / 2, my = (p[a * 3 + 1]! + p[b * 3 + 1]!) / 2, mz = (p[a * 3 + 2]! + p[b * 3 + 2]!) / 2;
    const cx = p[c * 3]! - mx, cy = p[c * 3 + 1]! - my, cl = Math.hypot(cx, cy);
    needlePositions.push(mx + (cx / cl) * 0.0002, my + (cy / cl) * 0.0002, mz);
    const needleIndices = Array.from(welded.indices);
    needleIndices.splice(0, 3, c, a, q); needleIndices.push(a, b, q, b, c, q);
    const needle: DisplayMesh = {
      positions: Float64Array.from(needlePositions), indices: Uint32Array.from(needleIndices),
      triangleFeatures: Uint16Array.from([...welded.triangleFeatures, welded.triangleFeatures[0]!, welded.triangleFeatures[0]!]),
      triangleMaterials: Uint8Array.from([...welded.triangleMaterials, 0, 0]), orientation: Int8Array.from([...welded.orientation, welded.orientation[0]!, welded.orientation[0]!]),
      vertexCount: q + 1, triangleCount: needleIndices.length / 3,
    };
    expectWatertight(needle);
    const fixed = cleanDisplayMesh(needle, 0.02);
    expect(fixed.needles).toBe(1);
    expect(fixed.collapsedEdges).toBe(0);
    expectWatertight(fixed.mesh);
    expect(totalArea(fixed.mesh)).toBeCloseTo(400, 6);
    for (let t = 0; t < fixed.mesh.triangleCount; t++) {
      const i = fixed.mesh.indices, pp = fixed.mesh.positions, ta = i[t * 3]!, tb = i[t * 3 + 1]!, tc = i[t * 3 + 2]!;
      const longest = Math.max(Math.hypot(pp[tb * 3]! - pp[ta * 3]!, pp[tb * 3 + 1]! - pp[ta * 3 + 1]!), Math.hypot(pp[tc * 3]! - pp[tb * 3]!, pp[tc * 3 + 1]! - pp[tb * 3 + 1]!), Math.hypot(pp[ta * 3]! - pp[tc * 3]!, pp[ta * 3 + 1]! - pp[tc * 3 + 1]!));
      expect(2 * Math.abs(area(pp, ta, tb, tc)) / longest).toBeGreaterThan(0.001);
    }
  });

  it('measures the symmetric Hausdorff distance between boundary segment sets', () => {
    const square = [0, 0, 10, 0, 10, 0, 10, 10, 10, 10, 0, 10, 0, 10, 0, 0];
    expect(hausdorffDistance(square, square)).toBe(0);
    const shifted = square.map((v, i) => (i % 2 === 0 ? v + 0.1 : v));
    expect(hausdorffDistance(square, shifted)).toBeCloseTo(0.1, 6);
    // A missing side is charged at its distance to the rest.
    expect(hausdorffDistance(square, square.slice(0, 12))).toBeCloseTo(5, 6);
    expect(hausdorffDistance([], [])).toBe(0);
    expect(hausdorffDistance(square, [])).toBe(Number.POSITIVE_INFINITY);
  });

  it('packs float32 buffers with the highest-priority surface class per vertex', () => {
    const welded = weldTerrainMesh(mesh);
    const packed = packDisplayMesh(mesh, welded);
    expect(packed.basis).toBe('interpolated_canonical');
    expect(packed.positions).toBeInstanceOf(Float32Array);
    expect(packed.indices).toBeInstanceOf(Uint32Array);
    expect(packed.triangleFeatures.length).toBe(welded.triangleCount);
    expect(packed.surfaceClass.length).toBe(welded.vertexCount);
    for (let v = 0; v < packed.vertexCount; v++) {
      const x = packed.positions[v * 3]!;
      expect(SURFACE_CLASS_IDS[packed.surfaceClass[v]!]).toBe(x <= 10 ? 'fairway' : 'ground');
    }
  });

  it('compiles three LODs that pass the topology and Hausdorff gates deterministically', () => {
    const result = compileBaseDisplayLods(mesh, { lod0Target: 500, lod2Target: 120 });
    expect(() => assertBaseDisplayLods(result)).not.toThrow();
    expect(result.report.pass).toBe(true);
    expect(result.lod1.triangleCount).toBe(200);
    expect(result.lod0.triangleCount).toBeGreaterThan(400);
    expect(result.lod0.triangleCount).toBeLessThanOrEqual(500);
    expect(result.lod2.triangleCount).toBeLessThan(160);
    expect(result.report.lods.lod0.refined).toBeGreaterThan(0);
    expect(result.report.lods.lod2.collapsed).toBeGreaterThan(0);
    expect(result.report.weld).toMatchObject({ corners: 600, vertices: 121, sliverEdges: 0, needles: 0, sliverTriangles: 0 });
    for (const h of result.report.hausdorff) { expect(h.pass).toBe(true); expect(Math.max(h.distancesM.lod0, h.distancesM.lod1, h.distancesM.lod2)).toBeLessThan(1e-4); }
    for (const t of result.report.topology) expect(t).toMatchObject({ degenerate: 0, flipped: 0, nonFiniteNormals: 0, nonManifoldEdges: 0, pass: true });
    const again = compileBaseDisplayLods(mesh, { lod0Target: 500, lod2Target: 120 });
    expect(again.lod0.positions).toEqual(result.lod0.positions);
    expect(again.lod0.indices).toEqual(result.lod0.indices);
    expect(again.lod2.indices).toEqual(result.lod2.indices);
    // Gates fail loudly on a corrupted result.
    const broken = { ...result, lod2: { ...result.lod2, indices: Uint32Array.from(result.lod2.indices).fill(result.lod2.vertexCount, 0, 1) } };
    expect(() => assertBaseDisplayLods(broken)).toThrow(/index out of range/);
  });

  it("compiles Peek'n Peak hole 7 within the §10 budgets with sub-tolerance boundaries", () => {
    const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
    const raw = gunzipSync(readFileSync(new URL('compiled-peek-n-peak-upper/peek-n-peak-upper-07-terrain.json.gz', fixtures)));
    const hole7 = parseTerrainMesh(JSON.parse(raw.toString('utf8')), pkg);
    const result = compileBaseDisplayLods(hole7);
    assertBaseDisplayLods(result);
    const { lods, weld, hausdorff, topology } = result.report;
    expect(lods.lod0.withinBudget && lods.lod1.withinBudget && lods.lod2.withinBudget).toBe(true);
    expect(lods.lod0.triangles).toBeGreaterThanOrEqual(DISPLAY_LOD_BUDGETS.lod0[0]);
    expect(lods.lod2.triangles).toBeLessThanOrEqual(DISPLAY_LOD_BUDGETS.lod2[1]);
    expect(lods.lod1.triangles).toBeGreaterThan(hole7.triangleFeatures.length * 0.95);
    expect(lods.lod2.maxHeightErrorM).toBeLessThanOrEqual(DISPLAY_LOD_OPTIONS.collapseToleranceM);
    expect(weld.vertices).toBe(13684);
    expect(weld.sliverTriangles).toBeGreaterThan(0);
    expect(weld.gridResidualRmsM).toBeLessThan(0.05);
    const classes = hausdorff.map(h => h.class);
    expect(classes).toEqual(expect.arrayContaining(['green', 'bunker', 'fringe', 'fairway', 'tee', 'water', 'border']));
    for (const h of hausdorff) {
      expect(h.toleranceM).toBe(HAUSDORFF_TOLERANCES_M[h.class] ?? HAUSDORFF_TOLERANCES_M.other);
      // Boundaries move only by sliver cleaning: vertices by under the weld
      // tolerance, and a collar strip narrower than it can vanish (hole 7's
      // fringe has one 1 cm sliver), charged at its segment length.
      expect(Math.max(h.distancesM.lod0, h.distancesM.lod1, h.distancesM.lod2)).toBeLessThan(0.1);
    }
    for (const t of topology) expect(t.pass).toBe(true);
    // Surface classes cover the hole's kinds.
    const seen = new Set(Array.from(result.lod0.surfaceClass).map(id => SURFACE_CLASS_IDS[id]));
    expect(Array.from(seen)).toEqual(expect.arrayContaining(['green', 'bunker', 'fairway', 'tee', 'ground', 'woods', 'fringe', 'surround']));
  });
});
