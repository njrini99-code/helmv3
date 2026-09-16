import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { parseContextLayer, type LocalContextZone } from '../context-layer';
import { weldAndCleanTerrainMesh, type DisplayMesh } from '../display-mesh-v2';
import { assertPathRibbon, compilePathRibbon, type PathRibbon } from '../path-ribbon';
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

describe('cart-path ribbon (§11, §52-54; Task 14)', () => {
  it('resamples a straight path into one batched quad strip at the right width, with heights on the plane', () => {
    const { mesh, base } = planeMesh((x, y) => 0.02 * x + 0.01 * y);
    const scene = sceneWith([zone('path-1', [[20, 100], [180, 100]], 2.4)]);
    const ribbon = compilePathRibbon(scene, mesh, base)!;
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
    const again = compilePathRibbon(scene, mesh, base)!;
    expect(Array.from(again.indices)).toEqual(Array.from(ribbon.indices));
    expect(Array.from(again.positions)).toEqual(Array.from(ribbon.positions));
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
    // Real GPS-derived traces carry a little noise; this is the residual the
    // module doc promises stays near zero, not exactly zero like the clean
    // synthetic cases (see the final report for the measured count).
    expect(r.droppedTriangles).toBeLessThan(r.triangleCount * 0.001);
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
    expect(checked).toBeGreaterThan(1000); // the check above must have actually run, not vacuously passed.

    // Deterministic across two compiles (constraint 13).
    const again = compilePathRibbon(scene, hole7, base)!;
    expect(Array.from(again.indices)).toEqual(Array.from(r.indices));
    expect(Array.from(again.positions)).toEqual(Array.from(r.positions));
  });
});
