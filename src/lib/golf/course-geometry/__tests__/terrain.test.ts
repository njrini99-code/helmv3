import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseGeometryPackage } from '../schema';
import { buildHoleScene } from '../build-scene';
import { normalizePersistedShot } from '../normalize';
import { fitTerrainCamera, MAX_TERRAIN_TRIANGLES, MAX_TERRAIN_VERTEX_COMPONENTS, parseTerrainMesh, projectTerrainPoint, sourceVertexNormals, terrainBasis, terrainHeight, TERRAIN_PRESETS, woodsOcclusion } from '../terrain';
import type { Point3M, TerrainMesh } from '../terrain';
import data from '@/test/fixtures/course-geometry/cacapon.json';
import terrainData from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';
import terrainReport from '@/test/fixtures/course-geometry/cacapon-07-terrain-report.json';
import { terrainCanopy } from '../terrain-canopy';
import { inFeature } from '../spatial';

const pkg = parseGeometryPackage(data);
const mesh = parseTerrainMesh(terrainData, pkg);
const evidence = [normalizePersistedShot({ shot_number: 2, shot_type: 'approach', result: 'sand',
  distance_to_hole_before: 158, distance_to_hole_after: 17, distance_unit_before: 'yards', distance_unit_after: 'yards', miss_direction: 'short_right', shot_distance: 141 })];
const scene = buildHoleScene(pkg, 'cacapon-07', evidence, mesh);
describe('source-linked terrain and camera', () => {
  it('retains source date, vertical datum, uncertainty and matching physical geometry', () => {
    expect(mesh.source.acquisitionStart).toBe('2021-12-04');
    expect(mesh.source.acquisitionEnd).toBe('2021-12-21');
    expect(mesh.source.verticalAccuracyM).toBeNull();
    expect(mesh.source.registrationResidualM).toBeNull();
    expect(mesh.verticalDatum).toBe('NAVD88');
    expect(mesh.geometryHash).toBe(pkg.contentHash);
    expect(terrainReport.features.every(f => Math.abs(f.clippedAreaM2 - f.triangleAreaM2) < .001)).toBe(true);
    expect(mesh.triangleFeatures).toHaveLength(terrainReport.triangles);
    expect(mesh.triangleFeatures.length).toBeLessThanOrEqual(MAX_TERRAIN_TRIANGLES);
    expect(terrainReport.displayOutlines.every(f => f.boundaryDisplacementM <= .5 && Math.abs(f.areaChangePercent) <= 1.5)).toBe(true);
    expect(mesh.triangleMaterials).toContain(3);
    expect(mesh.triangleMaterials).toContain(4);
  });
  it('rejects wrong versions, holes, references, malformed vertices and triangle topology', () => {
    for (const change of [
      (m: TerrainMesh) => { m.geometryHash = '0'.repeat(64); },
      (m: TerrainMesh) => { m.physicalHoleKey = 'cacapon-08'; },
      (m: TerrainMesh) => { m.vertices[0] = NaN; },
      (m: TerrainMesh) => { m.vertices.pop(); },
      (m: TerrainMesh) => { m.triangleFeatures[0] = 255; },
      (m: TerrainMesh) => { m.triangleMaterials.pop(); },
      (m: TerrainMesh) => { m.featureKinds[0] = 'water'; },
    ]) { const changed = structuredClone(mesh); change(changed); expect(() => parseTerrainMesh(changed, pkg)).toThrow(); }
    expect(buildHoleScene(pkg, 'cacapon-08', [], mesh).terrain).toBeUndefined();
  });
  it('accepts the 40,000-triangle detail budget and rejects one more complete triangle', () => {
    const triangle = mesh.vertices.slice(0, 9);
    const bounded: TerrainMesh = { ...mesh,
      vertices: Array.from({ length: MAX_TERRAIN_VERTEX_COMPONENTS }, (_, index) => triangle[index % 9]!),
      sourceNormals: Array.from({ length: MAX_TERRAIN_VERTEX_COMPONENTS }, (_, index) => index % 3 === 2 ? 1 : 0),
      triangleFeatures: Array(MAX_TERRAIN_TRIANGLES).fill(mesh.triangleFeatures[0]!),
      triangleMaterials: Array(MAX_TERRAIN_TRIANGLES).fill(mesh.triangleMaterials[0]!),
    };
    expect(MAX_TERRAIN_TRIANGLES).toBe(40_000);
    expect(parseTerrainMesh(bounded, pkg).sourceNormals).toHaveLength(360_000);
    const oversized = { ...bounded, vertices: [...bounded.vertices, ...triangle],
      sourceNormals: [...bounded.sourceNormals!, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      triangleFeatures: [...bounded.triangleFeatures, bounded.triangleFeatures[0]!],
      triangleMaterials: [...bounded.triangleMaterials, bounded.triangleMaterials[0]!],
    };
    expect(() => parseTerrainMesh(oversized, pkg)).toThrow();
  });
  it('interpolates an analytic sloped surface and leaves points outside it unknown', () => {
    const triangle = { ...mesh, vertices: [0, 0, 100, 10, 0, 110, 0, 10, 120], triangleFeatures: [0] };
    expect(terrainHeight(triangle, [2, 3])).toBeCloseTo(108, 10);
    expect(terrainHeight(triangle, [0, 0])).toBe(100);
    expect(terrainHeight(triangle, [10, 10])).toBeNull();
    expect(terrainHeight(triangle, [NaN, 0])).toBeNull();
  });
  it('uses independent source-grid samples and preserves nodata instead of filling it from display triangles', () => {
    const triangle: TerrainMesh = { ...mesh, vertices: [0, 0, 100, 10, 0, 110, 0, 10, 120], triangleFeatures: [0],
      metricGrid: { originM: [0, 0], spacingM: 10, columns: 2, rows: 2, heightsM: [200, 210, 220, 230] } };
    expect(terrainHeight(triangle, [2, 3])).toBeCloseTo(208, 10);
    triangle.metricGrid!.heightsM[3] = null;
    expect(terrainHeight(triangle, [2, 3])).toBeNull();
    expect(terrainHeight(triangle, [11, 0])).toBeNull();
  });
  it('derives per-vertex source normals from the metric grid when the package carries no array', () => {
    // z = 100 + .5x + .2y on a 10 m grid: every vertex normal is the plane normal.
    const grid = { originM: [0, 0] as [number, number], spacingM: 10, columns: 3, rows: 3,
      heightsM: [100, 105, 110, 102, 107, 112, 104, 109, 114] };
    const plane: TerrainMesh = { ...mesh, vertices: [0, 0, 100, 10, 0, 105, 0, 10, 102, 10, 10, 107, 20, 20, 114, 20, 0, 110], triangleFeatures: [0, 0], triangleMaterials: [0, 0], metricGrid: grid, sourceNormals: undefined };
    const normals = sourceVertexNormals(plane)!;
    const expected = [-.5, -.2, 1].map(c => c / Math.hypot(.5, .2, 1));
    expect(normals.length).toBe(plane.vertices.length);
    for (let i = 0; i < normals.length; i += 3) for (let c = 0; c < 3; c++) expect(normals[i + c]).toBeCloseTo(expected[c]!, 5);
    // A package array still wins; a mesh with neither answers null.
    const legacy = { ...plane, sourceNormals: Array.from({ length: plane.vertices.length }, (_, i) => i % 3 === 2 ? 1 : 0) };
    expect(Array.from(sourceVertexNormals(legacy)!.slice(0, 3))).toEqual([0, 0, 1]);
    expect(sourceVertexNormals({ ...plane, metricGrid: undefined })).toBeNull();
  });

  it('validates source normals and additional context associations without assigning them to the played hole', () => {
    const expanded = structuredClone(mesh);
    expanded.sourceNormals = Array.from({ length: mesh.vertices.length }, (_, index) => index % 3 === 2 ? 1 : 0);
    const other = pkg.features.find(feature => feature.kind !== 'route' && !scene.hole.featureIds.includes(feature.id))!;
    expanded.contextFeatureIds = [other.id];
    expanded.featureIds.push(other.id);
    expanded.featureKinds.push(other.kind as TerrainMesh['featureKinds'][number]);
    expect(parseTerrainMesh(expanded, pkg).contextFeatureIds).toEqual([other.id]);
    expect(scene.hole.featureIds).not.toContain(other.id);
    for (const change of [
      (value: TerrainMesh) => { value.sourceNormals!.pop(); },
      (value: TerrainMesh) => { value.sourceNormals![2] = -.999; },
      (value: TerrainMesh) => { value.sourceNormals![2] = .7; },
      (value: TerrainMesh) => { value.contextFeatureIds = [other.id, other.id]; },
      (value: TerrainMesh) => { value.contextFeatureIds = ['unknown-feature']; },
      (value: TerrainMesh) => { value.contextFeatureIds = [scene.hole.routeFeatureId!]; },
      (value: TerrainMesh) => { value.featureKinds[value.featureKinds.length - 1] = other.kind === 'green' ? 'bunker' : 'green'; },
    ]) {
      const invalid = structuredClone(expanded); change(invalid);
      expect(() => parseTerrainMesh(invalid, pkg)).toThrow();
    }
  });
  it('has an orthonormal, finite basis even at exact Top', () => {
    fc.assert(fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
      fc.double({ min: 20, max: 90, noNaN: true }), (angle, pitch) => {
        const { right, up, forward } = terrainBasis(angle, pitch);
        for (const p of [right, up, forward]) expect(Math.hypot(...p)).toBeCloseTo(1, 10);
        for (const [a, b] of [[right, up], [right, forward], [up, forward]]) expect(a!.reduce((n, v, i) => n + v * b![i]!, 0)).toBeCloseTo(0, 10);
      }), { seed: 1939, numRuns: 100 });
    expect(Object.values(terrainBasis(0, 90)).flat().every(Number.isFinite)).toBe(true);
  });
  it('preserves metric XY scale in Top; tilted views foreshorten rather than alter measurements', () => {
    const top = fitTerrainCamera(scene, mesh, 'hole', 390, 460, TERRAIN_PRESETS.top);
    const a: Point3M = [10, 20, 265], b: Point3M = [160 * .9144 + 10, 20, 265];
    const pa = projectTerrainPoint(a, top), pb = projectTerrainPoint(b, top);
    expect(Math.hypot(pa[0] - pb[0], pa[1] - pb[1])).toBeCloseTo(160 * .9144 * top.scale, 8);
    const elevated = projectTerrainPoint([a[0], a[1], a[2] + 20], top);
    expect(Math.hypot(pa[0] - elevated[0], pa[1] - elevated[1])).toBeLessThan(1e-8);
    const basis = terrainBasis(0, 20);
    expect(basis.up[1]).toBeCloseTo(Math.sin(20 * Math.PI / 180), 12);
  });
  it('CPU anchors/export and GPU vertices use exactly the same projection', () => {
    for (const pose of Object.values(TERRAIN_PRESETS)) {
      const camera = fitTerrainCamera(scene, mesh, 'green', 390, 460, pose, 1.4, [8, -9]);
      for (let i = 0; i < mesh.vertices.length; i += 180) {
        const p = mesh.vertices.slice(i, i + 3) as unknown as Point3M;
        const m = camera.matrix, cpu = projectTerrainPoint(p, camera);
        // Homogeneous clip coordinates: w is 1 for orthographic and the eye
        // depth for perspective, so one check covers both projections.
        const clipW = m[3]!*p[0]+m[7]!*p[1]+m[11]!*p[2]+m[15]!;
        const clipX = (m[0]!*p[0]+m[4]!*p[1]+m[8]!*p[2]+m[12]!) / clipW;
        const clipY = (m[1]!*p[0]+m[5]!*p[1]+m[9]!*p[2]+m[13]!) / clipW;
        // Relative tolerance: a perspective lens sends a vertex behind the eye to
        // millions of pixels, where absolute 1e-8 agreement is below Float64.
        const close = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(5e-9 * Math.max(1, Math.abs(expected)));
        close((clipX + 1) * 390 / 2, cpu[0]);
        close((1 - clipY) * 460 / 2, cpu[1]);
      }
    }
  });
  it('never changes raw evidence or resolves an endpoint when tilt or height changes', () => {
    const before = structuredClone(scene);
    for (const pose of Object.values(TERRAIN_PRESETS)) {
      fitTerrainCamera(scene, mesh, 'hole', 375, 420, pose);
      fitTerrainCamera(scene, mesh, 'green', 430, 500, { ...pose, exaggeration: 1 });
    }
    expect(scene).toEqual(before);
    expect(scene.events[0]!.anchorM).toBeNull();
    expect(scene.events[0]!.evidence.after.originalValue).toBe(17);
    expect(scene.events[0]!.evidence.miss).toBe('short_right');
    expect(scene.target.kind).toBe('unknown_pin');
  });
  it('bounds orbit and scale and refuses degenerate viewports', () => {
    for (const pose of [{ pitch: 0, yawOffset: 0, exaggeration: 1 }, { pitch: 50, yawOffset: 46, exaggeration: 1 },
      { pitch: 50, yawOffset: 0, exaggeration: 3 }, { pitch: NaN, yawOffset: 0, exaggeration: 1 }]) {
      expect(() => fitTerrainCamera(scene, mesh, 'hole', 390, 460, pose)).toThrow();
    }
    expect(() => fitTerrainCamera(scene, mesh, 'hole', 10, 460, TERRAIN_PRESETS.top)).toThrow();
  });
  it('keeps illustrative canopy bases in reviewed masks and stable across orbit', () => {
    const camera = fitTerrainCamera(scene, mesh, 'hole', 390, 480, TERRAIN_PRESETS.top);
    const canopy = terrainCanopy(scene, mesh, camera);
    expect(canopy.crowns.length).toBeGreaterThan(0);
    expect(canopy.crowns.length).toBeLessThanOrEqual(240);
    for (const crown of canopy.crowns) {
      const x = (crown.x - camera.translation[0]) / camera.scale;
      const y = (camera.translation[1] - crown.y) / camera.scale;
      const point = [x * camera.right[0] + y * camera.up[0], x * camera.right[1] + y * camera.up[1]] as const;
      expect(scene.features.some(f => f.kind === 'woods' && f.reviewed && inFeature(point, f))).toBe(true);
      expect(scene.features.some(f => !['woods', 'route'].includes(f.kind) && inFeature(point, f))).toBe(false);
    }
    const side = terrainCanopy(scene, mesh, fitTerrainCamera(scene, mesh, 'hole', 390, 480, TERRAIN_PRESETS.side));
    expect(side.crowns.map(c => c.id).sort()).toEqual(canopy.crowns.map(c => c.id).sort());
    expect(canopy.guardPaths.length).toBeGreaterThan(0);
    expect(scene.events.every(e => e.anchorM == null)).toBe(true);
  });
});

describe('orientation visibility (Meridian §11)', () => {
  it('woods in front of a target toward the camera count as occlusion, woods behind it do not', () => {
    const block: [number, number][] = [[10, -5], [30, -5], [30, 5], [10, 5]];
    const towardBlock = -Math.PI / 2;    // probe walks +x
    const awayFromBlock = Math.PI / 2;   // probe walks -x
    expect(woodsOcclusion([block], [0, 0], towardBlock, 44)).toBeGreaterThan(.15);
    expect(woodsOcclusion([block], [0, 0], awayFromBlock, 44)).toBe(0);
    expect(woodsOcclusion([block], [0, 0], towardBlock, 90)).toBe(0);
    expect(woodsOcclusion([], [0, 0], towardBlock, 44)).toBe(0);
  });
  it('a lower pitch probes farther, so distant woods start to matter', () => {
    const block: [number, number][] = [[20, -5], [40, -5], [40, 5], [20, 5]];
    expect(woodsOcclusion([block], [0, 0], -Math.PI / 2, 44)).toBe(0);
    expect(woodsOcclusion([block], [0, 0], -Math.PI / 2, 20)).toBeGreaterThan(0);
  });
  it('whole-hole framing still fits every tactical point after the visibility term', () => {
    const camera = fitTerrainCamera(scene, mesh, 'hole', 390, 700, TERRAIN_PRESETS.terrain, 1, [0, 0], 'terrain');
    expect(camera.forward.every(Number.isFinite)).toBe(true);
    const green = scene.features.find(f => f.kind === 'green')!.parts[0]![0]!;
    for (const [x, y] of green) {
      const z = terrainHeight(mesh, [x, y])!;
      const [sx, sy] = projectTerrainPoint([x, y, z], camera);
      expect(sx).toBeGreaterThanOrEqual(0); expect(sx).toBeLessThanOrEqual(390);
      expect(sy).toBeGreaterThanOrEqual(0); expect(sy).toBeLessThanOrEqual(700);
    }
  });
});
