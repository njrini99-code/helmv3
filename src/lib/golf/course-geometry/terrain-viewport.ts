import type { CourseView } from './camera';
import type { HoleScene, PointM } from './types';
import { fitTerrainCamera, type TerrainCamera, type TerrainFitProfile, type TerrainMesh, type TerrainPose } from './terrain';

/** CSS-pixel safe region for the floating header and 64px right control rail.
 * The normal-flow inspector's measured size is already excluded here. Reserve
 * the rail for the whole fit so a baseline tee or green cannot hide under it;
 * a user's deliberate pan/zoom is never clamped back to this default crop. */
export function fitTerrainViewportCamera(scene: HoleScene, mesh: TerrainMesh, view: CourseView,
  width: number, height: number, pose: TerrainPose, zoom = 1, pan: PointM = [0, 0], fitPreset: TerrainFitProfile = 'top'): TerrainCamera {
  const left = 12, right = 64, top = Math.min(88, height * .24), bottom = 24;
  const safeWidth = width - left - right, safeHeight = height - top - bottom;
  const camera = fitTerrainCamera(scene, mesh, view, safeWidth, safeHeight, pose, zoom, pan, fitPreset);
  const matrix = [...camera.matrix], rx = safeWidth / width, ry = safeHeight / height;
  if (camera.projection === 'perspective') {
    // Homogeneous clip: an NDC offset must scale with w (the depth row), so the
    // x/y rows take rx·row + offset·wRow. The orthographic branch below is the
    // same identity with w ≡ 1, kept verbatim so Top output does not change.
    const ox = rx - 1 + 2 * left / width, oy = 1 - ry - 2 * top / height;
    for (const column of [0, 4, 8, 12]) {
      matrix[column] = matrix[column]! * rx + ox * matrix[column + 3]!;
      matrix[column + 1] = matrix[column + 1]! * ry + oy * matrix[column + 3]!;
    }
  } else {
    for (const i of [0, 4, 8]) matrix[i] = matrix[i]! * rx;
    for (const i of [1, 5, 9]) matrix[i] = matrix[i]! * ry;
    matrix[12] = (matrix[12]! + 1) * rx - 1 + 2 * left / width;
    matrix[13] = (matrix[13]! - 1) * ry + 1 - 2 * top / height;
  }
  return { ...camera, matrix, translation: [camera.translation[0] + left, camera.translation[1] + top],
    ...(camera.framing ? { framing: { ...camera.framing,
      baselineBoundsPx: { ...camera.framing.baselineBoundsPx, x: camera.framing.baselineBoundsPx.x + left, y: camera.framing.baselineBoundsPx.y + top },
      occupancy: { width: camera.framing.baselineBoundsPx.width / width, height: camera.framing.baselineBoundsPx.height / height,
        area: camera.framing.baselineBoundsPx.width * camera.framing.baselineBoundsPx.height / (width * height) } } } : {}) };
}
