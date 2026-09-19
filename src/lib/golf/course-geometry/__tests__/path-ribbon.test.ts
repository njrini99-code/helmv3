import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { parseContextLayer, type LocalContextZone } from '../context-layer';
import { weldAndCleanTerrainMesh, type DisplayMesh } from '../display-mesh-v2';
import { assertPathRibbon, compilePathRibbon, PATH_RIBBON_OPTIONS, type PathRibbon } from '../path-ribbon';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import type { HoleScene, PointM } from '../types';

const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);

// A flat 200x200 plane (one quad, height=0) plus a tilted-plane variant, both
// copied from the hero-patches.test.ts synthetic-world pattern so a path
// vertex's height can be checked against a known closed form.
function planeMesh(height: (x: number, y: number) => number): { mesh: TerrainMesh; base: DisplayMesh } {
  const s = 200;
  const base: DisplayMesh = {
    positions: Float64Array.from([0, 0, height(0, 0), s, 0, height(s, 0), s, s, height(s, s), 0, s, height(0, s)]),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]), triangleFeatures: new Uint16Array(2), triangleMaterials: new Uint8Array(2),
    orientation: Int8Array.from([1, 1]), vertexCount: 4, triangleCount: 2,
  };
  const mesh = { renderProfile: { tacticalBoundsM: [0, 0, s, s], contextBoundsM: [0, 0, s, s] } } as unknown as TerrainMesh;
  return { mesh, base };
}
// A finer regular grid, unlike planeMesh's single flat quad: a non-linear
// height field is only actually represented in the base mesh (rather than
// sampled at 4 corners and interpolated flat between them) when there is
// more than one cell to interpolate across. Needed wherever a test wants
// real height curvature, so heightToleranceM has something to bind on.
function gridMesh(sizeM: number, cells: number, height: (x: number, y: number) => number): { mesh: TerrainMesh; base: DisplayMesh } {
  const n = cells + 1;
  const positions = new Float64Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i / cells) * sizeM, y = (j / cells) * sizeM, idx = (j * n + i) * 3;
      positions[idx] = x; positions[idx + 1] = y; positions[idx + 2] = height(x, y);
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const a = j * n + i, b = j * n + i + 1, c = (j + 1) * n + i + 1, d = (j + 1) * n + i;
      indices.push(a, b, c, a, c, d);
    }
  }
  const triangleCount = indices.length / 3;
  const base: DisplayMesh = {
    positions, indices: Uint32Array.from(indices), triangleFeatures: new Uint16Array(triangleCount), triangleMaterials: new Uint8Array(triangleCount),
    orientation: Int8Array.from(new Array(triangleCount).fill(1)), vertexCount: n * n, triangleCount,
  };
  const mesh = { renderProfile: { tacticalBoundsM: [0, 0, sizeM, sizeM], contextBoundsM: [0, 0, sizeM, sizeM] } } as unknown as TerrainMesh;
  return { mesh, base };
}
const zone = (id: string, line: PointM[], widthM = 2.4): LocalContextZone => ({
  id, class: 'cart_path', type: 'LineString', parts: [[line]], basis: 'source' as LocalContextZone['basis'], reviewed: true,
  fidelity: 'high', render: 'ribbon' as LocalContextZone['render'], attributes: { widthM },
});
function sceneWith(zones: LocalContextZone[]): HoleScene {
  return {
    overlayKind: 'unresolved', packageHash: 'p', physicalHoleKey: 'h', algorithmVersion: 'evidence-only-v1',
    target: { kind: 'unknown_pin', greenFeatureId: null },
    hole: { key: 'h', ordinal: 1, par: 3, scorecardYards: 150, featureIds: [], routeFeatureId: null, greenFeatureId: null, nominalTargetWgs84: null, completeness: 'reviewed_surfaces', gaps: [] },
    features: [], contextZones: zones, events: [], orientationRadians: 0, attribution: '',
  } as unknown as HoleScene;
}
/** Every triangle's winding shares one sign, matching what `assertPathRibbon` checks per run. */
function windingSigns(ribbon: PathRibbon): Set<number> {
  const signs = new Set<number>();
  for (let t = 0; t < ribbon.triangleCount; t++) {
    const a = ribbon.indices[t * 3]!, b = ribbon.indices[t * 3 + 1]!, c = ribbon.indices[t * 3 + 2]!;
    const p = ribbon.positions;
    const ux = p[b * 3]! - p[a * 3]!, uy = p[b * 3 + 1]! - p[a * 3 + 1]!, vx = p[c * 3]! - p[a * 3]!, vy = p[c * 3 + 1]! - p[a * 3 + 1]!;
    const nz = ux * vy - uy * vx;
    if (Math.abs(nz) > 1e-9) signs.add(Math.sign(nz));
  }
  return signs;
}
/** An alternating zigzag centreline: `n` segments of `stepM`, turning by
 * `turnDeg` (sign flipping each vertex). Reproduces the hole 7 finding —
 * chained turns, individually under bevelTurnRad, spaced closer together
 * than a wide cross-section's own half-width — deliberately and repeatedly,
 * rather than relying on a real fixture to hit it once. */
function zigzag(n: number, stepM: number, turnDeg: number): PointM[] {
  const pts: PointM[] = [[20, 50]];
  let x = 20, y = 50, heading = 0;
  for (let i = 0; i < n; i++) {
    heading += (i % 2 === 0 ? 1 : -1) * (turnDeg * Math.PI) / 180;
    x += stepM * Math.cos(heading); y += stepM * Math.sin(heading);
    pts.push([x, y]);
  }
  return pts;
}

describe('cart-path ribbon (§11, §52-54; Task 14)', () => {
  it('resamples a straight path into one batched quad strip at the right width, with heights on the plane', () => {
    const { mesh, base } = planeMesh((x, y) => 0.02 * x + 0.01 * y);
    const scene = sceneWith([zone('path-1', [[20, 100], [180, 100]], 2.4)]);
    // Forced dense (maxSegmentM: 1): this test is about the per-vertex
    // cross-section formulas (width/edge/height), not the §11 budget
    // resampler — pinning the historical fixed step keeps its row count
    // exact and decoupled from wherever the adaptive default gets tuned.
    // The "collapses to few segments" test below covers the default.
    const ribbon = compilePathRibbon(scene, mesh, base, { maxSegmentM: 1 })!;
    expect(ribbon).not.toBeNull();
    assertPathRibbon(ribbon);
    expect(ribbon.runs).toEqual([{ zoneId: 'path-1', start: 0, count: ribbon.triangleCount }]);
    expect(ribbon.droppedTriangles).toBe(0);
    expect(ribbon.surfaceFallbacks).toBe(0);
    expect(ribbon.visualLiftM).toBeCloseTo(0.015, 6);
    // 160 m of straight path at <= 1 m spacing: 161 rows, 4 verts/row, 3 quads (6 tris) per gap.
    expect(ribbon.vertexCount).toBe(161 * 4);
    expect(ribbon.triangleCount).toBe(160 * 6);
    for (let v = 0; v < ribbon.vertexCount; v++) {
      const x = ribbon.positions[v * 3]!, y = ribbon.positions[v * 3 + 1]!, z = ribbon.positions[v * 3 + 2]!;
      // Width: half the path (2.4/2) at edge=0, half+feather (1.45) at edge=1, |t|<=1.
      const t = ribbon.uv[v * 2 + 1]!, edge = ribbon.edge[v]!;
      const lateral = Math.abs(t) * 1.45;
      expect(edge).toBeCloseTo(lateral <= 1.2 + 1e-6 ? 0 : (lateral - 1.2) / 0.25, 4);
      expect(Math.abs(t)).toBeLessThanOrEqual(1 + 1e-9);
      // Height sits exactly on the tilted plane plus the render-only lift (a flat 2-triangle
      // mesh interpolates linearly everywhere, so this closed form is exact, not approximate).
      expect(z).toBeCloseTo(0.02 * x + 0.01 * y + 0.015, 5);
    }
    // Determinism (constraint 13).
    const again = compilePathRibbon(scene, mesh, base, { maxSegmentM: 1 })!;
    expect(Array.from(again.indices)).toEqual(Array.from(ribbon.indices));
    expect(Array.from(again.positions)).toEqual(Array.from(ribbon.positions));
  });

  it('the adaptive default collapses a straight, flat run to a handful of long segments, not one row per metre', () => {
    // Same 160 m straight, flat path as above, but with the plan-derived
    // default options (§11 budget, Task 14 follow-up): zero curvature and
    // zero height-rate mean every candidate hop up to maxSegmentM passes
    // the chord/height tolerances, so the greedy walk takes the largest one
    // every time.
    const { mesh, base } = planeMesh(() => 0);
    const scene = sceneWith([zone('path-1', [[20, 100], [180, 100]], 2.4)]);
    const ribbon = compilePathRibbon(scene, mesh, base)!;
    assertPathRibbon(ribbon);
    expect(ribbon.droppedTriangles).toBe(0);
    const rows = Math.ceil(160 / PATH_RIBBON_OPTIONS.maxSegmentM) + 1;
    expect(ribbon.vertexCount).toBe(rows * 4);
    expect(ribbon.triangleCount).toBe((rows - 1) * 6);
    // However it got tuned, "collapses" must mean an order of magnitude
    // fewer rows than the historical fixed-1 m pass (161), not a marginal one.
    expect(rows).toBeLessThan(20);
  });

  it('never folds at a 90-degree bend or a hairpin (no fold means zero dropped triangles, not a filtered one)', () => {
    const { mesh, base } = planeMesh(() => 0);
    for (const [label, line] of [
      ['90-bend-left', [[20, 20], [100, 20], [100, 100]]],
      ['90-bend-right', [[20, 20], [100, 20], [100, -60]]],
      ['hairpin', [[20, 20], [100, 20], [100, 24], [20, 24]]],
      ['tight-hairpin', [[20, 20], [100, 20], [100, 21], [20, 21]]],
      ['near-reversal', [[20, 20], [100, 20], [20, 22]]],
    ] as const) {
      const ribbon = compilePathRibbon(sceneWith([zone(label, line as unknown as PointM[])]), mesh, base)!;
      expect(ribbon, label).not.toBeNull();
      expect(() => assertPathRibbon(ribbon), label).not.toThrow();
      // The real, non-tautological check the module doc promises: a fold
      // would either flip the run's winding (caught above) or force the
      // defensive area/winding filter to discard a triangle it attempted.
      expect(ribbon.droppedTriangles, label).toBe(0);
      expect(windingSigns(ribbon).size, label).toBeLessThanOrEqual(1);
    }
  });

  it('never emits inverted geometry even on a sustained tight zigzag too narrow for the cross-section width', () => {
    // A single corner always joins without folding (previous test). This is
    // the different, real failure mode found on hole 7's fixture: several
    // individually-modest turns (each <= bevelTurnRad) in a row, closer
    // together along the centreline than the cross-section's own half-width,
    // so the concave offset overtakes the previous row and the quad
    // self-intersects. No per-corner join or local retriangulation can
    // resolve that (module doc), so those triangles are dropped rather than
    // emitted inverted. On the real hole 7 fixture this affects 10 of 22,148
    // triangles (2 of 15 zones); this synthetic case is deliberately
    // adversarial (a sustained alternating zigzag, not a real digitised
    // trace) and can lose the *majority* of the strip to dropped triangles —
    // the only claim this test makes, and the only one that is stable
    // against the exact step/turn/width numbers, is that nothing folds.
    const { mesh, base } = planeMesh(() => 0);
    for (const [label, widthM, stepM, turnDeg] of [
      ['wide-road', 6, 2.5, 35],
      ['wide-road-tighter', 6, 1.8, 45],
    ] as const) {
      const ribbon = compilePathRibbon(sceneWith([zone(label, zigzag(14, stepM, turnDeg), widthM)]), mesh, base);
      expect(ribbon, label).not.toBeNull();
      expect(() => assertPathRibbon(ribbon!), label).not.toThrow();
      expect(windingSigns(ribbon!).size, label).toBeLessThanOrEqual(1);
    }
  });

  it('batches every zone of the hole into one geometry, with runs partitioning the triangles', () => {
    const { mesh, base } = planeMesh(() => 0);
    const scene = sceneWith([
      zone('path-a', [[20, 20], [100, 20]]),
      zone('path-b', [[20, 60], [100, 60], [100, 90]]),
      zone('path-c', [[20, 150], [190, 150]], 3.6),
    ]);
    const ribbon = compilePathRibbon(scene, mesh, base)!;
    assertPathRibbon(ribbon);
    expect(ribbon.runs.map(r => r.zoneId)).toEqual(['path-a', 'path-b', 'path-c']);
    let covered = 0;
    for (const run of ribbon.runs) { expect(run.start).toBe(covered); covered += run.count; }
    expect(covered).toBe(ribbon.triangleCount);
    // One shared buffer, not one per zone.
    expect(ribbon.runs.length).toBeGreaterThan(1);

    // The winding check must fire for a flip inside a *later* run too, not
    // just triangle 0 of a single-run ribbon (a per-run start/count slicing
    // bug could easily only show up past the first run).
    const thirdRun = ribbon.runs[2]!;
    const flipped = Uint32Array.from(ribbon.indices);
    const t = thirdRun.start + Math.floor(thirdRun.count / 2);
    [flipped[t * 3 + 1], flipped[t * 3 + 2]] = [flipped[t * 3 + 2]!, flipped[t * 3 + 1]!];
    expect(() => assertPathRibbon({ ...ribbon, indices: flipped })).toThrow(new RegExp(`${thirdRun.zoneId}: flipped winding`));
  });

  it('returns null when the hole has no mobility zones, and skips a zone clipped to under 2 points', () => {
    const { mesh, base } = planeMesh(() => 0);
    expect(compilePathRibbon(sceneWith([]), mesh, base)).toBeNull();
    expect(compilePathRibbon(sceneWith([{ ...zone('bare', []), parts: [[[]]] }]), mesh, base)).toBeNull();
    // A zone entirely outside contextBoundsM clips away to nothing.
    const farAway = zone('far', [[10_000, 10_000], [10_100, 10_000]]);
    expect(compilePathRibbon(sceneWith([farAway]), mesh, base)).toBeNull();
  });

  it('assertPathRibbon rejects a flipped triangle, a degenerate one, and a run gap it did not produce itself', () => {
    const { mesh, base } = planeMesh(() => 0);
    const ribbon = compilePathRibbon(sceneWith([zone('path-1', [[20, 100], [180, 100]])]), mesh, base)!;
    assertPathRibbon(ribbon); // sanity: the real output is clean.
    const flipped = Uint32Array.from(ribbon.indices);
    [flipped[1], flipped[2]] = [flipped[2]!, flipped[1]!];
    expect(() => assertPathRibbon({ ...ribbon, indices: flipped })).toThrow(/flipped winding/);
    const collapsed = Float32Array.from(ribbon.positions);
    collapsed.set([collapsed[0]!, collapsed[1]!, collapsed[2]!], 3);
    expect(() => assertPathRibbon({ ...ribbon, positions: collapsed })).toThrow(/degenerate triangle/);
    expect(() => assertPathRibbon({ ...ribbon, runs: [{ zoneId: 'path-1', start: 3, count: ribbon.triangleCount - 3 }] })).toThrow(/runs do not cover/);
  });

  it("batches hole 7's real mobility zones: gates pass, runs cover every zone, heights track the display surface", () => {
    const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
    const context = parseContextLayer(JSON.parse(readFileSync(new URL('peek-n-peak-upper-context.json', fixtures), 'utf8')), pkg);
    const hole7 = parseTerrainMesh(JSON.parse(gunzipSync(readFileSync(new URL('compiled-peek-n-peak-upper/peek-n-peak-upper-07-terrain.json.gz', fixtures))).toString('utf8')), pkg);
    const scene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], hole7, context);
    const base = weldAndCleanTerrainMesh(hole7);
    const ribbon = compilePathRibbon(scene, hole7, base);
    expect(ribbon).not.toBeNull();
    const r = ribbon!;
    assertPathRibbon(r);
    // Note 14/18 estimated ~8 runs on hole 7; the real context layer carries
    // more mobility zones than that once roads/service paths are counted too.
    expect(r.runs.length).toBeGreaterThanOrEqual(5);
    expect(r.triangleCount).toBeGreaterThan(0);
    expect(r.vertexCount).toBe(r.positions.length / 3);
    // Unlike the clean synthetic cases (droppedTriangles === 0), two of hole
    // 7's real zones (a 6m road and a 2.5m cart_path) chain several
    // individually-modest turns closer together than their own half-width —
    // the genuine, diagnosed residual the module doc describes, confirmed by
    // inspecting the raw OSM vertex spacing (1.3-58m segments, not
    // near-duplicate points) — not sub-threshold noise from the source trace.
    // See the "never emits inverted geometry" test above for the mechanism
    // reproduced synthetically, and the final report for the measured count.
    // The bound below is now expressed as a fraction of a much smaller
    // triangleCount than it was pre-budget-work (~22k -> ~4.5k on hole 7:
    // see the "stays within the §11 budget" test), so it is written as 1%
    // rather than the pre-budget 0.1% — the same ~18 affected triangles read
    // as a larger share of a deliberately shrunken total, not a new defect.
    expect(r.droppedTriangles).toBeLessThan(r.triangleCount * 0.01);
    expect(r.surfaceFallbacks).toBeLessThan(r.vertexCount * 0.01);

    // Independent brute-force barycentric height over `base` itself (no
    // grid bucketing, no fallback chain) — this is what "within 3 cm of the
    // display surface" means; comparing to the metric grid instead would
    // also catch the base mesh's own known interpolation drift from it
    // (Task 5's reported Hausdorff residuals), which is not this module's
    // concern. Only checked where a containing triangle actually exists —
    // `surfaceFallbacks` already accounts for the rest honestly.
    const bruteHeight = (x: number, y: number): number | null => {
      const p = base.positions;
      for (let t = 0; t < base.triangleCount; t++) {
        const ia = base.indices[t * 3]!, ib = base.indices[t * 3 + 1]!, ic = base.indices[t * 3 + 2]!;
        const ax = p[ia * 3]!, ay = p[ia * 3 + 1]!, az = p[ia * 3 + 2]!, bx = p[ib * 3]!, by = p[ib * 3 + 1]!, bz = p[ib * 3 + 2]!, cx = p[ic * 3]!, cy = p[ic * 3 + 1]!, cz = p[ic * 3 + 2]!;
        const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(det) < 1e-12) continue;
        const wa = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, wb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det, wc = 1 - wa - wb, eps = 1e-4;
        if (wa >= -eps && wb >= -eps && wc >= -eps) return wa * az + wb * bz + wc * cz;
      }
      return null;
    };
    let checked = 0;
    for (let v = 0; v < r.vertexCount; v += 5) {
      const x = r.positions[v * 3]!, y = r.positions[v * 3 + 1]!, z = r.positions[v * 3 + 2]!;
      const h = bruteHeight(x, y);
      if (h == null) continue; // a locator fallback vertex; not a display-surface point to compare.
      checked++;
      expect(Math.abs(z - r.visualLiftM - h)).toBeLessThan(0.03);
    }
    // The check above must have actually run, not vacuously passed. The
    // threshold is lower than before the budget work (was 1000): the same
    // v += 5 stride over a ribbon whose own vertexCount shrank ~5x (the
    // point of this task) samples proportionally fewer vertices, not a
    // weaker check on each one.
    expect(checked).toBeGreaterThan(400);

    // Deterministic across two compiles (constraint 13).
    const again = compilePathRibbon(scene, hole7, base)!;
    expect(Array.from(again.indices)).toEqual(Array.from(r.indices));
    expect(Array.from(again.positions)).toEqual(Array.from(r.positions));
  });

  it('stays within the §11 "path/water hero edges" triangle budget on hole 7 (Task 14 triangle-budget follow-up)', () => {
    const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
    const context = parseContextLayer(JSON.parse(readFileSync(new URL('peek-n-peak-upper-context.json', fixtures), 'utf8')), pkg);
    const hole7 = parseTerrainMesh(JSON.parse(gunzipSync(readFileSync(new URL('compiled-peek-n-peak-upper/peek-n-peak-upper-07-terrain.json.gz', fixtures))).toString('utf8')), pkg);
    const scene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], hole7, context);
    const base = weldAndCleanTerrainMesh(hole7);

    // The finding this task exists to fix: forcing the historical fixed 1 m
    // step (dense mode) lands ~4x over the plan's 5 000-triangle ceiling for
    // "path/water hero edges" (§11) on this hole — 22 148 across 15 runs
    // (road 7 582 / cart_path 11 989 / service_path 2 574) at the time this
    // task was scoped. Checked as a shape ("still solidly over budget
    // pre-resampling"), not the exact historical digit, since dense mode's
    // own count can move slightly with the fixture/library.
    const dense = compilePathRibbon(scene, hole7, base, { maxSegmentM: 1 })!;
    expect(dense.triangleCount).toBeGreaterThan(15_000);

    const adaptive = compilePathRibbon(scene, hole7, base)!;
    const report = assertPathRibbon(adaptive);
    expect(report.triangleCount).toBe(adaptive.triangleCount);
    expect(report.triangleBudget).toBe(PATH_RIBBON_OPTIONS.triangleBudget);
    expect(report.triangleBudget).toBe(5000);
    expect(report.withinBudget).toBe(true);
    expect(adaptive.triangleCount).toBeLessThanOrEqual(5000);
    // warnBudget/warn are computed from triangleCount, not hardcoded — this
    // pins that relationship rather than one specific true/false value that
    // would go stale the moment the count is retuned near the line.
    expect(report.warnBudget).toBe(Math.round(report.triangleBudget * 0.8));
    expect(report.warn).toBe(adaptive.triangleCount > report.warnBudget);

    // "hard error above 5,000 unless an option raises it": both directions.
    expect(() => assertPathRibbon(adaptive, { triangleBudget: adaptive.triangleCount - 1 })).toThrow(/triangle path-ribbon budget/);
    expect(() => assertPathRibbon(adaptive, { triangleBudget: adaptive.triangleCount + 1 })).not.toThrow();
  });

  it('tracks the dense (1 m) reference within chordToleranceM/heightToleranceM on a smoothly curved, rolling synthetic path', () => {
    // hole 7's real zones interleave adaptive rows with mandatory mitre/bevel
    // corner rows (turns > turnSampleRad), whose join is deliberately *not*
    // a straight continuation of the incoming offset (module doc §53-54) —
    // so a straight-line/chord model isn't valid wherever a compared row is
    // a corner, and corners aren't identifiable from the public PathRibbon
    // output, so this checks the property on a synthetic path with *no*
    // mandatory corners instead: every turn is 3 degrees (well under
    // turnSampleRad's 10), and the terrain has real height curvature so
    // heightToleranceM actually binds too, not just chordToleranceM. Hole 7
    // still backs the budget,
    // gates, dropped-triangle bound, and determinism (tests above/below).
    const height = (x: number, _y: number) => 0.6 * Math.sin(x / 25);
    const { mesh, base } = gridMesh(200, 40, height);
    const leadIn: PointM[] = [[20, 100]];
    for (let i = 1; i <= 60; i++) leadIn.push([20 + i, 100]);
    const radius = 12, arcSteps = 30, stepAngle = (90 * Math.PI) / 180 / arcSteps, stepLen = radius * stepAngle;
    let x = 80, y = 100, heading = 0;
    const arc: PointM[] = [];
    for (let i = 0; i < arcSteps; i++) { heading += stepAngle; x += stepLen * Math.cos(heading); y += stepLen * Math.sin(heading); arc.push([x, y]); }
    const leadOutStart = arc.at(-1)!;
    const leadOut: PointM[] = [];
    for (let i = 1; i <= 60; i++) leadOut.push([leadOutStart[0] + i * Math.cos(heading), leadOutStart[1] + i * Math.sin(heading)]);
    const line = [...leadIn, ...arc, ...leadOut];
    const scene = sceneWith([zone('curve', line, 2.4)]);

    const dense = compilePathRibbon(scene, mesh, base, { maxSegmentM: 1 })!;
    assertPathRibbon(dense, { triangleBudget: Number.POSITIVE_INFINITY });
    const adaptive = compilePathRibbon(scene, mesh, base)!;
    assertPathRibbon(adaptive);
    expect(dense.droppedTriangles).toBe(0);
    expect(adaptive.droppedTriangles).toBe(0);
    expect(adaptive.triangleCount).toBeLessThan(dense.triangleCount / 2); // still collapsing — the whole point of this task.

    // Single zone, single run, and no turn ever exceeds turnSampleRad, so
    // `breaks` is just [0, total]: one piece with no mandatory corners
    // anywhere in it, checked structurally rather than assumed — every row
    // in both ribbons is 4 consecutive vertices sharing one `uv.x` (module
    // doc), so both vertex counts must be exact multiples of 4.
    expect(adaptive.runs).toHaveLength(1);
    expect(dense.runs).toHaveLength(1);
    expect(adaptive.vertexCount % 4).toBe(0);
    expect(dense.vertexCount % 4).toBe(0);

    const aS = (v: number): number => adaptive.uv[v * 2]!, dS = (v: number): number => dense.uv[v * 2]!;
    let comparedHops = 0, comparedDenseRows = 0;
    for (let rowBase = 0; rowBase + 7 < adaptive.vertexCount; rowBase += 4) {
      const s0 = aS(rowBase), s1 = aS(rowBase + 4), gap = s1 - s0;
      if (gap <= PATH_RIBBON_OPTIONS.minSegmentM + 1e-6) continue; // floor-rate hop — nothing skipped to check.
      comparedHops++;
      for (let denseRowBase = 0; denseRowBase < dense.vertexCount; denseRowBase += 4) {
        const s = dS(denseRowBase);
        if (s <= s0 || s >= s1) continue; // only dense rows the adaptive hop actually skipped are informative.
        comparedDenseRows++;
        for (let col = 0; col < 4; col++) {
          const v0 = rowBase + col, v1 = rowBase + 4 + col, vd = denseRowBase + col;
          const p0x = adaptive.positions[v0 * 3]!, p0y = adaptive.positions[v0 * 3 + 1]!, p0z = adaptive.positions[v0 * 3 + 2]!;
          const p1x = adaptive.positions[v1 * 3]!, p1y = adaptive.positions[v1 * 3 + 1]!, p1z = adaptive.positions[v1 * 3 + 2]!;
          const dx = dense.positions[vd * 3]!, dy = dense.positions[vd * 3 + 1]!, dz = dense.positions[vd * 3 + 2]!;
          // Same metric compilePathRibbon's own segmentOk uses to accept
          // this hop in the first place: perpendicular distance to the
          // chord LINE, height compared at that line's nearest-point
          // parameter t — not an arc-length-fraction interpolation, which
          // measures a different (generically larger, for a curved path)
          // quantity and would fail even a hop segmentOk legitimately
          // accepted (the metric mismatch this test's first draft had).
          const ux = p1x - p0x, uy = p1y - p0y, len2 = Math.max(1e-12, ux * ux + uy * uy);
          const t = ((dx - p0x) * ux + (dy - p0y) * uy) / len2;
          const chordDev = Math.hypot(dx - (p0x + t * ux), dy - (p0y + t * uy));
          const heightDev = Math.abs(dz - (p0z + t * (p1z - p0z)));
          const label = `col ${col} s~${s.toFixed(2)}`;
          expect(chordDev, label).toBeLessThan(PATH_RIBBON_OPTIONS.chordToleranceM + 0.005);
          expect(heightDev, label).toBeLessThan(PATH_RIBBON_OPTIONS.heightToleranceM + 0.005);
        }
      }
    }
    expect(comparedHops).toBeGreaterThan(10); // observed 15 on this path; guards against the loop collapsing to ~1.
    expect(comparedDenseRows).toBeGreaterThan(100); // observed 124; the check above must have actually run, not vacuously passed.
  });

  it('a smooth curve (every turn individually under turnSampleRad) stays near the minSegmentM floor through the bend, while the flat straights either side reach the full maxSegmentM ceiling', () => {
    const { mesh, base } = planeMesh(() => 0); // flat: isolates curvature (chordToleranceM), not height-rate.
    const leadIn: PointM[] = [[20, 100]];
    for (let i = 1; i <= 60; i++) leadIn.push([20 + i, 100]);
    // A tight (3 m radius), smooth 90-degree bend: 30 sub-steps of 3 degrees
    // each, well under turnSampleRad (10 degrees), so no vertex ever forces
    // a mandatory row — whatever density the bend gets comes entirely from
    // the chordToleranceM check, not the corner logic the "never folds"/
    // "never emits inverted geometry" tests above already cover.
    const radius = 3, arcSteps = 30, stepAngle = (90 * Math.PI) / 180 / arcSteps, stepLen = radius * stepAngle;
    let x = 80, y = 100, heading = 0;
    const arc: PointM[] = [];
    for (let i = 0; i < arcSteps; i++) { heading += stepAngle; x += stepLen * Math.cos(heading); y += stepLen * Math.sin(heading); arc.push([x, y]); }
    const leadOutStart = arc.at(-1)!;
    const leadOut: PointM[] = [];
    for (let i = 1; i <= 60; i++) leadOut.push([leadOutStart[0] + i * Math.cos(heading), leadOutStart[1] + i * Math.sin(heading)]);
    const line = [...leadIn, ...arc, ...leadOut];

    const ribbon = compilePathRibbon(sceneWith([zone('curve', line, 2.4)]), mesh, base)!;
    assertPathRibbon(ribbon);
    expect(ribbon.droppedTriangles).toBe(0);

    // Row arc-lengths: every row's 4 columns share one `s` (module doc).
    const sValues = Array.from(new Set(Array.from({ length: ribbon.vertexCount }, (_, v) => ribbon.uv[v * 2]!))).sort((a, b) => a - b);
    const gaps = sValues.slice(1).map((s, i) => s - sValues[i]!);

    // The straight lead-in reaches the full ceiling somewhere...
    expect(Math.max(...gaps)).toBeCloseTo(PATH_RIBBON_OPTIONS.maxSegmentM, 5);
    // ...and the tight bend pulls at least one hop all the way down to the
    // floor — "stays dense", not merely "denser than the straight".
    expect(Math.min(...gaps)).toBeLessThanOrEqual(PATH_RIBBON_OPTIONS.minSegmentM + 1e-6);
  });
});
