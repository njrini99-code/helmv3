import { CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, TubeGeometry, Vector3 } from 'three';
import { terrainHeight, type TerrainCamera, type TerrainMesh } from './terrain';
import type { HoleScene, PointM } from './types';

export interface ThreeFlightPaths {
  group: Group;
  /** Count of display-only estimated arcs, never a count of recorded flights. */
  count: number;
  dispose(): void;
}

const maxApexM = 52;

function horizontalLength(points: readonly PointM[]): number {
  return points.slice(1).reduce((total, point, index) =>
    total + Math.hypot(point[0] - points[index]![0], point[1] - points[index]![1]), 0);
}

function displayGroundZ(mesh: TerrainMesh, point: PointM, camera: Pick<TerrainCamera, 'exaggeration' | 'referenceElevationM'>): number | null {
  const sourceZ = terrainHeight(mesh, point);
  return sourceZ == null ? null : camera.referenceElevationM + (sourceZ - camera.referenceElevationM) * camera.exaggeration;
}

/**
 * Builds a display-only ball-flight arc for the isolated interactive fixture.
 * Its horizontal points are the existing result-derived preview points. The
 * vertical arc makes that estimate intelligible in Terrain/Side while keeping
 * all true terrain, shot locations and distances untouched. It intentionally
 * lives outside the SVG annotation layer so it can be depth-tested as 3D.
 */
export function buildThreeFlightPaths(scene: HoleScene, mesh: TerrainMesh,
  camera: Pick<TerrainCamera, 'exaggeration' | 'referenceElevationM' | 'scale'>, selectedShotNumber?: number): ThreeFlightPaths {
  const group = new Group();
  group.name = 'illustrative-shot-flight-paths';
  const geometries: TubeGeometry[] = [], materials: MeshStandardMaterial[] = [];
  let count = 0;
  const activeShotNumber = selectedShotNumber ?? scene.illustrativePreviewTrajectories?.at(-1)?.shotNumber;
  for (const trajectory of scene.illustrativePreviewTrajectories ?? []) {
    if (trajectory.source !== 'interactive_preview_fixture' || trajectory.pointsM.length < 2) continue;
    const ground = trajectory.pointsM.map(point => displayGroundZ(mesh, point, camera));
    if (ground.some(height => height == null)) continue;
    const length = horizontalLength(trajectory.pointsM);
    if (!Number.isFinite(length) || length < .01) continue;
    // A restrained launch height keeps the trace thin and readable at
    // whole-hole scale. This is a visual estimate, never carry evidence.
    const apexM = Math.min(maxApexM, Math.max(14, length * .18));
    const displayPoints = trajectory.pointsM.map((point, index) => {
      const t = index / (trajectory.pointsM.length - 1);
      const lift = apexM * 4 * t * (1 - t);
      return new Vector3(point[0], point[1], ground[index]! + lift);
    });
    const curve = new CatmullRomCurve3(displayPoints, false, 'centripetal');
    const active = trajectory.shotNumber === activeShotNumber;
    // TubeGeometry width is in world meters. Derive it from the current
    // orthographic scale so the stroke remains about two CSS pixels, rather
    // than disappearing below a pixel in the compact phone map.
    const radiusM = Math.max(.34, Math.min(2.2, .95 / camera.scale)) * (active ? 1 : .82);
    const geometry = new TubeGeometry(curve, 48, radiusM, 6, false);
    const material = new MeshStandardMaterial({ color: active ? '#FFF9E8' : '#D7D5CB',
      emissive: '#2F4933', emissiveIntensity: .14, roughness: .44, metalness: 0 });
    const arc = new Mesh(geometry, material);
    arc.name = `illustrative-shot-flight-${trajectory.shotNumber}`;
    arc.castShadow = false;
    arc.receiveShadow = false;
    arc.renderOrder = 2;
    arc.userData = {
      trajectorySource: 'interactive_preview_fixture', shotNumber: trajectory.shotNumber,
      visualApexM: apexM, visualRadiusM: radiusM, displayPointsM: displayPoints.map(point => [point.x, point.y, point.z]),
    };
    group.add(arc); geometries.push(geometry); materials.push(material); count++;
  }
  group.userData = { trajectorySource: 'interactive_preview_fixture', count };
  return { group, count, dispose() {
    group.removeFromParent(); group.clear();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  } };
}
