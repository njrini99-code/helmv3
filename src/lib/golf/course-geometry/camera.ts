import type { HoleScene, PointM } from './types';
import { fitCamera } from './project';

export type CourseView = 'hole' | 'approach' | 'green';
export type SceneView = CourseView | 'putting';

/** A view of physical context, independent of entered distances or endpoints. */
export function contextPoints(scene: HoleScene, view: CourseView): readonly PointM[] {
  const all = scene.features.filter(f => f.kind !== 'woods').flatMap(f => f.parts.flat(2));
  const green = scene.features.find(f => f.id === scene.hole.greenFeatureId);
  if (view === 'hole' || !green) return all;
  const points = green.parts.flat(2);
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const center: PointM = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const radius = view === 'green' ? 45 : 140;
  // Include nearby accepted features in full; crop the display, never change
  // the canonical rings or claim that the crop locates the player.
  const nearby = scene.features.filter(f => f.kind === 'bunker' &&
    f.parts.flat(2).some(p => Math.hypot(p[0] - center[0], p[1] - center[1]) <= radius));
  const fit: PointM[] = [...points, ...nearby.flatMap(f => f.parts.flat(2))];
  if (view === 'approach') {
    const route = scene.features.find(f => f.id === scene.hole.routeFeatureId)?.parts[0]?.[0] ?? [];
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!, b = route[i]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10));
      for (let j = 0; j <= steps; j++) {
        const p: PointM = [a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps];
        if (Math.hypot(p[0] - center[0], p[1] - center[1]) <= radius) fit.push(p);
      }
    }
  }
  // Display padding is applied after rotation. A second geographic bounding
  // box would add empty diagonal corners and shrink this detail needlessly.
  return fit;
}

export function contextCamera(scene: HoleScene, width: number, height: number, view: CourseView, padding = 12) {
  const points = contextPoints(scene, view);
  let angle = scene.orientationRadians;
  if (view === 'hole') {
    const route = scene.features.find(f => f.id === scene.hole.routeFeatureId)?.parts[0]?.[0];
    if (route && route.length > 1) {
      const first = route[0]!, last = route.at(-1)!;
      const up = Math.PI / 2 - Math.atan2(last[1] - first[1], last[0] - first[0]);
      let best = 0;
      // Stable for a given viewport, tee below/left. Rotation only, no mirror.
      for (let degrees = -80; degrees <= -10; degrees += 2) {
        const candidate = up + degrees * Math.PI / 180;
        const scale = fitCamera(points, width, height, candidate, padding).scale;
        if (scale > best) { best = scale; angle = candidate; }
      }
    }
  }
  return fitCamera(points, width, height, angle, padding);
}

export function entryView(shotType: string): SceneView {
  return shotType === 'putting' ? 'putting' : shotType === 'around_green' ? 'green' : shotType === 'approach' ? 'approach' : 'hole';
}
