import { checkedAnchor, checkedConnection, checkedRegions } from './quality';
import { selectedShotFocus, type SelectedShotFocus } from './selected-shot-focus';
import type { HoleScene, LocalFeature, PointM } from './types';

export type ShotCameraFraming = 'tee_to_landing' | 'ball_to_green' | 'around_green' | 'whole_green';

/** Meridian §62: the camera's fit for a selected shot. Every point here is an
 * already-accepted display anchor, a reviewed feature outline or a sampled
 * feasible cell; the target never manufactures a ball location. */
export interface ShotCameraTarget {
  shotNumber: number;
  framing: ShotCameraFraming;
  /** The point the camera settles on (display-only; see `basis`). */
  targetM: PointM;
  basis: SelectedShotFocus['basis'];
  /** Points the viewport should keep on screen (start, finish, region
   * extents, the green complex, nearby hazards, by framing rule). */
  fitPointsM: PointM[];
  /** Bearing from start to finish in degrees (0 = +y, clockwise), when a
   * start is known; a perspective preset may prefer looking along it. */
  preferredBearingDeg: number | null;
  /** Fallback magnification when the consumer cannot fit `fitPointsM`. */
  zoom: number;
  /** Which fit inputs were present, for telemetry and tests. */
  inputs: { start: boolean; finish: boolean; region: boolean; green: boolean; hazards: number };
}

const GREEN_NEAR_M = 45, APPROACH_MIN_M = 60, HAZARD_REACH_M = 30;

function ringPoints(feature: LocalFeature): PointM[] { return feature.parts.flatMap(rings => rings[0] ?? []); }
function bbox(points: readonly PointM[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return [minX, minY, maxX, maxY];
}
function corners(points: readonly PointM[]): PointM[] {
  if (!points.length) return [];
  const [minX, minY, maxX, maxY] = bbox(points);
  return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
}
function distanceToPoints(point: PointM, points: readonly PointM[]): number {
  return points.reduce((min, p) => Math.min(min, Math.hypot(p[0] - point[0], p[1] - point[1])), Infinity);
}

/**
 * Derives the honest camera fit for a selected shot (§62). Rules:
 * tee shot → tee to landing area; approach → ball to green complex; around
 * the green → ball plus green plus the bunkers/water beside it; putt → the
 * whole green. Unknown or candidate-only positions return null so the camera
 * never moves toward a guessed location.
 */
export function deriveShotCameraTarget(scene: HoleScene, shotNumber: number | undefined): ShotCameraTarget | null {
  const focus = selectedShotFocus(scene, shotNumber);
  if (!focus || shotNumber == null) return null;
  const greens = scene.features.filter(feature => feature.kind === 'green' && feature.reviewed);
  const greenPoints = greens.flatMap(ringPoints);
  const index = scene.events.findIndex(event => event.evidence.shotNumber === shotNumber);
  const event = index >= 0 ? scene.events[index] : undefined;
  const trajectory = scene.illustrativePreviewTrajectories?.find(item => item.shotNumber === shotNumber && item.pointsM.length >= 2);
  const finish: PointM | null = trajectory ? [...trajectory.pointsM.at(-1)!] as PointM : event ? checkedAnchor(event, scene.features) : null;
  let start: PointM | null = trajectory ? [...trajectory.pointsM[0]!] as PointM : null;
  if (!start && event) {
    const connection = checkedConnection(event, scene.events[index - 1], scene.features);
    if (connection) start = [...connection.fromM] as PointM;
    else if (event.evidence.shotType === 'tee') {
      const route = scene.features.find(feature => feature.id === scene.hole.routeFeatureId && feature.kind === 'route')?.parts[0]?.[0];
      if (route?.[0]) start = [...route[0]] as PointM;
    }
  }
  const regionPoints = event ? checkedRegions(event, scene.features).flatMap(region => region.cells.flatMap(cell =>
    [[cell.centerM[0] - cell.radiusM, cell.centerM[1] - cell.radiusM], [cell.centerM[0] + cell.radiusM, cell.centerM[1] + cell.radiusM]] as PointM[])) : [];
  const shotType = event?.evidence.shotType ?? (trajectory ? (shotNumber === 1 ? 'tee' : 'approach') : null);
  const anchor = finish ?? focus.pointM;
  const nearGreen = greenPoints.length > 0 && distanceToPoints(anchor, greenPoints) <= GREEN_NEAR_M;
  const startToGreen = start && greenPoints.length ? distanceToPoints(start, greenPoints) : Infinity;
  let framing: ShotCameraFraming;
  if (shotType === 'putting') framing = 'whole_green';
  else if (shotType === 'tee' && !nearGreen) framing = 'tee_to_landing';
  else if (nearGreen && startToGreen <= APPROACH_MIN_M) framing = 'around_green';
  else framing = greenPoints.length ? 'ball_to_green' : 'tee_to_landing';
  const hazards = framing === 'around_green'
    ? [...scene.features, ...(scene.contextFeatures ?? [])].filter(feature => (feature.kind === 'bunker' || feature.kind === 'water') &&
      distanceToPoints(anchor, ringPoints(feature)) <= HAZARD_REACH_M)
    : [];
  const fit: PointM[] = [];
  if (framing === 'whole_green') fit.push(...corners(greenPoints));
  else {
    if (start) fit.push(start);
    fit.push(anchor, ...corners(regionPoints));
    if (framing !== 'tee_to_landing') fit.push(...corners(greenPoints));
    for (const hazard of hazards) fit.push(...corners(ringPoints(hazard)));
  }
  const bearing = start && finish ? ((Math.atan2(finish[0] - start[0], finish[1] - start[1]) * 180) / Math.PI + 360) % 360 : null;
  return { shotNumber, framing, targetM: [...focus.pointM] as PointM, basis: focus.basis, fitPointsM: fit,
    preferredBearingDeg: bearing, zoom: focus.zoom,
    inputs: { start: !!start, finish: !!finish, region: regionPoints.length > 0, green: greenPoints.length > 0, hazards: hazards.length } };
}
