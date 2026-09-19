import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { assertBunkerNormalField, compileBunkerNormalField, packOctNormals, unpackOctNormals, type BunkerNormalField } from '../bunker-normal-field';
import { bunkerDisplacement, bunkerSignedDistance, bunkerShape, compileHeroPatches, type BunkerHeroProfile, type CompiledBunkerPatch } from '../bunker-display-mesh';
import { nearestOnRings, smootherstep } from '../bunker-profile';
import { weldAndCleanTerrainMesh } from '../display-mesh-v2';
import { compileHeroRegions } from '../hero-patches';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh, type TerrainMesh } from '../terrain';
import { sampleMetricTerrain, metricTerrainNormal, type MetricTerrainGrid } from '../terrain-source';
import type { HoleScene, LocalFeature, PointM } from '../types';
import { MERIDIAN_STYLE, type MeridianStyle } from '../visual-style';

const fixtures = new URL('../../../../test/fixtures/course-geometry/', import.meta.url);

// Helpers below are copied from bunker-display-mesh.test.ts (Task 8), not
// imported, per this task's file-ownership rule — this test file owns its
// own synthetic world.
// n = 200 (not bunker-display-mesh.test.ts's 48): the finite-difference
// check below differentiates the *outline distance field* itself, whose
// gradient is exactly the direction to the nearest boundary point except at
// the true (0-measure) medial axis of the shape — but a coarse polygon adds
// its *own* facet-scale medial-axis spokes at every vertex bisector, wide
// enough for a 1 cm FD step to occasionally straddle two facets. At n = 200
// those spokes are negligibly thin (confirmed empirically: raw distance-field
// FD vs. the nearest-point direction agrees to ~1e-13 away from the filters
// below, vs. up to 45% at n = 48–64).
const circle = (cx: number, cy: number, r: number, n = 200, ry = r): PointM[] => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n), cy + ry * Math.sin(2 * Math.PI * i / n)] as PointM);
const feature = (id: string, kind: LocalFeature['kind'], ring: PointM[]): LocalFeature => ({ id, kind, type: 'Polygon', parts: [[ring]], reviewed: true });
const inRing = ([x, y]: PointM, ring: PointM[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** A 120 m square at 2 m cells: a green with a greenside bunker (one
 * green_complex region), and a small pot and a large elongated fairway
 * bunker each ~65–75 m from every other feature (two standalone `bunker`
 * regions, no shared margin bands) — unlike bunker-display-mesh.test.ts's
 * world, these never compete for "nearest profile" at the same point, so
 * every finite-difference sample below stays unambiguous. `terrain` is
 * parameterized: a mild slope exercises the terrain+bunker slope sum, and a
 * flat plane isolates the bunker-only tilt. */
const GREEN = circle(30, 30, 8), GREENSIDE = circle(44, 30, 3.5), POT = circle(20, 95, 2), FAIRWAY = circle(90, 70, 9, 200, 5), SIZE_M = 120;
function syntheticWorld(terrain: (x: number, y: number) => number): { mesh: TerrainMesh; scene: HoleScene } {
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
function compilePatches(terrain: (x: number, y: number) => number) {
  const { mesh, scene } = syntheticWorld(terrain);
  const base = weldAndCleanTerrainMesh(mesh);
  const plan = compileHeroRegions(scene, mesh, base);
  const patches = compileHeroPatches(scene, mesh, base, plan, MERIDIAN_STYLE);
  return { mesh, patches };
}

/** Same nearest-bunker pick `bunkerDisplacement` (Task 8) and the module
 * under test use: strict `d > bestD`, first profile wins a tie. */
function nearestBunker(point: PointM, profiles: readonly BunkerHeroProfile[]): { profile: BunkerHeroProfile; distance: number } | null {
  let best: BunkerHeroProfile | null = null, bestD = -Infinity;
  for (const profile of profiles) {
    const d = bunkerSignedDistance(point, profile);
    if (best == null || d > bestD) { best = profile; bestD = d; }
  }
  return best ? { profile: best, distance: bestD } : null;
}
function centralDiff(f: (p: PointM) => number, point: PointM, h = 0.01): [number, number] {
  return [(f([point[0] + h, point[1]]) - f([point[0] - h, point[1]])) / (2 * h), (f([point[0], point[1] + h]) - f([point[0], point[1] - h])) / (2 * h)];
}
/** Copy of the module's §40 blend ramp, to check `rimBlend` against the
 * spec's own formula rather than against itself. */
function smoothBand(distance: number, band: number): number {
  if (band <= 0 || distance >= band) return 0;
  if (distance <= 0) return 1;
  const t = 1 - distance / band;
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Analytic-vs-finite-difference gradient samples for one compiled patch:
 * inside a bowl, against the offset with the §38 shape factor frozen at the
 * sample's own value (exactly what the module's closed form assumes); in a
 * lip band, against the real `bunkerDisplacement` (no shape factor there,
 * so it's exact). Skips the outline, the depth plateau, the shape's own
 * medial axis and the outline's nearest polygon vertex — see the big
 * comment where this was first worked out, in the synthetic-world test
 * below. Shared so the hole 7 fixture (real, coarse, hand-digitized
 * outlines) can be measured the same way, not just the n=200 synthetic one. */
function gradientSamples(compiled: CompiledBunkerPatch, field: BunkerNormalField, style: MeridianStyle, cap: number): { bowl: { analytic: [number, number]; frozenFD: [number, number]; realFD: [number, number] }[]; lip: { analytic: [number, number]; realFD: [number, number] }[] } {
  const w = style.bunker.lipBandM;
  const bowl: { analytic: [number, number]; frozenFD: [number, number]; realFD: [number, number] }[] = [];
  const lip: { analytic: [number, number]; realFD: [number, number] }[] = [];
  const vertexCount = compiled.patch.positions.length / 3, stride = Math.max(1, Math.floor(vertexCount / 1500));
  for (let v = 0; v < vertexCount && (bowl.length < cap || lip.length < cap); v += stride) {
    const point: PointM = [compiled.patch.positions[v * 3]!, compiled.patch.positions[v * 3 + 1]!];
    const nearest = nearestBunker(point, compiled.profiles);
    if (!nearest) continue;
    const { profile, distance } = nearest, analytic: [number, number] = [field.gradient[v * 2]!, field.gradient[v * 2 + 1]!];
    const phi = Math.atan2(point[1] - profile.centroid[1], point[0] - profile.centroid[0]);
    let angleToAxis = Math.abs(phi - profile.axisAngle) % Math.PI;
    if (angleToAxis > Math.PI / 2) angleToAxis = Math.PI - angleToAxis;
    if (angleToAxis < 0.3) continue;
    const footpoint = nearestOnRings(point, profile.rings), ring = profile.rings[footpoint.ringIndex]!.ring;
    const segA = ring[footpoint.segment]!, segB = ring[footpoint.segment + 1]!;
    if (Math.min(Math.hypot(footpoint.point[0] - segA[0], footpoint.point[1] - segA[1]), Math.hypot(footpoint.point[0] - segB[0], footpoint.point[1] - segB[1])) < 0.05) continue;
    if (distance > 0) {
      const u = distance / profile.bowlRadiusM;
      if (u < 0.05 || u > 0.95 || bowl.length >= cap) continue;
      // The §38 shape factor is held at the sample point's own value —
      // exactly what the module's closed form assumes — so `frozenFD`
      // isolates whether the S'(u)/R chain rule itself is correct.
      // `realFD`, against the actual `bunkerDisplacement` (shape varying
      // too), is diagnostic only: see the module header on the dropped
      // ∇(shape) term.
      const shapeAtSample = bunkerShape(point, profile);
      const frozenOffset = (p: PointM): number => {
        const d = bunkerSignedDistance(p, profile);
        return d <= 0 ? 0 : -profile.depthM * shapeAtSample * smootherstep(Math.min(1, d / profile.bowlRadiusM));
      };
      bowl.push({ analytic, frozenFD: centralDiff(frozenOffset, point), realFD: centralDiff(p => bunkerDisplacement(p, compiled.profiles, style), point) });
    } else {
      const q = -distance; // The lip has no shape factor, so this is exact — avoid its own two seams (q≈0, q≈w).
      if (q < 0.05 * w || q > 0.95 * w || lip.length >= cap) continue;
      lip.push({ analytic, realFD: centralDiff(p => bunkerDisplacement(p, compiled.profiles, style), point) });
    }
  }
  return { bowl, lip };
}
/** Does `terrainSlopeAt`'s zero-slope fallback fire at this point — i.e. is
 * any of the four samples central difference needs missing from the grid?
 * (The module's own function is private; this mirrors its exact condition.) */
function terrainSlopeFallback(grid: MetricTerrainGrid, point: PointM): boolean {
  const h = grid.spacingM;
  return [[-h, 0], [h, 0], [0, -h], [0, h]].some(([dx, dy]) => sampleMetricTerrain(grid, [point[0] + dx!, point[1] + dy!]) == null);
}

describe('bunker analytic normal field (§37–40; Task 9)', () => {
  const sloped = compilePatches((x, y) => 0.03 * x + 0.015 * y);
  const flat = compilePatches(() => 0);

  it('packs buffer lengths per vertex and passes the gate on every synthetic patch', () => {
    expect(sloped.patches.length).toBeGreaterThanOrEqual(2);
    for (const compiled of sloped.patches) {
      const field = compileBunkerNormalField(compiled, sloped.mesh);
      expect(field.id).toBe(compiled.patch.id);
      expect(() => assertBunkerNormalField(field, compiled)).not.toThrow();
    }
  });

  it('is deterministic', () => {
    for (const compiled of sloped.patches) {
      const a = compileBunkerNormalField(compiled, sloped.mesh), b = compileBunkerNormalField(compiled, sloped.mesh);
      expect(Array.from(a.normals)).toEqual(Array.from(b.normals));
      expect(Array.from(a.gradient)).toEqual(Array.from(b.gradient));
      expect(Array.from(a.rimBlend)).toEqual(Array.from(b.rimBlend));
    }
  });

  it('matches the analytic gradient against finite differences of the displacement it was drawn from', () => {
    // n = 200 (not bunker-display-mesh.test.ts's 48): this differentiates
    // the *outline distance field* itself, whose gradient is exactly the
    // direction to the nearest boundary point except at the true (0-measure)
    // medial axis of the shape — but a coarse polygon adds its *own*
    // facet-scale medial-axis spokes at every vertex bisector, wide enough
    // for a 1 cm FD step to occasionally straddle two facets. At n = 200
    // those spokes are negligibly thin (confirmed empirically: raw
    // distance-field FD vs. the nearest-point direction agreed to ~1e-13
    // away from `gradientSamples`'s two extra filters below, vs. up to 45%
    // at n = 48–64 — the filters alone were not enough at coarse n). The
    // hole 7 fixture measures what real, coarse, hand-digitized outlines
    // actually do, below.
    const style = MERIDIAN_STYLE;
    const bowl: { analytic: [number, number]; frozenFD: [number, number]; realFD: [number, number] }[] = [], lip: { analytic: [number, number]; realFD: [number, number] }[] = [];
    for (const compiled of sloped.patches) {
      const field = compileBunkerNormalField(compiled, sloped.mesh), samples = gradientSamples(compiled, field, style, 220);
      bowl.push(...samples.bowl); lip.push(...samples.lip);
    }
    expect(bowl.length).toBeGreaterThanOrEqual(100);
    expect(lip.length).toBeGreaterThanOrEqual(100);
    for (const { analytic, frozenFD } of bowl) {
      const magnitude = Math.max(Math.hypot(...frozenFD), 1e-6);
      expect(Math.hypot(analytic[0] - frozenFD[0], analytic[1] - frozenFD[1])).toBeLessThanOrEqual(0.02 * magnitude);
    }
    for (const { analytic, realFD } of lip) {
      const magnitude = Math.max(Math.hypot(...realFD), 1e-6);
      expect(Math.hypot(analytic[0] - realFD[0], analytic[1] - realFD[1])).toBeLessThanOrEqual(0.02 * magnitude);
    }
    // Diagnostic only, against the real (unfrozen) displacement: measured
    // max 0.92 (2026-09-16). The dropped ∇(shape) term (§38 "locally
    // constant") dominates near the depth plateau, where S'(u) itself is
    // small — see the module header. This bound documents that; it is not a
    // tight gate, the frozen-shape check above is.
    let bowlRealResidualMax = 0;
    for (const { analytic, realFD } of bowl) {
      const magnitude = Math.max(Math.hypot(...realFD), 1e-6);
      bowlRealResidualMax = Math.max(bowlRealResidualMax, Math.hypot(analytic[0] - realFD[0], analytic[1] - realFD[1]) / magnitude);
    }
    expect(Number.isFinite(bowlRealResidualMax)).toBe(true);
    expect(bowlRealResidualMax).toBeLessThan(1.5);
  });

  it('tilts wall normals toward the bowl floor on a flat plane, away from the §40 blend bands', () => {
    for (const compiled of flat.patches) {
      const field = compileBunkerNormalField(compiled, flat.mesh);
      const vertexCount = compiled.patch.positions.length / 3;
      let checked = 0;
      for (let v = 0; v < vertexCount; v++) {
        if (field.rimBlend[v]! > 0.01) continue;
        const point: PointM = [compiled.patch.positions[v * 3]!, compiled.patch.positions[v * 3 + 1]!];
        const nearest = nearestBunker(point, compiled.profiles);
        if (!nearest || nearest.distance <= 0) continue;
        const u = nearest.distance / nearest.profile.bowlRadiusM;
        if (u < 0.3 || u > 0.7) continue; // comfortably mid-wall
        const near = nearestOnRings(point, nearest.profile.rings).point;
        const dx = point[0] - near[0], dy = point[1] - near[1], length = Math.hypot(dx, dy) || 1;
        const nx = field.normals[v * 3]!, ny = field.normals[v * 3 + 1]!, nz = field.normals[v * 3 + 2]!;
        expect(nz).toBeGreaterThan(0);
        // Flat terrain: the only tilt is the bunker's own. It should point
        // from the outline into the interior — toward the floor.
        expect((nx * dx + ny * dy) / length).toBeGreaterThan(0);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    }
  });

  it('blends toward the pure terrain normal near the outline and the patch rim, continuously in between', () => {
    const outlineBandM = .15, rimBandM = .3, w = MERIDIAN_STYLE.bunker.lipBandM;
    for (const compiled of sloped.patches) {
      const field = compileBunkerNormalField(compiled, sloped.mesh);
      const vertexCount = compiled.patch.positions.length / 3;
      let rimVerticesChecked = 0;
      for (let v = 0; v < vertexCount; v++) {
        const point: PointM = [compiled.patch.positions[v * 3]!, compiled.patch.positions[v * 3 + 1]!];
        const nearest = nearestBunker(point, compiled.profiles);
        const distance = nearest ? nearest.distance : -Infinity;
        const predicted = nearest
          ? Math.max(smoothBand(Math.abs(distance), outlineBandM), distance < 0 ? smoothBand(Math.max(0, w + distance), rimBandM) : 0)
          : 1;
        expect(field.rimBlend[v]).toBeCloseTo(predicted, 5);
        expect(field.rimBlend[v]!).toBeGreaterThanOrEqual(0);
        expect(field.rimBlend[v]!).toBeLessThanOrEqual(1);
        // §40 "rim vertices": zero offset and outline distance ≥ W — always
        // outside the lip band, so the blend changes nothing about the
        // field itself, but the result should still read as pure terrain.
        // Skip the synthetic grid's own outer edge: a green_complex region's
        // rim can run far from its green (rimTaperM = 10) into open "ground"
        // that, on this synthetic 120 m square, reaches the grid boundary
        // itself. There, this module's own central difference (zero slope
        // when a sample falls outside the grid) intentionally diverges from
        // `metricTerrainNormal`'s one-sided fallback — a real course's grid
        // always extends well past any hero region, so this never arises in
        // production; it is a synthetic-world edge, not a rim-blend issue.
        const grid = sloped.mesh.metricGrid!, interior = point[0] >= grid.spacingM && point[0] <= (grid.columns - 1 - grid.spacingM) && point[1] >= grid.spacingM && point[1] <= (grid.rows - 1 - grid.spacingM);
        if (distance <= -w && interior) {
          const terrainNormal = metricTerrainNormal(grid, point);
          if (!terrainNormal) continue;
          expect(field.normals[v * 3]!).toBeCloseTo(terrainNormal[0], 4);
          expect(field.normals[v * 3 + 1]!).toBeCloseTo(terrainNormal[1], 4);
          expect(field.normals[v * 3 + 2]!).toBeCloseTo(terrainNormal[2], 4);
          rimVerticesChecked++;
        }
      }
      expect(rimVerticesChecked).toBeGreaterThan(0);
    }
  });

  it('round-trips octahedral packing to under 1°, preserving the upward hemisphere', () => {
    for (const { patches, mesh } of [sloped, flat]) {
      for (const compiled of patches) {
        const field = compileBunkerNormalField(compiled, mesh);
        const packed = packOctNormals(field.normals);
        expect(packed.length).toBe((field.normals.length / 3) * 2);
        const unpacked = unpackOctNormals(packed);
        let worstAngleDeg = 0;
        for (let v = 0; v < field.normals.length / 3; v++) {
          const ax = field.normals[v * 3]!, ay = field.normals[v * 3 + 1]!, az = field.normals[v * 3 + 2]!;
          const bx = unpacked[v * 3]!, by = unpacked[v * 3 + 1]!, bz = unpacked[v * 3 + 2]!;
          expect(bz).toBeGreaterThan(0);
          const dot = Math.min(1, Math.max(-1, ax * bx + ay * by + az * bz));
          worstAngleDeg = Math.max(worstAngleDeg, Math.acos(dot) * 180 / Math.PI);
        }
        expect(worstAngleDeg).toBeLessThan(1);
      }
    }
  });

  it('compiles hole 7: all four bunker patches pass the gate and are deterministic', () => {
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
    let bowlWithin2pct = 0, bowlTotal = 0, lipWithin2pct = 0, lipTotal = 0, terrainFallbacks = 0, terrainSamples = 0;
    for (const compiled of patches) {
      const a = compileBunkerNormalField(compiled, hole), b = compileBunkerNormalField(compiled, hole);
      expect(() => assertBunkerNormalField(a, compiled)).not.toThrow();
      expect(Array.from(a.normals)).toEqual(Array.from(b.normals));
      expect(Array.from(a.gradient)).toEqual(Array.from(b.gradient));
      expect(Array.from(a.rimBlend)).toEqual(Array.from(b.rimBlend));
      // Real Peek'n Peak outlines are coarse, irregular, hand-digitized
      // polygons — the opposite of the n = 200 circles above. Measure the
      // same 2% gate's pass rate here rather than asserting it per-point,
      // since a hand-drawn outline's own vertex spacing is out of this
      // task's control (unlike the synthetic world's n).
      const { bowl, lip } = gradientSamples(compiled, a, MERIDIAN_STYLE, 220);
      for (const { analytic, frozenFD } of bowl) {
        bowlTotal++;
        if (Math.hypot(analytic[0] - frozenFD[0], analytic[1] - frozenFD[1]) <= 0.02 * Math.max(Math.hypot(...frozenFD), 1e-6)) bowlWithin2pct++;
      }
      for (const { analytic, realFD } of lip) {
        lipTotal++;
        if (Math.hypot(analytic[0] - realFD[0], analytic[1] - realFD[1]) <= 0.02 * Math.max(Math.hypot(...realFD), 1e-6)) lipWithin2pct++;
      }
      // And: does a real hole's grid ever leave a hero-patch vertex short of
      // all four terrainSlopeAt samples? If never, the zero-slope-at-edge
      // vs. `metricTerrainNormal`'s one-sided-fallback divergence (skipped
      // above with a `grid.spacingM`-margin guard) is confirmed synthetic-
      // world-only, not a production gap.
      const grid = hole.metricGrid;
      if (grid) for (let v = 0; v < compiled.patch.positions.length / 3; v++) {
        terrainSamples++;
        if (terrainSlopeFallback(grid, [compiled.patch.positions[v * 3]!, compiled.patch.positions[v * 3 + 1]!])) terrainFallbacks++;
      }
    }
    expect(bowlTotal).toBeGreaterThan(0);
    expect(lipTotal).toBeGreaterThan(0);
    // Measured 2026-09-16: bowl 862/880 (97.9%), lip 530/531 (99.8%) within
    // 2%, 0/13224 vertices ever short a terrainSlopeAt sample.
    expect(bowlWithin2pct / bowlTotal).toBeGreaterThanOrEqual(0.9);
    expect(lipWithin2pct / lipTotal).toBeGreaterThanOrEqual(0.9);
    expect(terrainSamples).toBeGreaterThan(0);
    expect(terrainFallbacks).toBe(0);
  });
});
