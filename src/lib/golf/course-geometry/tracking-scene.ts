import type { ShotRecord } from '@/lib/types/golf';
import type { ContextLayer } from './context-layer';
import { buildHoleScene } from './build-scene';
import { decorateSceneWithDisplayTrajectories } from './display-trajectories';
import { normalizeLiveShot } from './normalize';
import type { CourseGeometryPackage, HoleScene } from './types';
import type { TerrainMesh } from './terrain';

/** Read-only scene inputs owned by the tracker. This boundary guarantees that
 * display decoration cannot enter the shot-saving path. */
export interface TrackingGeometry {
  package: CourseGeometryPackage;
  holeKeys: readonly string[];
  terrainByHole?: Readonly<Record<string, TerrainMesh>>;
  /** Outside-world context zones, hash-locked to `package` (display only). */
  contextLayer?: ContextLayer;
  /** Test/demo-only display decoration. Production scenes already receive the
   * evidence-aware adapter below. */
  decorateScene?: (scene: HoleScene, shots: readonly ShotRecord[]) => HoleScene;
}

export function buildTrackingHoleScene(geometry: TrackingGeometry | undefined, holeIndex: number,
  shots: readonly ShotRecord[]): HoleScene | null {
  const holeKey = geometry?.holeKeys[holeIndex];
  if (!geometry || !holeKey) return null;
  try {
    const scene = buildHoleScene(geometry.package, holeKey, shots.map(normalizeLiveShot), geometry.terrainByHole?.[holeKey], geometry.contextLayer);
    const decorated = decorateSceneWithDisplayTrajectories(scene);
    return geometry.decorateScene?.(decorated, shots) ?? decorated;
  } catch {
    // Course presentation is optional and must never block shot entry/saving.
    return null;
  }
}
