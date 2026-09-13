import type { Point3M, TerrainCamera } from './terrain';

/** Camera updates are presentation-only and do not enter React's shot state.
 * The GPU surface and its evidence overlay are painted by this one controller. */
export interface TerrainRuntimeController {
  setCamera(camera: TerrainCamera, width: number, height: number): void;
  /** Read-only terrain inspection; never records a ball, pin or edited source. */
  pick(screenX: number, screenY: number): Point3M | null;
}
