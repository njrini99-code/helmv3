import {
  BufferGeometry, CatmullRomCurve3, CircleGeometry, Group, Line, LineDashedMaterial, Material,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry,
  TubeGeometry, Vector3,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { terrainHeight, type TerrainCamera, type TerrainMesh } from './terrain';
import type { HoleScene, PointM } from './types';

export interface ThreeFlightPaths {
  group: Group;
  /** Count of display-only estimated arcs, never a count of recorded flights. */
  count: number;
  /** Count of display-only ground rolls/ball estimates, never measured putts. */
  puttingCount: number;
  /** CSS-pixel line widths need the live terrain viewport to stay thin across
   * the embedded/expanded handoff and resize. */
  setResolution(width: number, height: number): void;
  dispose(): void;
}

const maxApexM = 52;
const markerGroundOffsetM = .16;

function displayMarkerScale(camera: Pick<TerrainCamera, 'scale'>, cssRadius: number): number {
  return Math.max(.45, Math.min(4, cssRadius / Math.max(.1, camera.scale)));
}

function horizontalLength(points: readonly PointM[]): number {
  return points.slice(1).reduce((total, point, index) =>
    total + Math.hypot(point[0] - points[index]![0], point[1] - points[index]![1]), 0);
}

/** A drawn marker sits on the drawn surface (§34): the sampler may lower a
 * point onto a render-only bunker bowl. It never changes the shot's XY, its
 * evidence, or the canonical elevation used anywhere else. */
export type DisplaySurfaceSampler = (point: PointM) => number | null;
function displayGroundZ(mesh: TerrainMesh, point: PointM, camera: Pick<TerrainCamera, 'exaggeration' | 'referenceElevationM'>, surface?: DisplaySurfaceSampler): number | null {
  const sourceZ = surface ? surface(point) : terrainHeight(mesh, point);
  return sourceZ == null ? null : camera.referenceElevationM + (sourceZ - camera.referenceElevationM) * camera.exaggeration;
}

/**
 * Builds display-only ball-flight arcs from the renderer's accepted display
 * anchors. Their vertical arc makes an estimate intelligible in Terrain/Side
 * while keeping true terrain, shot locations, and distances untouched. They
 * intentionally live outside the SVG annotation layer so they depth-test as 3D.
 */
export function buildThreeFlightPaths(scene: HoleScene, mesh: TerrainMesh,
  camera: Pick<TerrainCamera, 'exaggeration' | 'referenceElevationM' | 'scale'>, selectedShotNumber?: number, surface?: DisplaySurfaceSampler): ThreeFlightPaths {
  const group = new Group();
  group.name = 'illustrative-shot-flight-paths';
  const geometries: BufferGeometry[] = [], materials: Material[] = [];
  const lineMaterials: LineMaterial[] = [];
  let count = 0, puttingCount = 0;
  const activeShotNumber = selectedShotNumber ?? [...(scene.illustrativePreviewTrajectories ?? []), ...(scene.illustrativePuttingTracks ?? [])]
    .reduce<number | undefined>((latest, item) => latest == null || item.shotNumber > latest ? item.shotNumber : latest, undefined);
  for (const trajectory of scene.illustrativePreviewTrajectories ?? []) {
    if (trajectory.pointsM.length < 2) continue;
    const ground = trajectory.pointsM.map(point => displayGroundZ(mesh, point, camera, surface));
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
    const linePositions = curve.getPoints(48).flatMap(point => [point.x, point.y, point.z]);
    const addFlightLine = (name: string, color: string, widthPx: number, opacity: number, order: number) => {
      const geometry = new LineGeometry();
      geometry.setPositions(linePositions);
      const material = new LineMaterial({ color, linewidth: widthPx, worldUnits: false, transparent: opacity < 1,
        opacity, depthTest: true, depthWrite: false, toneMapped: false });
      // The runtime replaces this 1×1 bootstrap with its measured CSS viewport
      // before presenting the canvas; keeping this explicit prevents silver,
      // world-meter tubes as the camera zoom changes.
      material.resolution.set(1, 1);
      const line = new Line2(geometry, material);
      line.name = name; line.castShadow = false; line.receiveShadow = false; line.renderOrder = order;
      group.add(line); geometries.push(geometry); materials.push(material); lineMaterials.push(material);
      return line;
    };
    // Selected flight: a sharp white core plus a restrained dark support.
    // Completed history is intentionally thin and does not receive a halo.
    if (active) addFlightLine(`illustrative-shot-flight-halo-${trajectory.shotNumber}`, '#183425', 3.4, .24, 2);
    const visualLineWidthPx = active ? 2.5 : 1.15;
    const arc = addFlightLine(`illustrative-shot-flight-${trajectory.shotNumber}`, active ? '#FFFFFF' : '#D7E1D2',
      visualLineWidthPx, active ? 1 : .52, 3);
    arc.userData = {
      trajectorySource: trajectory.source, estimated: trajectory.source === 'reconstruction_display_estimate', shotNumber: trajectory.shotNumber,
      // §60: the arc is a chord with a stylised lift, never a measured flight.
      trajectoryBasis: trajectory.trajectoryBasis ?? 'illustrative_chord_arc',
      visualApexM: apexM, visualLineWidthPx, displayPointsM: displayPoints.map(point => [point.x, point.y, point.z]),
    };
    count++;

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
      projection.userData = { trajectorySource: trajectory.source, estimated: trajectory.source === 'reconstruction_display_estimate', shotNumber: trajectory.shotNumber,
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
    origin.userData = { trajectorySource: trajectory.source, estimated: trajectory.source === 'reconstruction_display_estimate', shotNumber: trajectory.shotNumber, kind: 'origin_marker' };
    group.add(origin); geometries.push(originGeometry); materials.push(originMaterial);
    // §58: a subtle ground contact under the pearl so it sits on the turf
    // instead of floating; a flat disc, not a sun shadow.
    const contactGeometry = new CircleGeometry(originRadius * 1.45, 18);
    const contactMaterial = new MeshBasicMaterial({ color: '#14261B', transparent: true, opacity: active ? .3 : .18,
      depthTest: true, depthWrite: false, toneMapped: false });
    const contact = new Mesh(contactGeometry, contactMaterial);
    contact.name = `illustrative-shot-origin-contact-${trajectory.shotNumber}`;
    contact.position.copy(groundPoints[0]!); contact.position.z -= markerGroundOffsetM * .5;
    contact.renderOrder = 2;
    contact.userData = { shotNumber: trajectory.shotNumber, kind: 'origin_ground_contact' };
    group.add(contact); geometries.push(contactGeometry); materials.push(contactMaterial);

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
    finish.userData = { trajectorySource: trajectory.source, estimated: trajectory.source === 'reconstruction_display_estimate', shotNumber: trajectory.shotNumber,
      kind: 'estimated_finish_marker', groundOffsetM: markerGroundOffsetM };
    group.add(finish); geometries.push(finishGeometry); materials.push(finishMaterial);
  }
  for (const track of scene.illustrativePuttingTracks ?? []) {
    const minimumPoints = track.kind === 'surface_roll' ? 2 : 1;
    if (track.source !== 'interactive_preview_fixture' || track.pointsM.length < minimumPoints) continue;
    const ground = track.pointsM.map(point => displayGroundZ(mesh, point, camera, surface));
    if (ground.some(height => height == null)) continue;
    const active = track.shotNumber === activeShotNumber;
    const points = track.pointsM.map((point, index) => new Vector3(point[0], point[1], ground[index]! + markerGroundOffsetM));
    const markerRadius = displayMarkerScale(camera, active ? 3.35 : 2.65);
    const addBall = (point: Vector3, name: string, kind: string) => {
      const ringGeometry = new TorusGeometry(markerRadius * 1.36, Math.max(.09, markerRadius * .15), 8, 20);
      const ringMaterial = new MeshBasicMaterial({ color: '#1B3624', transparent: true, opacity: active ? .88 : .55,
        depthTest: true, depthWrite: false, toneMapped: false });
      const ring = new Mesh(ringGeometry, ringMaterial);
      ring.name = `${name}-halo`; ring.position.copy(point); ring.position.z += .012; ring.renderOrder = 4;
      group.add(ring); geometries.push(ringGeometry); materials.push(ringMaterial);
      const ballGeometry = new SphereGeometry(markerRadius, 14, 10);
      const ballMaterial = new MeshBasicMaterial({ color: active ? '#FFFDF7' : '#D7E1D2', transparent: !active,
        opacity: active ? 1 : .72, depthTest: true, depthWrite: false, toneMapped: false });
      const ball = new Mesh(ballGeometry, ballMaterial);
      ball.name = name; ball.position.copy(point); ball.position.z += markerRadius * .72; ball.renderOrder = 5;
      ball.userData = { trajectorySource: 'interactive_preview_fixture', shotNumber: track.shotNumber, kind,
        positionEvidence: 'distance_derived_fixture_estimate' };
      group.add(ball); geometries.push(ballGeometry); materials.push(ballMaterial);
    };
    if (track.kind === 'surface_roll') {
      const length = horizontalLength(track.pointsM);
      if (!Number.isFinite(length) || length < .01) continue;
      const curve = new CatmullRomCurve3(points, false, 'centripetal');
      // Ground rolls need a crisp, phone-readable white core. This remains
      // much thinner than an airborne trace but is no longer subpixel at a
      // whole-green fit.
      const radiusM = Math.max(.12, Math.min(.28, .82 / camera.scale)) * (active ? 1 : .8);
      const haloGeometry = new TubeGeometry(curve, Math.max(12, (points.length - 1) * 5), radiusM * 2.25, 6, false);
      const haloMaterial = new MeshBasicMaterial({ color: '#193425', transparent: true, opacity: active ? .62 : .38,
        depthTest: true, depthWrite: false, toneMapped: false });
      const halo = new Mesh(haloGeometry, haloMaterial);
      halo.name = `illustrative-putting-roll-halo-${track.shotNumber}`; halo.renderOrder = 3;
      group.add(halo); geometries.push(haloGeometry); materials.push(haloMaterial);
      const rollGeometry = new TubeGeometry(curve, Math.max(12, (points.length - 1) * 5), radiusM, 6, false);
      const rollMaterial = new MeshBasicMaterial({ color: active ? '#FFFDF7' : '#DCE6D8', transparent: !active,
        opacity: active ? 1 : .64, depthTest: true, depthWrite: false, toneMapped: false });
      const roll = new Mesh(rollGeometry, rollMaterial);
      roll.name = `illustrative-putting-roll-${track.shotNumber}`; roll.renderOrder = 4;
      roll.userData = { trajectorySource: 'interactive_preview_fixture', shotNumber: track.shotNumber,
        kind: 'estimated_surface_roll', visualRadiusM: radiusM, positionEvidence: 'distance_derived_fixture_estimate' };
      group.add(roll); geometries.push(rollGeometry); materials.push(rollMaterial);
      addBall(points[0]!, `illustrative-putting-roll-start-${track.shotNumber}`, 'estimated_roll_start');
      addBall(points.at(-1)!, `illustrative-putting-ball-${track.shotNumber}`, 'estimated_roll_leave');
    } else addBall(points[0]!, `illustrative-putting-ball-${track.shotNumber}`, 'estimated_current_ball');
    puttingCount++;
  }
  group.userData = { kind: 'display_trajectory_group', count, puttingCount };
  return { group, count, puttingCount, setResolution(width, height) {
    for (const material of lineMaterials) material.resolution.set(Math.max(1, width), Math.max(1, height));
  }, dispose() {
    group.removeFromParent(); group.clear();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  } };
}
