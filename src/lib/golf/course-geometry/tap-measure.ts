import { terrainHeight, type Point3M } from './terrain';
import type { SceneMarker, SceneMarkerLink, SceneMarkers } from './scene-markers';
import type { HoleScene, PointM } from './types';

/** Tap-to-measure (on-course ask, 2026-09-17: "enter the 3D, tap an area on
 * the fairway and it tells you how many yards it is from where you are").
 *
 * A measurement is a read-only ruler between where the player is and a
 * ground point they tapped. It never records a ball, a pin or a shot, and it
 * never invents a position: the origin is the best position the round
 * actually holds, named on the chip so the number is never mistaken for a
 * GPS reading when it is not one. */
export type MeasureBasis = 'you' | 'ball' | 'last_shot' | 'tee';
export interface MeasureOrigin { pointM: PointM; basis: MeasureBasis }
export interface TapMeasurement {
  pointM: PointM;
  origin: MeasureOrigin;
  /** Horizontal distance (metres), the number a golfer plays to. */
  distanceM: number;
  yards: number;
  /** Ground rise from the origin to the tapped point; null where either has no terrain. */
  elevationDeltaM: number | null;
}
const YARDS_PER_METRE = 1.0936133;
export const MEASURE_MARKER_KEY = 'tap-measure';
export const MEASURE_LINK_KEY = 'tap-measure-link';
export const MEASURE_ORIGIN_COPY: Record<MeasureBasis, string> = { you: 'from you', ball: 'from your ball', last_shot: 'from your last shot', tee: 'from the tee' };

/** Where "you" are, in this order: the live device (YOU, fresh or stale), the
 * newest asserted mark (BALL), the newest resolved shot position of a typed
 * round, else the tee of the hole. Null when the hole has no route either. */
export function measureOrigin(scene: HoleScene | null | undefined, markers: SceneMarkers | null | undefined): MeasureOrigin | null {
  const list = markers?.markers ?? [];
  const player = list.find(m => m.kind === 'player');
  if (player) return { pointM: player.pointM, basis: 'you' };
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]!;
    if (m.kind === 'ball' || m.kind === 'anchor' || m.kind === 'terminal') return { pointM: m.pointM, basis: 'ball' };
  }
  if (scene) {
    for (let i = scene.events.length - 1; i >= 0; i--) {
      const anchor = scene.events[i]!.anchorM;
      if (anchor && scene.events[i]!.placement === 'compatible_estimate') return { pointM: anchor, basis: 'last_shot' };
    }
    const route = scene.features.find(f => f.id === scene.hole.routeFeatureId)?.parts[0]?.[0];
    const tee = route?.[0];
    if (tee) return { pointM: [tee[0], tee[1]], basis: 'tee' };
  }
  return null;
}

export function measureTap(scene: HoleScene | null | undefined, markers: SceneMarkers | null | undefined, ground: Point3M): TapMeasurement | null {
  const origin = measureOrigin(scene, markers);
  if (!origin || ![ground[0], ground[1]].every(Number.isFinite)) return null;
  const pointM: PointM = [ground[0], ground[1]];
  const distanceM = Math.hypot(pointM[0] - origin.pointM[0], pointM[1] - origin.pointM[1]);
  const originZ = scene?.terrain ? terrainHeight(scene.terrain, origin.pointM) : null;
  const elevationDeltaM = originZ != null && Number.isFinite(ground[2]) ? ground[2] - originZ : null;
  return { pointM, origin, distanceM, yards: Math.round(distanceM * YARDS_PER_METRE), elevationDeltaM };
}

/** The ruler as scene markers: a dashed ground link from the origin and a
 * labelled point at the tap. The origin's own marker (YOU, BALL) is already
 * drawn by the round; nothing is added there. */
export function measureMarkers(base: SceneMarkers | null | undefined, measurement: TapMeasurement | null): SceneMarkers | null | undefined {
  if (!measurement) return base;
  const marker: SceneMarker = { key: MEASURE_MARKER_KEY, kind: 'measure', pointM: measurement.pointM, sigmaM: 0, label: `${measurement.yards} yd` };
  const link: SceneMarkerLink = { key: MEASURE_LINK_KEY, fromM: measurement.origin.pointM, toM: measurement.pointM, basis: 'surface_connector', dashed: true, opacity: .9 };
  return { markers: [...(base?.markers ?? []), marker], links: [...(base?.links ?? []), link], rippleKey: base?.rippleKey };
}

/** What follows the yardage on the chip: the ground rise when there is one, then the origin. */
export function measureDetail(measurement: TapMeasurement): string {
  const feet = measurement.elevationDeltaM == null ? 0 : Math.round(measurement.elevationDeltaM * 3.28084);
  const rise = Math.abs(feet) >= 1 ? ` · ${feet > 0 ? '↑' : '↓'} ${Math.abs(feet)} ft` : '';
  return `${rise} · ${MEASURE_ORIGIN_COPY[measurement.origin.basis]}`;
}
export function measureCaption(measurement: TapMeasurement): string {
  return `${measurement.yards} yd${measureDetail(measurement)}`;
}
