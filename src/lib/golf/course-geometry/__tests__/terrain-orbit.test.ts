import { describe, expect, it } from 'vitest';
import { buildHoleScene } from '../build-scene';
import { parseGeometryPackage } from '../schema';
import { fitTerrainCamera, parseTerrainMesh, projectTerrainPoint, TERRAIN_PRESETS, type Point3M } from '../terrain';
import { terrainCanopy } from '../terrain-canopy';
import { contextPoints } from '../camera';
import { terrainHeight } from '../terrain';
import course from '@/test/fixtures/course-geometry/cacapon.json';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';

const pkg = parseGeometryPackage(course);
const mesh = parseTerrainMesh(source, pkg);
const scene = buildHoleScene(pkg, 'cacapon-07', [], mesh);

describe('stable orthographic orbit', () => {
  it('changes view direction without zoom breathing or moving the world focus', () => {
    const first = fitTerrainCamera(scene, mesh, 'hole', 390, 480, TERRAIN_PRESETS.top, 1.4, [12, -8]);
    for (const pitch of [20, 35, 50, 75, 90]) for (const yawOffset of [-45, 0, 45]) {
      const camera = fitTerrainCamera(scene, mesh, 'hole', 390, 480, { pitch, yawOffset, exaggeration: 1.5 }, 1.4, [12, -8]);
      expect(camera.scale).toBe(first.scale);
      expect(camera.focusM).toEqual(first.focusM);
      const [x, y] = projectTerrainPoint(first.focusM, camera);
      expect(x).toBeCloseTo(207, 10);
      expect(y).toBeCloseTo(232, 10);
    }
  });

  it('preserves 150/350 physical progress and real scale during yaw; tilt has analytic foreshortening', () => {
    const top = fitTerrainCamera(scene, mesh, 'hole', 390, 480, TERRAIN_PRESETS.top);
    const metresPerYard = .9144;
    const start: Point3M = [0, 0, mesh.referenceElevationM];
    const end: Point3M = [0, 350 * metresPerYard, mesh.referenceElevationM];
    const shot: Point3M = [0, 150 * metresPerYard, mesh.referenceElevationM];
    for (const yawOffset of [-45, 0, 45]) {
      const camera = fitTerrainCamera(scene, mesh, 'hole', 390, 480, { ...TERRAIN_PRESETS.top, yawOffset });
      const a = projectTerrainPoint(start, camera), b = projectTerrainPoint(end, camera), p = projectTerrainPoint(shot, camera);
      const travel = Math.hypot(p[0] - a[0], p[1] - a[1]);
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      expect(travel).toBeCloseTo(150 * metresPerYard * top.scale, 9);
      expect(travel / length).toBeCloseTo(150 / 350, 12);
    }
    // The analytic orthographic foreshortening check uses an explicit
    // orthographic side pose; the shipped Side preset is a perspective lens.
    const tilted = fitTerrainCamera(scene, mesh, 'hole', 390, 480, { pitch: 20, yawOffset: 30, exaggeration: 1.5, projection: 'orthographic' });
    const flat: Point3M = [tilted.focusM[0], tilted.focusM[1], tilted.focusM[2]];
    const forwardOnGround: Point3M = [flat[0] + Math.sin(Math.atan2(tilted.up[0], tilted.up[1])) * 100,
      flat[1] + Math.cos(Math.atan2(tilted.up[0], tilted.up[1])) * 100, flat[2]];
    const a = projectTerrainPoint(flat, tilted), b = projectTerrainPoint(forwardOnGround, tilted);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(100 * Math.sin(20 * Math.PI / 180) * top.scale, 9);
  });

  it('uses explicit zoom only, with unchanged focus and original elevation vertices', () => {
    const vertices = [...mesh.vertices];
    const normal = fitTerrainCamera(scene, mesh, 'green', 430, 520, TERRAIN_PRESETS.terrain);
    const zoomed = fitTerrainCamera(scene, mesh, 'green', 430, 520, TERRAIN_PRESETS.terrain, 2);
    expect(zoomed.scale).toBe(normal.scale * 2);
    expect(zoomed.focusM).toEqual(normal.focusM);
    expect(mesh.vertices).toEqual(vertices);
  });

  it('allows explicit zooming out to inspect a rotated hole without changing the orbit lens', () => {
    const pose = { pitch: 50, yawOffset: -45, exaggeration: 1.5 };
    const normal = fitTerrainCamera(scene, mesh, 'hole', 390, 594, pose);
    const wide = fitTerrainCamera(scene, mesh, 'hole', 390, 594, pose, .5);
    expect(wide.scale).toBe(normal.scale / 2);
    expect(wide.focusM).toEqual(normal.focusM);
    for (const point of contextPoints(scene, 'hole')) {
      const [x, y] = projectTerrainPoint([point[0], point[1], terrainHeight(mesh, point)!], wide);
      expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(390);
      expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(594);
    }
    expect(() => fitTerrainCamera(scene, mesh, 'hole', 390, 594, pose, .49)).toThrow('Invalid terrain camera');
    expect(() => fitTerrainCamera(scene, mesh, 'hole', 390, 594, pose, 4.01)).toThrow('Invalid terrain camera');
  });
});

describe('world-anchored illustrative canopy', () => {
  it('projects each base and elevated crown centre through the same camera as the terrain', () => {
    for (const pose of Object.values(TERRAIN_PRESETS)) {
      const camera = fitTerrainCamera(scene, mesh, 'hole', 390, 480, pose);
      const canopy = terrainCanopy(scene, mesh, camera);
      expect(canopy.crowns.length).toBeGreaterThan(0);
      for (const crown of canopy.crowns) {
        const base = projectTerrainPoint(crown.worldBaseM, camera);
        expect(crown.base).toEqual(base.slice(0, 2));
        expect(crown.depth).toBeCloseTo(base[2] - Math.sin(pose.pitch * Math.PI / 180) * crown.illustrativeHeightM, 9);
        if (pose.projection === 'perspective') {
          // A perspective crown is the projected lifted world point, sized by its own depth.
          const lifted = projectTerrainPoint(crown.worldBaseM, camera, crown.illustrativeHeightM);
          expect(crown.centre[0]).toBeCloseTo(lifted[0], 9); expect(crown.centre[1]).toBeCloseTo(lifted[1], 9);
          expect(crown.heightPx).toBeCloseTo(Math.hypot(lifted[0] - base[0], lifted[1] - base[1]), 9);
          expect(crown.radius).toBeGreaterThan(0);
          continue;
        }
        expect(crown.centre[0]).toBeCloseTo(base[0], 10); // Z-up crown stays directly above its world base.
        expect(crown.centre[1]).toBeCloseTo(base[1] - crown.illustrativeHeightM * Math.cos(pose.pitch * Math.PI / 180) * camera.scale, 9);
        expect(crown.heightPx).toBeCloseTo(crown.illustrativeHeightM * Math.cos(pose.pitch * Math.PI / 180) * camera.scale, 9);
      }
    }
  });

  it('changes ground relief without stretching local crown heights or moving the world sun', () => {
    const pose = { pitch: 50, yawOffset: 20, exaggeration: 1 };
    const a = terrainCanopy(scene, mesh, fitTerrainCamera(scene, mesh, 'hole', 390, 480, pose));
    const b = terrainCanopy(scene, mesh, fitTerrainCamera(scene, mesh, 'hole', 390, 480, { ...pose, exaggeration: 1.5 }));
    const first = a.crowns[0]!, second = b.crowns.find(crown => crown.id === first.id)!;
    expect(first.worldBaseM).toEqual(second.worldBaseM);
    expect(first.illustrativeHeightM).toEqual(second.illustrativeHeightM);
    expect(first.heightPx).toBeCloseTo(second.heightPx, 9);
    expect(first.lightScreen).toEqual(second.lightScreen);
  });

  it('rotates world lighting and ground shadows with yaw instead of fixing them to the screen', () => {
    const a = terrainCanopy(scene, mesh, fitTerrainCamera(scene, mesh, 'hole', 390, 480, { ...TERRAIN_PRESETS.top, yawOffset: -30 }));
    const b = terrainCanopy(scene, mesh, fitTerrainCamera(scene, mesh, 'hole', 390, 480, { ...TERRAIN_PRESETS.top, yawOffset: 30 }));
    const first = a.crowns.find(c => c.shadow && c.shadowBasis)!;
    const second = b.crowns.find(c => c.id === first.id)!;
    expect(second.worldBaseM).toEqual(first.worldBaseM);
    expect(second.illustrativeHeightM).toEqual(first.illustrativeHeightM);
    const dot = first.lightScreen[0] * second.lightScreen[0] + first.lightScreen[1] * second.lightScreen[1];
    expect(dot).toBeCloseTo(Math.cos(Math.PI / 3), 9);
    const da = [first.shadow![0] - first.base[0], first.shadow![1] - first.base[1]];
    const db = [second.shadow![0] - second.base[0], second.shadow![1] - second.base[1]];
    expect(Math.hypot(...da)).toBeCloseTo(Math.hypot(...db), 9);
    expect(second.shadowBasis!.right).not.toEqual(first.shadowBasis!.right);
  });

  it('does not retain approved crowns when another scene withdraws canopy review', () => {
    const camera = fitTerrainCamera(scene, mesh, 'hole', 390, 480, TERRAIN_PRESETS.top);
    expect(terrainCanopy(scene, mesh, camera).crowns.length).toBeGreaterThan(0);
    const unreviewed = { ...scene, features: scene.features.map(feature => ({ ...feature, reviewed: false })) };
    expect(terrainCanopy(unreviewed, mesh, camera).crowns).toEqual([]);
    expect(terrainCanopy(scene, mesh, camera).crowns.length).toBeGreaterThan(0);
  });
});
