import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseGeometryPackage } from '../schema';
import { buildHoleScene } from '../build-scene';
import { normalizePersistedShot } from '../normalize';
import { fitTerrainCamera, parseTerrainMesh, projectTerrainPoint, terrainBasis, terrainHeight, TERRAIN_PRESETS } from '../terrain';
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
    expect(mesh.triangleFeatures.length).toBeLessThan(20000);
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
  it('interpolates an analytic sloped surface and leaves points outside it unknown', () => {
    const triangle = { ...mesh, vertices: [0, 0, 100, 10, 0, 110, 0, 10, 120], triangleFeatures: [0] };
    expect(terrainHeight(triangle, [2, 3])).toBeCloseTo(108, 10);
    expect(terrainHeight(triangle, [0, 0])).toBe(100);
    expect(terrainHeight(triangle, [10, 10])).toBeNull();
    expect(terrainHeight(triangle, [NaN, 0])).toBeNull();
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
        const clipX = m[0]!*p[0]+m[4]!*p[1]+m[8]!*p[2]+m[12]!;
        const clipY = m[1]!*p[0]+m[5]!*p[1]+m[9]!*p[2]+m[13]!;
        expect((clipX + 1) * 390 / 2).toBeCloseTo(cpu[0], 8);
        expect((1 - clipY) * 460 / 2).toBeCloseTo(cpu[1], 8);
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
