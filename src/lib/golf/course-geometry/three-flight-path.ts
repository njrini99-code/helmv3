import {
  BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Group, Line, LineDashedMaterial, Material,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry,
  TubeGeometry, Vector3,
} from 'three';
import { terrainHeight, type TerrainCamera, type TerrainMesh } from './terrain';
import type { HoleScene, PointM } from './types';

export interface ThreeFlightPaths {
  group: Group;
  /** Count of display-only estimated arcs, never a count of recorded flights. */
  count: number;
  dispose(): void;
}

const maxApexM = 52;
const markerGroundOffsetM = .16;

function displayMarkerScale(camera: Pick<TerrainCamera, 'scale'>, cssRadius: number): number {
  return Math.max(.45, Math.min(4, cssRadius / Math.max(.1, camera.scale)));
}

function paintFlightGradient(geometry: TubeGeometry, active: boolean): void {
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  const uv = geometry.getAttribute('uv');
  // Keep the selected flight in the GolfHelm landscape palette. The previous
  // near-white apex looked metallic against the grass at phone scale.
  const launch = new Color(active ? '#0FAE7B' : '#76906D');
  const apex = new Color(active ? '#9DD442' : '#AAB49D');
  const finish = new Color(active ? '#14B5D1' : '#76906D');
  const color = new Color();
  for (let index = 0; index < colors.length / 3; index++) {
    const t = uv.getX(index);
    if (t < .5) color.copy(launch).lerp(apex, t * 2);
    else color.copy(apex).lerp(finish, (t - .5) * 2);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
}

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
  const geometries: BufferGeometry[] = [], materials: Material[] = [];
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
    // TubeGeometry width is in world meters. Derive it from the opening
    // orthographic scale so the selected trace reads as a restrained 2–3px
    // stroke in the expanded phone view, not a heavy world-space pipe.
    const radiusM = Math.max(.24, Math.min(1.15, .65 / camera.scale)) * (active ? 1 : .7);
    const geometry = new TubeGeometry(curve, 48, radiusM, 6, false);
    paintFlightGradient(geometry, active);
    // The flight is a display-only estimate. Use an unlit color trail instead
    // of a lit metal-like tube, so it remains fresh and legible as the camera
    // moves through the landscape rather than turning silver in shadow.
    const material = new MeshBasicMaterial({ vertexColors: true, transparent: !active,
      opacity: active ? 1 : .48, depthWrite: active, toneMapped: false });
    const arc = new Mesh(geometry, material);
    arc.name = `illustrative-shot-flight-${trajectory.shotNumber}`;
    arc.castShadow = false;
    arc.receiveShadow = false;
    arc.renderOrder = 2;
    arc.userData = {
      trajectorySource: 'interactive_preview_fixture', shotNumber: trajectory.shotNumber,
      visualApexM: apexM, visualRadiusM: radiusM, displayPointsM: displayPoints.map(point => [point.x, point.y, point.z]),
    };
    if (active) {
      const auraGeometry = new TubeGeometry(curve, 48, radiusM * 1.9, 6, false);
      const auraMaterial = new MeshBasicMaterial({ color: '#2FCB93', transparent: true, opacity: .09,
        depthWrite: false, depthTest: true, toneMapped: false });
      const aura = new Mesh(auraGeometry, auraMaterial);
      aura.name = `illustrative-shot-flight-aura-${trajectory.shotNumber}`;
      aura.renderOrder = 1;
      aura.userData = { trajectorySource: 'interactive_preview_fixture', shotNumber: trajectory.shotNumber, kind: 'selected_flight_aura' };
      group.add(aura); geometries.push(auraGeometry); materials.push(auraMaterial);
    }
    group.add(arc); geometries.push(geometry); materials.push(material); count++;

    const groundPoints = trajectory.pointsM.map((point, index) => new Vector3(point[0], point[1], ground[index]! + markerGroundOffsetM));
    if (active) {
      // This is a vertical footprint of the illustrative arc, not a sun
      // shadow. It makes horizontal progress legible in oblique views without
      // turning a multi-shot review into a web of ground lines.
      const projectionGeometry = new BufferGeometry().setFromPoints(groundPoints);
      const projectionMaterial = new LineDashedMaterial({ color: '#E6E0C8', transparent: true, opacity: .48,
        dashSize: 3.2, gapSize: 2.6, scale: 1, depthTest: true, depthWrite: false });
      const projection = new Line(projectionGeometry, projectionMaterial);
      projection.name = `illustrative-shot-footprint-${trajectory.shotNumber}`;
      projection.computeLineDistances();
      projection.renderOrder = 1;
      projection.userData = { trajectorySource: 'interactive_preview_fixture', shotNumber: trajectory.shotNumber,
        kind: 'selected_ground_footprint', groundOffsetM: markerGroundOffsetM };
      group.add(projection); geometries.push(projectionGeometry); materials.push(projectionMaterial);
    }

    const originRadius = displayMarkerScale(camera, active ? 3.2 : 2.4);
    const originGeometry = new SphereGeometry(originRadius, 12, 8);
    const originMaterial = new MeshStandardMaterial({ color: active ? '#FFF9E8' : '#C9D2BA', emissive: '#203427',
      emissiveIntensity: .12, roughness: .5, transparent: !active, opacity: active ? 1 : .68, depthWrite: active });
    const origin = new Mesh(originGeometry, originMaterial);
    origin.name = `illustrative-shot-origin-${trajectory.shotNumber}`;
    origin.position.copy(groundPoints[0]!);
    origin.position.z += originRadius * .82;
    origin.renderOrder = 3;
    origin.userData = { trajectorySource: 'interactive_preview_fixture', shotNumber: trajectory.shotNumber, kind: 'origin_marker' };
    group.add(origin); geometries.push(originGeometry); materials.push(originMaterial);

    // A hollow stop marker makes the inferred finish legible without turning
    // an unresolved result into a solid, authoritative ball observation.
    const finishRadius = displayMarkerScale(camera, active ? 4.5 : 3.3);
    const finishGeometry = new TorusGeometry(finishRadius, Math.max(.16, finishRadius * .16), 8, 20);
    const finishMaterial = new MeshBasicMaterial({ color: active ? '#FFF9E8' : '#BBC5AE', transparent: true,
      opacity: active ? .98 : .55, depthTest: true, depthWrite: false });
    const finish = new Mesh(finishGeometry, finishMaterial);
    finish.name = `illustrative-shot-finish-${trajectory.shotNumber}`;
    finish.position.copy(groundPoints.at(-1)!);
    finish.renderOrder = 3;
    finish.userData = { trajectorySource: 'interactive_preview_fixture', shotNumber: trajectory.shotNumber,
      kind: 'estimated_finish_marker', groundOffsetM: markerGroundOffsetM };
    group.add(finish); geometries.push(finishGeometry); materials.push(finishMaterial);
  }
  group.userData = { trajectorySource: 'interactive_preview_fixture', count };
  return { group, count, dispose() {
    group.removeFromParent(); group.clear();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  } };
}
