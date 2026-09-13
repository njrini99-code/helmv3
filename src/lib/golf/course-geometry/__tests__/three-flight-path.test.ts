import { Line, Mesh, MeshBasicMaterial } from 'three';
import { addInteractivePreviewTrajectories, pilotPackage, pilotShots } from '@/test/fixtures/course-geometry/pilot';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';
import { buildHoleScene } from '../build-scene';
import { buildThreeFlightPaths } from '../three-flight-path';
import { parseTerrainMesh, terrainHeight } from '../terrain';

const mesh = parseTerrainMesh(source, pilotPackage);

describe('Three illustrative flight paths', () => {
  it('renders a depth-tested elevated arc from the result-derived world points', () => {
    const scene = addInteractivePreviewTrajectories(buildHoleScene(pilotPackage, 'cacapon-07', [], mesh), [pilotShots[0]!]);
    const flightPaths = buildThreeFlightPaths(scene, mesh, { exaggeration: 1.5, referenceElevationM: mesh.referenceElevationM, scale: .5 });
    try {
      expect(flightPaths.count).toBe(1);
      const arc = flightPaths.group.getObjectByName('illustrative-shot-flight-1') as Mesh;
      expect(arc.name).toBe('illustrative-shot-flight-1');
      expect(arc.castShadow).toBe(false);
      expect(arc.receiveShadow).toBe(false);
      const points = arc.userData.displayPointsM as [number, number, number][];
      const startGround = terrainHeight(mesh, [points[0]![0], points[0]![1]])!;
      const end = points.at(-1)!, endGround = terrainHeight(mesh, [end[0], end[1]])!;
      expect(points[0]![2]).toBeCloseTo(mesh.referenceElevationM + (startGround - mesh.referenceElevationM) * 1.5, 6);
      expect(end[2]).toBeCloseTo(mesh.referenceElevationM + (endGround - mesh.referenceElevationM) * 1.5, 6);
      expect(points[Math.floor(points.length / 2)]![2]).toBeGreaterThan(points[0]![2] + 10);
      expect(arc.userData.visualApexM).toBeGreaterThanOrEqual(14);
      expect(arc.userData.visualRadiusM).toBeCloseTo(1.3, 6);
      const footprint = flightPaths.group.getObjectByName('illustrative-shot-footprint-1') as Line;
      const origin = flightPaths.group.getObjectByName('illustrative-shot-origin-1') as Mesh;
      const finish = flightPaths.group.getObjectByName('illustrative-shot-finish-1') as Mesh;
      expect(footprint.userData.kind).toBe('selected_ground_footprint');
      expect(origin.userData.kind).toBe('origin_marker');
      expect(finish.userData.kind).toBe('estimated_finish_marker');
      expect(origin.position.z).toBeGreaterThan(points[0]![2]);
      expect(finish.position.z).toBeCloseTo(points.at(-1)![2] + .16, 6);
    } finally { flightPaths.dispose(); }
  });

  it('keeps selected arc emphasis separate from the immutable source scene', () => {
    const sourceScene = addInteractivePreviewTrajectories(buildHoleScene(pilotPackage, 'cacapon-07', [], mesh), pilotShots);
    const snapshot = structuredClone(sourceScene);
    const flightPaths = buildThreeFlightPaths(sourceScene, mesh, { exaggeration: 1, referenceElevationM: mesh.referenceElevationM, scale: 2 }, 1);
    try {
      const active = flightPaths.group.getObjectByName('illustrative-shot-flight-1') as Mesh | undefined;
      const inactive = flightPaths.group.getObjectByName('illustrative-shot-flight-2') as Mesh | undefined;
      expect(active).toBeDefined();
      expect(inactive).toBeDefined();
      if (!active || !inactive) throw new Error('Expected two flight arcs');
      expect(active.material).not.toBe(inactive.material);
      expect((active.material as MeshBasicMaterial).vertexColors).toBe(true);
      expect((inactive.material as MeshBasicMaterial).opacity).toBeCloseTo(.48, 6);
      expect(active.geometry.getAttribute('color')).toBeDefined();
      expect(flightPaths.group.getObjectByName('illustrative-shot-footprint-1')).toBeDefined();
      expect(flightPaths.group.getObjectByName('illustrative-shot-footprint-2')).toBeUndefined();
      expect(flightPaths.group.getObjectByName('illustrative-shot-origin-1')).toBeDefined();
      expect(flightPaths.group.getObjectByName('illustrative-shot-finish-2')).toBeDefined();
      expect(sourceScene).toEqual(snapshot);
    } finally { flightPaths.dispose(); }
  });
});
