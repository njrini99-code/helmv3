export interface CameraMotionState {
  zoom: number;
  pan: { x: number; y: number };
}

/** Cubic-out interpolation used only for camera presentation. World geometry,
 * shot evidence, and measured terrain values are never interpolated here. */
export function interpolateCameraMotion<T extends CameraMotionState>(from: T, to: T, progress: number): T {
  const t = Math.max(0, Math.min(1, progress));
  const eased = 1 - (1 - t) ** 3;
  return {
    ...to,
    zoom: from.zoom + (to.zoom - from.zoom) * eased,
    pan: {
      x: from.pan.x + (to.pan.x - from.pan.x) * eased,
      y: from.pan.y + (to.pan.y - from.pan.y) * eased,
    },
  };
}
