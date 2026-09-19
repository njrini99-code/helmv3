import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { parseGeometryPackage } from '../schema';
import { parseTerrainMesh, projectTerrainPoint, terrainHeight, TERRAIN_PRESETS } from '../terrain';
import { fitTerrainViewportCamera } from '../terrain-viewport';
import { contextPoints } from '../camera';
import course from '@/test/fixtures/course-geometry/cacapon.json';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';
const pkg = parseGeometryPackage(course), mesh = parseTerrainMesh(source, pkg);
const scene = buildHoleScene(pkg, 'cacapon-07', [], mesh);

describe('inspector-aware course viewport', () => {
  it('keeps GPU clip coordinates and world annotations coincident inside the reserved header', () => {
    for (const [width, height] of [[320, 320], [390, 650], [820, 700]]) for (const pose of Object.values(TERRAIN_PRESETS)) {
      const camera = fitTerrainViewportCamera(scene, mesh, 'hole', width!, height!, pose, 1.2, [4, -7]);
      const m = camera.matrix;
      for (let i = 0; i < mesh.vertices.length; i += 90) {
        const [x, y, z] = mesh.vertices.slice(i, i + 3) as [number, number, number];
        const point = projectTerrainPoint([x, y, z], camera);
        const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
        expect(((m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w + 1) * width! / 2).toBeCloseTo(point[0], 8);
        expect((1 - (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w) * height! / 2).toBeCloseTo(point[1], 8);
      }
      const focus = projectTerrainPoint(camera.focusM, camera);
      // Orthographic: the pivot sits at the safe-area centre plus pan. A
      // perspective lens keeps its eye axis through the pivot, so the pivot
      // lands on the principal point (translation) instead.
      if (camera.projection === 'perspective') {
        expect(focus[0]).toBeCloseTo(camera.translation[0], 8);
        expect(focus[1]).toBeCloseTo(camera.translation[1], 8);
      } else expect(focus[0]).toBeCloseTo((width! - 52) / 2 + 4, 8);
      expect(focus[1]).toBeGreaterThan(height! / 2);
    }
  });
  it('keeps the entire tactical footprint clear of the right control rail in every preset', () => {
    for (const [width, height] of [[320, 380], [375, 580], [390, 640], [430, 700], [980, 680]]) {
      for (const preset of ['top', 'terrain', 'side'] as const) for (const area of ['hole', 'approach', 'green'] as const) {
        const camera = fitTerrainViewportCamera(scene, mesh, area, width!, height!, TERRAIN_PRESETS[preset], 1, [0, 0], preset);
        for (const point of contextPoints(scene, area)) {
          const z = terrainHeight(mesh, point);
          expect(z).not.toBeNull();
          const projected = projectTerrainPoint([point[0], point[1], z!], camera);
          // 64px rail plus a 24px annotation margin, including the active tee.
          expect(projected[0]).toBeLessThanOrEqual(width! - 88 + 1e-7);
          expect(projected[0]).toBeGreaterThanOrEqual(36 - 1e-7);
          expect(projected[1]).toBeGreaterThanOrEqual(Math.min(88, height! * .24) + 24 - 1e-7);
          expect(projected[1]).toBeLessThanOrEqual(height! - 48 + 1e-7);
        }
      }
    }
  });
  it('changes the camera, never source coordinates, when the inspector reserves more room', () => {
    const original = [...mesh.vertices];
    const large = fitTerrainViewportCamera(scene, mesh, 'hole', 390, 640, TERRAIN_PRESETS.top);
    const small = fitTerrainViewportCamera(scene, mesh, 'hole', 390, 380, TERRAIN_PRESETS.top);
    expect(small.scale).toBeLessThan(large.scale);
    expect(mesh.vertices).toEqual(original);
    expect(scene.events).toEqual([]);
  });
});
