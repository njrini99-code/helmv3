import { Matrix4, OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3, type Camera, type Mesh } from 'three';
import { projectTerrainPoint, terrainHeight, type Point3M, type TerrainCamera, type TerrainMesh } from './terrain';

/** A renderer-only elevation. Never use this value for distances or statistics. */
export function displayTerrainPoint(point: Point3M, source: TerrainCamera): Point3M {
  return [point[0], point[1], source.referenceElevationM +
    (point[2] - source.referenceElevationM) * source.exaggeration];
}

export type TerrainThreeCamera = OrthographicCamera | PerspectiveCamera;

/** Set Three's real camera to the existing metric projector.
 * Its explicit orthonormal basis also works at exactly Top (no lookAt pole).
 * Landscape vertices already contain displayed Z, so no extra Z scaling is
 * applied here. The off-centre frustum preserves pan and HUD-safe fitting:
 * an orthographic camera slides its box; a perspective camera uses a shift
 * lens whose principal point is the projector's `translation` (Meridian §10). */
export function applyTerrainCamera(target: TerrainThreeCamera, source: TerrainCamera,
  width: number, height: number, distance = 10_000): void {
  if (![width, height, distance, source.scale].every(Number.isFinite) ||
    width <= 0 || height <= 0 || distance <= 1 || source.scale <= 0) throw new Error('Invalid Three camera');
  const r = source.right, u = source.up, f = source.forward;
  const rotation = new Matrix4().makeBasis(new Vector3(...r), new Vector3(...u), new Vector3(-f[0], -f[1], -f[2]));
  target.quaternion.setFromRotationMatrix(rotation);
  target.up.set(...u);
  target.zoom = 1;
  if (source.projection === 'perspective') {
    if (!(target instanceof PerspectiveCamera) || !source.eyeM || !source.focalPx) throw new Error('Invalid Three camera');
    const eye = source.eyeM, focal = source.focalPx, [px, py] = source.translation;
    const eyeDistance = Math.hypot(...([0, 1, 2] as const).map(i => eye[i] - source.focusM[i]));
    const near = Math.max(.5, Math.min(eyeDistance * .01, 4)), far = Math.max(distance * 2, eyeDistance * 8);
    target.position.set(eye[0], eye[1], eye[2]);
    target.near = near; target.far = far; target.aspect = width / height;
    target.fov = source.fovDegrees ?? 2 * Math.atan(height / 2 / focal) * 180 / Math.PI;
    // Near-plane extents from the principal point: a CSS pixel at the near
    // plane covers near/focal metres. Left/bottom are negative distances.
    const k = near / focal;
    target.projectionMatrix.makePerspective(-px * k, (width - px) * k, py * k, (py - height) * k, near, far);
    target.projectionMatrixInverse.copy(target.projectionMatrix).invert();
    target.updateMatrixWorld(true);
    return;
  }
  if (!(target instanceof OrthographicCamera)) throw new Error('Invalid Three camera');
  const focus = displayTerrainPoint(source.focusM, source);
  const [screenX, screenY] = projectTerrainPoint(source.focusM, source);
  const panX = screenX - width / 2, panY = screenY - height / 2;
  target.left = (-width / 2 - panX) / source.scale;
  target.right = (width / 2 - panX) / source.scale;
  target.top = (height / 2 + panY) / source.scale;
  target.bottom = (-height / 2 + panY) / source.scale;
  target.near = .1; target.far = distance * 2;
  target.position.set(focus[0] - f[0] * distance, focus[1] - f[1] * distance, focus[2] - f[2] * distance);
  target.updateProjectionMatrix();
  target.updateMatrixWorld(true);
}

/** Terrain-only picking returns canonical source elevation, never exaggerated
 * Z or a tree/crown intersection. It has no persistence or input-state effect. */
export function pickTerrainPoint(terrain: Mesh, camera: Camera, mesh: TerrainMesh,
  x: number, y: number, width: number, height: number, raycaster = new Raycaster()): Point3M | null {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 ||
    x < 0 || x > width || y < 0 || y > height) return null;
  raycaster.setFromCamera(new Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
  terrain.updateWorldMatrix(true, false);
  const intersection = raycaster.intersectObject(terrain, false)[0];
  if (!intersection) return null;
  const point = intersection.point;
  const z = terrainHeight(mesh, [point.x, point.y]);
  return z == null ? null : [point.x, point.y, z];
}
