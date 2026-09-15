import { checkedAnchor, checkedConnection } from './quality';
import type { HoleScene, PointM } from './types';

export interface SelectedShotFocus {
  pointM: PointM;
  /** Camera-only display source. It never changes shot evidence or metrics. */
  basis: 'illustrative_preview' | 'reconstruction_display_estimate' | 'compatible_estimate' | 'inferred_connection';
  /** Later selected shots move in gradually without cropping away their arc. */
  zoom: number;
}

/**
 * Finds an honest camera target for a selected shot. Preview trajectories are
 * explicitly display-only; otherwise an already-validated display anchor or
 * connection can be used. Unknown/candidate-only positions return null rather
 * than manufacturing a ball location just to move the camera.
 */
export function selectedShotFocus(scene: HoleScene, shotNumber: number | undefined): SelectedShotFocus | null {
  if (shotNumber == null || !Number.isInteger(shotNumber) || shotNumber < 1) return null;
  const selected = shotNumber;
  const trajectory = scene.illustrativePreviewTrajectories?.find(item => item.shotNumber === selected &&
    item.pointsM.length >= 2 &&
    item.pointsM.every(point => point.every(Number.isFinite)));
  if (trajectory) {
    // Bias toward the finish, while retaining enough launch context to keep
    // the selected arc intelligible in Side view.
    const pointM = trajectory.pointsM[Math.round((trajectory.pointsM.length - 1) * .68)]!;
    return { pointM: [...pointM] as PointM,
      basis: trajectory.source === 'reconstruction_display_estimate' ? 'reconstruction_display_estimate' : 'illustrative_preview',
      zoom: Math.min(1.48, 1.06 + Math.max(0, selected - 1) * .1) };
  }
  const index = scene.events.findIndex(event => event.evidence.shotNumber === selected);
  if (index < 0) return null;
  const event = scene.events[index]!;
  const anchor = checkedAnchor(event, scene.features);
  if (anchor) return { pointM: [...anchor] as PointM, basis: 'compatible_estimate', zoom: 1.16 };
  const connection = checkedConnection(event, scene.events[index - 1], scene.features);
  if (connection) return { pointM: [...connection.toM] as PointM, basis: 'inferred_connection', zoom: 1.12 };
  return null;
}
